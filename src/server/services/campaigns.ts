import { z } from 'zod';
import { db } from '@/lib/db';
import { addHours, startOfDay } from 'date-fns';
import { isWithinWindow, nextWindowOpening, jitter, type SendWindow } from './schedule';
import { logActivity } from './crm';
import type { Campaign, CampaignStep } from '@prisma/client';

export const campaignStepSchema = z.object({
  order: z.number().int().min(0).max(9),
  delayHours: z.number().int().min(0).max(24 * 180),
  purpose: z.string().min(1).max(60),
  instructions: z.string().min(1).max(2000),
  stopOnReply: z.boolean().default(true),
});

export const campaignInputSchema = z.object({
  name: z.string().min(1).max(120),
  objective: z.string().max(500).optional(),
  industryFocus: z.string().max(80).optional(),
  personaBrief: z.string().max(2000).optional(),
  offerBrief: z.string().min(1).max(2000),
  toneGuidelines: z.string().max(2000).optional(),
  bannedPhrases: z.array(z.string().max(80)).max(50).default([]),
  mailboxId: z.string().uuid().optional(),
  sendDays: z.array(z.number().int().min(1).max(7)).min(1).default([1, 2, 3, 4, 5]),
  sendStartHour: z.number().int().min(0).max(23).default(8),
  sendEndHour: z.number().int().min(1).max(24).default(16),
  dailyCap: z.number().int().min(1).max(500).default(30),
  allowContextual: z.boolean().default(true),
  contextualDailyCap: z.number().int().min(0).max(200).default(10),
  steps: z.array(campaignStepSchema).min(1).max(6),
});

/** Sensible default sequence: one opener, one nudge, one close-out. */
export const DEFAULT_STEPS = [
  {
    order: 0, delayHours: 0, purpose: 'opener', stopOnReply: true,
    instructions: 'First contact. Lead with the specific observation from research. One small ask: a reply or fifteen minutes.',
  },
  {
    order: 1, delayHours: 24 * 30, purpose: 'value-add', stopOnReply: true,
    instructions: 'They did not reply. Do not mention that. Add one new, concrete idea specific to their business that was not in the first email. Shorter than the opener.',
  },
  {
    order: 2, delayHours: 24 * 45, purpose: 'breakup', stopOnReply: true,
    instructions: 'Final message. Two or three sentences. Say you will stop reaching out, leave the door open, no guilt and no false scarcity.',
  },
];

export function windowFor(campaign: Campaign, timezone: string): SendWindow {
  return {
    timezone,
    days: campaign.sendDays,
    startHour: campaign.sendStartHour,
    endHour: campaign.sendEndHour,
  };
}

export async function createCampaign(organizationId: string, input: z.infer<typeof campaignInputSchema>) {
  const { steps, ...rest } = input;
  return db.campaign.create({
    data: {
      organizationId,
      ...rest,
      status: 'DRAFT',
      steps: { create: steps },
    },
    include: { steps: { orderBy: { order: 'asc' } } },
  });
}

/**
 * Enrolls leads. Leads that are suppressed, already enrolled, or have no
 * emailable contact are skipped with a reason rather than failing the batch —
 * an import of 200 leads where 12 are unreachable should enroll 188.
 */
export async function enrollLeads(organizationId: string, campaignId: string, leadIds: string[]) {
  const campaign = await db.campaign.findFirstOrThrow({
    where: { id: campaignId, organizationId },
    include: { organization: { select: { timezone: true } } },
  });

  const leads = await db.lead.findMany({
    where: { id: { in: leadIds }, organizationId, deletedAt: null },
    include: { contacts: true },
  });

  const suppressions = await db.suppression.findMany({ where: { organizationId } });
  const blocked = new Set(suppressions.map((s) => s.value));

  const existing = await db.campaignEnrollment.findMany({
    where: { campaignId, leadId: { in: leadIds } },
    select: { leadId: true },
  });
  const already = new Set(existing.map((e) => e.leadId));

  const skipped: Array<{ leadId: string; reason: string }> = [];
  const toCreate: Array<{ leadId: string; contactId: string }> = [];

  for (const lead of leads) {
    if (already.has(lead.id)) { skipped.push({ leadId: lead.id, reason: 'Already in this campaign' }); continue; }
    if (lead.suppressedAt) { skipped.push({ leadId: lead.id, reason: 'On the do-not-contact list' }); continue; }

    const contact = lead.contacts.find(
      (c) => c.email && !blocked.has(c.email.toLowerCase()) && !blocked.has(c.email.split('@')[1]!.toLowerCase()),
    );
    if (!contact) { skipped.push({ leadId: lead.id, reason: 'No emailable contact' }); continue; }

    toCreate.push({ leadId: lead.id, contactId: contact.id });
  }

  const window = windowFor(campaign, campaign.organization.timezone);
  const firstAction = nextWindowOpening(new Date(), window);

  if (toCreate.length) {
    await db.campaignEnrollment.createMany({
      data: toCreate.map((t, i) => ({
        organizationId,
        campaignId,
        leadId: t.leadId,
        contactId: t.contactId,
        status: campaign.status === 'ACTIVE' ? 'ACTIVE' : 'PENDING',
        currentStep: 0,
        // Stagger the first action so a 200-lead enrollment doesn't try to
        // draft 200 emails in the same minute.
        nextActionAt: jitter(firstAction, Math.min(180, toCreate.length * 2)),
      })),
      skipDuplicates: true,
    });
  }

  return { enrolled: toCreate.length, skipped };
}

export async function setCampaignStatus(
  organizationId: string,
  campaignId: string,
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED',
) {
  const campaign = await db.campaign.findFirstOrThrow({ where: { id: campaignId, organizationId } });

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
      await tx.campaignEnrollment.updateMany({
        where: { campaignId, status: { in: ['PENDING', 'PAUSED'] } },
        data: { status: 'ACTIVE' },
      });
    }
    if (status === 'PAUSED' || status === 'ARCHIVED') {
      // Pausing must also freeze anything already approved and waiting, or the
      // pause does nothing for the next fifteen minutes.
      await tx.campaignEnrollment.updateMany({
        where: { campaignId, status: 'ACTIVE' },
        data: { status: 'PAUSED' },
      });
      await tx.message.updateMany({
        where: { campaignId, status: 'SCHEDULED' },
        data: { status: 'APPROVED', scheduledFor: null },
      });
    }
    return updated;
  });
}

/** Stop conditions. Called whenever a reply, bounce, or opt-out is observed. */
export async function exitEnrollment(params: {
  leadId: string;
  reason: 'REPLIED' | 'BOUNCED' | 'OPTED_OUT' | 'REMOVED';
  note?: string;
}) {
  const status = params.reason === 'REPLIED' ? 'REPLIED'
    : params.reason === 'BOUNCED' ? 'BOUNCED'
    : params.reason === 'OPTED_OUT' ? 'OPTED_OUT' : 'REMOVED';

  const enrollments = await db.campaignEnrollment.findMany({
    where: { leadId: params.leadId, status: { in: ['PENDING', 'ACTIVE', 'PAUSED'] } },
    select: { id: true, organizationId: true },
  });
  if (!enrollments.length) return { exited: 0 };

  await db.$transaction([
    db.campaignEnrollment.updateMany({
      where: { id: { in: enrollments.map((e) => e.id) } },
      data: { status, exitReason: params.note ?? params.reason, nextActionAt: null, completedAt: new Date() },
    }),
    // Anything queued for this lead is cancelled. A follow-up that lands after
    // someone has already replied is the most damaging mistake this system
    // could make.
    db.message.updateMany({
      where: {
        leadId: params.leadId,
        status: { in: ['GENERATING', 'DRAFT', 'NEEDS_EDIT', 'APPROVED', 'SCHEDULED'] },
      },
      data: { status: 'CANCELLED', failureReason: `Sequence stopped: ${params.reason.toLowerCase()}` },
    }),
    db.lead.update({ where: { id: params.leadId }, data: { nextFollowUpAt: null } }),
  ]);

  return { exited: enrollments.length };
}

/** Per-campaign daily budget, checked before drafting the next step. */
export async function remainingDailyCapacity(campaign: Campaign) {
  const sentToday = await db.message.count({
    where: { campaignId: campaign.id, sentAt: { gte: startOfDay(new Date()) } },
  });
  const contextualToday = await db.message.count({
    where: {
      campaignId: campaign.id,
      personalizationTier: 'CONTEXTUAL',
      sentAt: { gte: startOfDay(new Date()) },
    },
  });
  return {
    total: Math.max(0, campaign.dailyCap - sentToday),
    contextual: Math.max(0, campaign.contextualDailyCap - contextualToday),
  };
}

export function scheduleNextStep(steps: CampaignStep[], currentStep: number, from: Date, window: SendWindow) {
  const next = steps.find((s) => s.order === currentStep + 1);
  if (!next) return null;
  return nextWindowOpening(addHours(from, next.delayHours), window);
}

export async function recordEnrollmentAdvance(organizationId: string, leadId: string, stepPurpose: string) {
  await logActivity({
    organizationId, leadId, type: 'SYSTEM',
    title: `Follow-up queued (${stepPurpose})`,
    body: 'A draft was generated and is waiting for review.',
  });
}

export { isWithinWindow };
