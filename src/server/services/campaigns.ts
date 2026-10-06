import { z } from 'zod';
import { addHours, startOfDay } from 'date-fns';
import type { Campaign, CampaignStep, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { clientFilter, assertClientAccess, type AccessContext } from '@/server/access/scope';
import { DomainError, NotFoundError } from '@/server/errors';
import { isWithinWindow, nextWindowOpening, jitter, type SendWindow } from './schedule';
import { logActivity } from './activity';
import { findSuppression } from './suppression';
import { CLAIM_TYPES } from '@/lib/domain';

export const campaignStepSchema = z.object({
  order: z.number().int().min(0).max(9),
  delayHours: z.number().int().min(0).max(24 * 180),
  purpose: z.string().trim().min(1).max(60),
  instructions: z.string().trim().min(1).max(2000),
  stopOnReply: z.boolean().default(true),
});
export type CampaignStepInput = z.infer<typeof campaignStepSchema>;

export const campaignInputSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  icpId: z.string().uuid().nullish(),
  offerId: z.string().uuid().nullish(),
  playbookId: z.string().uuid().nullish(),
  objective: z.string().max(500).optional(),
  toneGuidelines: z.string().max(2000).optional(),
  bannedPhrases: z.array(z.string().max(80)).max(50).default([]),
  mailboxId: z.string().uuid().nullish(),
  timezone: z.string().max(60).nullish(),
  sendDays: z.array(z.number().int().min(1).max(7)).min(1).default([1, 2, 3, 4, 5]),
  sendStartHour: z.number().int().min(0).max(23).default(8),
  sendEndHour: z.number().int().min(1).max(24).default(16),
  dailyCap: z.number().int().min(1).max(500).default(30),
  approvalMode: z.enum(['REVIEW_ALL', 'AUTO_APPROVE_VERIFIED']).default('REVIEW_ALL'),
  autoApproveThreshold: z.number().min(0.5).max(1).default(0.92),
  approvedClaimTypes: z.array(z.enum(CLAIM_TYPES)).default([]),
  maxContactsPerAccount: z.number().int().min(1).max(5).default(1),
  callFollowUp: z.boolean().default(true),
  allowContextual: z.boolean().default(true),
  contextualDailyCap: z.number().int().min(0).max(200).default(10),
  steps: z.array(campaignStepSchema).max(8).default([]),
}).refine((c) => c.sendEndHour > c.sendStartHour, { message: 'The sending window must end after it starts.', path: ['sendEndHour'] });
export type CampaignInput = z.input<typeof campaignInputSchema>;

/**
 * The default sequence: introduction, follow-up, a different angle, and a
 * clean close. Delays are from the previous step: day 1, 3, 7, 14.
 */
export const DEFAULT_STEPS: CampaignStepInput[] = [
  {
    order: 0, delayHours: 0, purpose: 'introduction', stopOnReply: true,
    instructions: 'First contact. Lead with what is relevant to them — a verified fact or signal if there is one. One small ask.',
  },
  {
    order: 1, delayHours: 48, purpose: 'follow-up', stopOnReply: true,
    instructions: 'Short follow-up. Do not mention that they have not replied. Add one useful sentence about the offer. Two to four sentences.',
  },
  {
    order: 2, delayHours: 96, purpose: 'different angle', stopOnReply: true,
    instructions: 'Try a different angle from the first email: a different fact, signal or proof point. Shorter than the first.',
  },
  {
    order: 3, delayHours: 168, purpose: 'breakup', stopOnReply: true,
    instructions: 'Final message. Two or three sentences. Say you will stop reaching out, leave the door open, no guilt and no false scarcity.',
  },
];

/** Steps from a playbook's sequence template ({order, delayDays, purpose, instructions}). */
export function stepsFromPlaybook(template: unknown): CampaignStepInput[] {
  if (!Array.isArray(template)) return [];
  const parsed = template
    .map((s, i) => {
      const t = s as { delayDays?: number; purpose?: string; instructions?: string };
      if (!t?.purpose || !t?.instructions) return null;
      return {
        order: i,
        delayHours: Math.max(0, Math.round((t.delayDays ?? 0) * 24)),
        purpose: String(t.purpose).slice(0, 60),
        instructions: String(t.instructions).slice(0, 2000),
        stopOnReply: true,
      };
    })
    .filter((s): s is CampaignStepInput => !!s);
  return parsed.length ? parsed.map((s, i) => ({ ...s, order: i, delayHours: i === 0 ? 0 : s.delayHours })) : [];
}

export function windowFor(campaign: Pick<Campaign, 'sendDays' | 'sendStartHour' | 'sendEndHour' | 'timezone'>, fallbackTimezone: string): SendWindow {
  return {
    timezone: campaign.timezone ?? fallbackTimezone,
    days: campaign.sendDays,
    startHour: campaign.sendStartHour,
    endHour: campaign.sendEndHour,
  };
}

/** ICP, offer and playbook must belong to the campaign's client. */
async function assertLinksBelongToClient(organizationId: string, clientId: string, input: { icpId?: string | null; offerId?: string | null; playbookId?: string | null; mailboxId?: string | null }) {
  const [icp, offer, playbook, mailbox] = await Promise.all([
    input.icpId ? db.idealCustomerProfile.count({ where: { id: input.icpId, clientId } }) : 1,
    input.offerId ? db.offer.count({ where: { id: input.offerId, clientId } }) : 1,
    input.playbookId
      ? db.playbook.count({ where: { id: input.playbookId, organizationId, OR: [{ clientId }, { clientId: null }] } })
      : 1,
    input.mailboxId ? db.mailbox.count({ where: { id: input.mailboxId, organizationId } }) : 1,
  ]);
  if (!icp) throw new NotFoundError('Ideal customer profile');
  if (!offer) throw new NotFoundError('Offer');
  if (!playbook) throw new NotFoundError('Playbook');
  if (!mailbox) throw new NotFoundError('Mailbox');
}

export async function createCampaign(access: AccessContext, raw: CampaignInput) {
  const input = campaignInputSchema.parse(raw);
  assertClientAccess(access, input.clientId);
  await assertLinksBelongToClient(access.organizationId, input.clientId, input);

  const playbook = input.playbookId ? await db.playbook.findUnique({ where: { id: input.playbookId } }) : null;
  const steps = input.steps.length ? input.steps : stepsFromPlaybook(playbook?.sequenceTemplate);
  const approvedClaimTypes = input.approvedClaimTypes.length ? input.approvedClaimTypes : playbook?.approvedClaimTypes ?? [];

  const { steps: _ignored, ...rest } = input;
  void _ignored;
  return db.campaign.create({
    data: {
      ...rest,
      organizationId: access.organizationId,
      approvedClaimTypes,
      autoApproveThreshold: input.autoApproveThreshold ?? playbook?.autoApproveThreshold ?? 0.92,
      status: 'DRAFT',
      steps: { create: (steps.length ? steps : DEFAULT_STEPS).map((s, i) => ({ ...s, order: i })) },
    },
    include: { steps: { orderBy: { order: 'asc' } } },
  });
}

export async function findCampaign(access: AccessContext, id: string) {
  const campaign = await db.campaign.findFirst({ where: { id, ...clientFilter(access) } });
  if (!campaign) throw new NotFoundError('Campaign');
  return campaign;
}

export async function updateCampaign(access: AccessContext, id: string, raw: Partial<Omit<CampaignInput, 'clientId' | 'steps'>>) {
  const campaign = await findCampaign(access, id);
  const patch = z.object({
    name: z.string().trim().min(1).max(120).optional(),
    icpId: z.string().uuid().nullish(),
    offerId: z.string().uuid().nullish(),
    playbookId: z.string().uuid().nullish(),
    objective: z.string().max(500).optional(),
    toneGuidelines: z.string().max(2000).optional(),
    bannedPhrases: z.array(z.string().max(80)).max(50).optional(),
    mailboxId: z.string().uuid().nullish(),
    timezone: z.string().max(60).nullish(),
    sendDays: z.array(z.number().int().min(1).max(7)).min(1).optional(),
    sendStartHour: z.number().int().min(0).max(23).optional(),
    sendEndHour: z.number().int().min(1).max(24).optional(),
    dailyCap: z.number().int().min(1).max(500).optional(),
    approvalMode: z.enum(['REVIEW_ALL', 'AUTO_APPROVE_VERIFIED']).optional(),
    autoApproveThreshold: z.number().min(0.5).max(1).optional(),
    approvedClaimTypes: z.array(z.enum(CLAIM_TYPES)).optional(),
    maxContactsPerAccount: z.number().int().min(1).max(5).optional(),
    callFollowUp: z.boolean().optional(),
    allowContextual: z.boolean().optional(),
    contextualDailyCap: z.number().int().min(0).max(200).optional(),
  }).parse(raw);
  await assertLinksBelongToClient(access.organizationId, campaign.clientId, patch);
  const start = patch.sendStartHour ?? campaign.sendStartHour;
  const end = patch.sendEndHour ?? campaign.sendEndHour;
  if (end <= start) throw new DomainError('The sending window must end after it starts.');
  return db.campaign.update({ where: { id }, data: patch });
}

export async function replaceSteps(access: AccessContext, id: string, steps: CampaignStepInput[]) {
  const campaign = await findCampaign(access, id);
  if (campaign.status === 'ACTIVE') {
    throw new DomainError('Pause the campaign before changing its steps — people are mid-sequence.');
  }
  return db.$transaction(async (tx) => {
    await tx.campaignStep.deleteMany({ where: { campaignId: id } });
    return tx.campaign.update({
      where: { id },
      data: { steps: { create: steps.map((s, i) => ({ ...s, order: i, delayHours: i === 0 ? 0 : s.delayHours })) } },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
  });
}

// ---------------------------------------------------------------------------
// Enrollment
// ---------------------------------------------------------------------------

export interface EnrollResult {
  enrolled: number;
  skipped: Array<{ id: string; name: string; reason: string }>;
}

/**
 * Enrolls the best contacts at each account: highest contact score first,
 * up to the campaign's per-account limit, skipping anyone who cannot be
 * emailed or is already in an active sequence. Accounts that yield nobody are
 * reported with a reason rather than failing the batch.
 */
export async function enrollAccounts(access: AccessContext, campaignId: string, accountIds: string[]): Promise<EnrollResult> {
  const campaign = await findCampaign(access, campaignId);
  const accounts = await db.account.findMany({
    where: { id: { in: accountIds }, clientId: campaign.clientId, organizationId: access.organizationId, deletedAt: null },
    include: { contacts: { where: { deletedAt: null }, orderBy: { score: 'desc' } } },
  });
  const result: EnrollResult = { enrolled: 0, skipped: [] };
  const missing = accountIds.filter((id) => !accounts.some((a) => a.id === id));
  for (const id of missing) result.skipped.push({ id, name: 'Unknown account', reason: 'Not found for this client' });

  const picks: Array<{ accountId: string; contactId: string }> = [];
  for (const account of accounts) {
    if (account.doNotContact) { result.skipped.push({ id: account.id, name: account.name, reason: 'Account is do-not-contact' }); continue; }
    if (['WON', 'LOST', 'DISQUALIFIED'].includes(account.status)) {
      result.skipped.push({ id: account.id, name: account.name, reason: `Account is ${account.status.toLowerCase()}` });
      continue;
    }
    const chosen = await pickContacts(campaign, account.contacts);
    if (!chosen.length) { result.skipped.push({ id: account.id, name: account.name, reason: 'No contact who can be emailed' }); continue; }
    for (const c of chosen) picks.push({ accountId: account.id, contactId: c });
  }
  result.enrolled = await createEnrollments(access.organizationId, campaign, picks);
  return result;
}

async function pickContacts(
  campaign: Campaign,
  contacts: Array<{ id: string; email: string | null; doNotEmail: boolean; status: string }>,
): Promise<string[]> {
  const chosen: string[] = [];
  for (const c of contacts) {
    if (chosen.length >= campaign.maxContactsPerAccount) break;
    if (!c.email || c.doNotEmail || c.status !== 'ACTIVE') continue;
    const blocked = await findSuppression({ organizationId: campaign.organizationId, clientId: campaign.clientId, channel: 'EMAIL', email: c.email });
    if (blocked) continue;
    // One live sequence per person at a time, across campaigns.
    const active = await db.campaignEnrollment.count({
      where: { contactId: c.id, status: { in: ['PENDING', 'ACTIVE', 'PAUSED'] }, campaignId: { not: campaign.id } },
    });
    if (active) continue;
    chosen.push(c.id);
  }
  return chosen;
}

export async function enrollContacts(access: AccessContext, campaignId: string, contactIds: string[]): Promise<EnrollResult> {
  const campaign = await findCampaign(access, campaignId);
  const contacts = await db.contact.findMany({
    where: { id: { in: contactIds }, clientId: campaign.clientId, deletedAt: null },
    include: { account: { select: { name: true, doNotContact: true } } },
  });
  const result: EnrollResult = { enrolled: 0, skipped: [] };
  const picks: Array<{ accountId: string; contactId: string }> = [];
  for (const c of contacts) {
    const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || 'Contact';
    if (c.account.doNotContact) { result.skipped.push({ id: c.id, name, reason: 'Account is do-not-contact' }); continue; }
    const ok = await pickContacts({ ...campaign, maxContactsPerAccount: 1 }, [c]);
    if (!ok.length) { result.skipped.push({ id: c.id, name, reason: 'Cannot be emailed, or already in another sequence' }); continue; }
    picks.push({ accountId: c.accountId, contactId: c.id });
  }
  result.enrolled = await createEnrollments(access.organizationId, campaign, picks);
  return result;
}

async function createEnrollments(organizationId: string, campaign: Campaign, picks: Array<{ accountId: string; contactId: string }>) {
  if (!picks.length) return 0;
  const client = await db.client.findUniqueOrThrow({ where: { id: campaign.clientId }, select: { timezone: true } });
  const firstAction = nextWindowOpening(new Date(), windowFor(campaign, client.timezone));
  const created = await db.campaignEnrollment.createMany({
    data: picks.map((p) => ({
      organizationId,
      campaignId: campaign.id,
      accountId: p.accountId,
      contactId: p.contactId,
      status: campaign.status === 'ACTIVE' ? 'ACTIVE' as const : 'PENDING' as const,
      currentStep: 0,
      // Stagger the first action so a 200-contact enrollment doesn't try to
      // draft 200 emails in the same minute.
      nextActionAt: jitter(firstAction, Math.min(180, picks.length * 2)),
    })),
    skipDuplicates: true,
  });
  return created.count;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** Problems that stop a campaign from being activated, in plain language. */
export async function activationProblems(campaign: Campaign & { steps: CampaignStep[] }): Promise<string[]> {
  const problems: string[] = [];
  if (!campaign.steps.length) problems.push('Add at least one step.');
  if (!campaign.offerId && !campaign.offerBrief) problems.push('Choose the offer this campaign is about.');
  if (!campaign.mailboxId) problems.push('Choose a sending mailbox.');
  else {
    const mailbox = await db.mailbox.findUnique({ where: { id: campaign.mailboxId } });
    // Activating with an unauthenticated domain is the fastest way to burn it.
    if (mailbox && (!mailbox.spfVerified || !mailbox.dkimVerified)) {
      problems.push(`SPF and DKIM aren't verified for ${mailbox.fromEmail}. Sending before they are will hurt deliverability for every future email.`);
    }
  }
  if (campaign.approvalMode === 'AUTO_APPROVE_VERIFIED' && !campaign.approvedClaimTypes.length) {
    problems.push('Automatic sending needs at least one approved claim type — otherwise every personalized draft goes to review anyway.');
  }
  return problems;
}

export async function setCampaignStatus(
  access: AccessContext,
  campaignId: string,
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED',
) {
  const campaign = await db.campaign.findFirst({ where: { id: campaignId, ...clientFilter(access) }, include: { steps: true } });
  if (!campaign) throw new NotFoundError('Campaign');
  if (status === 'ACTIVE') {
    const problems = await activationProblems(campaign);
    if (problems.length) throw new DomainError(problems.join(' '));
  }

  return db.$transaction(async (tx) => {
    const updated = await tx.campaign.update({
      where: { id: campaignId },
      data: {
        status,
        startedAt: status === 'ACTIVE' && !campaign.startedAt ? new Date() : campaign.startedAt,
        completedAt: status === 'COMPLETED' ? new Date() : null,
      },
    });
    if (status === 'ACTIVE') {
      await tx.campaignEnrollment.updateMany({ where: { campaignId, status: { in: ['PENDING', 'PAUSED'] } }, data: { status: 'ACTIVE' } });
    }
    if (status === 'PAUSED' || status === 'ARCHIVED' || status === 'COMPLETED') {
      // Pausing must also freeze anything approved and waiting, or the pause
      // does nothing for the next few minutes.
      await tx.campaignEnrollment.updateMany({ where: { campaignId, status: 'ACTIVE' }, data: { status: 'PAUSED' } });
      await tx.message.updateMany({ where: { campaignId, status: 'SCHEDULED' }, data: { status: 'APPROVED', scheduledFor: null } });
    }
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Stop conditions
// ---------------------------------------------------------------------------

const PENDING_MESSAGES = ['GENERATING', 'DRAFT', 'NEEDS_EDIT', 'APPROVED', 'SCHEDULED'] as const;

/**
 * Stops sequences. A reply stops every sequence at the account — once someone
 * at a company has answered, nobody else there should get a follow-up. A
 * bounce or opt-out stops only that person.
 */
export async function exitEnrollment(params: {
  accountId?: string;
  contactId?: string;
  reason: 'REPLIED' | 'BOUNCED' | 'OPTED_OUT' | 'REMOVED';
  note?: string;
}) {
  const where: Prisma.CampaignEnrollmentWhereInput = {
    status: { in: ['PENDING', 'ACTIVE', 'PAUSED'] },
    ...(params.accountId ? { accountId: params.accountId } : { contactId: params.contactId }),
  };
  const enrollments = await db.campaignEnrollment.findMany({ where, select: { id: true, contactId: true } });
  if (!enrollments.length) return { exited: 0 };

  const contactIds = enrollments.map((e) => e.contactId).filter((x): x is string => !!x);
  await db.$transaction([
    db.campaignEnrollment.updateMany({
      where: { id: { in: enrollments.map((e) => e.id) } },
      data: { status: params.reason, exitReason: params.note ?? params.reason, nextActionAt: null, completedAt: new Date() },
    }),
    // Anything queued is cancelled. A follow-up that lands after someone has
    // already replied is the most damaging mistake this system could make.
    db.message.updateMany({
      where: {
        direction: 'OUTBOUND',
        status: { in: [...PENDING_MESSAGES] },
        ...(params.accountId ? { accountId: params.accountId } : { contactId: { in: contactIds } }),
      },
      data: { status: 'CANCELLED', failureReason: `Sequence stopped: ${params.reason.toLowerCase()}` },
    }),
    ...(params.accountId ? [db.account.update({ where: { id: params.accountId }, data: { nextFollowUpAt: null } })] : []),
  ]);
  return { exited: enrollments.length };
}

/** Per-campaign daily budget, checked before drafting the next step. */
export async function remainingDailyCapacity(campaign: Campaign) {
  const today = startOfDay(new Date());
  const [drafted, contextual] = await Promise.all([
    // Count drafts created today, not just sends: drafting is where the cap
    // has to bite, or a busy day queues tomorrow's volume into review.
    db.message.count({ where: { campaignId: campaign.id, direction: 'OUTBOUND', createdAt: { gte: today }, status: { not: 'CANCELLED' } } }),
    db.message.count({ where: { campaignId: campaign.id, personalizationTier: 'CONTEXTUAL', createdAt: { gte: today }, status: { not: 'CANCELLED' } } }),
  ]);
  return {
    total: Math.max(0, campaign.dailyCap - drafted),
    contextual: Math.max(0, campaign.contextualDailyCap - contextual),
  };
}

export function scheduleNextStep(steps: CampaignStep[], currentStep: number, from: Date, window: SendWindow) {
  const next = steps.find((s) => s.order === currentStep + 1);
  if (!next) return null;
  return nextWindowOpening(addHours(from, next.delayHours), window);
}

export async function recordEnrollmentAdvance(params: {
  organizationId: string; clientId: string; accountId: string; contactId: string | null; campaignId: string;
  stepPurpose: string; autoApproved: boolean;
}) {
  await logActivity({
    organizationId: params.organizationId, clientId: params.clientId, accountId: params.accountId,
    contactId: params.contactId, campaignId: params.campaignId, type: 'SYSTEM',
    title: `Email drafted (${params.stepPurpose})`,
    body: params.autoApproved ? 'Fully verified; approved by campaign policy.' : 'Waiting for review.',
  });
}

export { isWithinWindow };
