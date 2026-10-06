import type { ClaimType, MessageStatus, PersonalizationTier, Prisma, VerificationStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { clientFilter, type AccessContext } from '@/server/access/scope';
import { DomainError, NotFoundError } from '@/server/errors';
import { checkDraft, renderHtml, saveClaims } from '@/server/ai/personalize';
import { hasBlockers, type LintFinding } from '@/server/ai/lint';
import type { LedgerFact, ReportedClaim } from '@/server/verification/types';
import { logActivity } from './activity';

/**
 * The review queue: drafts that policy did not approve on its own. A reviewer
 * sees every factual claim beside its evidence, can edit (which re-runs the
 * linter and verification against the same fact ledger), approve, or reject.
 *
 * Approving a draft whose claims could not be verified is possible, but only
 * as an explicit, recorded decision by a person — never by policy, never by
 * accident.
 */

const SENT: MessageStatus[] = ['SENDING', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'REPLIED', 'BOUNCED', 'COMPLAINED'];
const UNVERIFIED: VerificationStatus[] = ['UNSUPPORTED', 'BLOCKED'];

/** The ledger is stored as JSON; dates come back as strings. */
export function reviveLedger(json: unknown): LedgerFact[] {
  if (!Array.isArray(json)) return [];
  return (json as Array<LedgerFact & { eventDate: string | null; detectedAt: string | null }>).map((f) => ({
    ...f,
    eventDate: f.eventDate ? new Date(f.eventDate) : null,
    detectedAt: f.detectedAt ? new Date(f.detectedAt) : null,
  }));
}

export async function findMessage(access: AccessContext, id: string) {
  const message = await db.message.findFirst({ where: { id, ...clientFilter(access) } });
  if (!message) throw new NotFoundError('Message');
  return message;
}

export async function reviewQueue(access: AccessContext, params: {
  clientId?: string | null;
  status: MessageStatus[];
  tier?: PersonalizationTier[];
  verification?: VerificationStatus[];
  campaignId?: string;
  limit: number;
  cursor?: string;
}) {
  const rows = await db.message.findMany({
    where: {
      ...clientFilter(access, params.clientId),
      direction: 'OUTBOUND',
      status: { in: params.status },
      ...(params.tier ? { personalizationTier: { in: params.tier } } : {}),
      ...(params.verification ? { verificationStatus: { in: params.verification } } : {}),
      ...(params.campaignId ? { campaignId: params.campaignId } : {}),
    },
    // Worst verification first: the drafts most likely to need a human.
    orderBy: [{ verificationScore: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
    take: params.limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    include: {
      account: { select: { id: true, name: true, industry: true, city: true, score: true, domain: true } },
      contact: { select: { id: true, firstName: true, lastName: true, title: true, email: true } },
      campaign: { select: { id: true, name: true, approvalMode: true, autoApproveThreshold: true } },
      client: { select: { id: true, name: true } },
      claims: { orderBy: { createdAt: 'asc' } },
    },
  });
  const hasMore = rows.length > params.limit;
  const items = hasMore ? rows.slice(0, params.limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}

export async function reviewSummary(access: AccessContext, clientId?: string | null) {
  const grouped = await db.message.groupBy({
    by: ['verificationStatus', 'status'],
    where: { ...clientFilter(access, clientId), direction: 'OUTBOUND', status: { in: ['DRAFT', 'NEEDS_EDIT', 'APPROVED', 'SCHEDULED'] } },
    _count: true,
  });
  return grouped.map((g) => ({ verification: g.verificationStatus, status: g.status, count: g._count }));
}

/**
 * Human edits re-run the linter and claim verification against the ledger
 * the draft was written from. Editing an approved message revokes the
 * approval — approval attaches to specific words, not to a row.
 */
export async function editDraft(access: AccessContext, userId: string, input: { id: string; subject: string; bodyText: string }) {
  const message = await findMessage(access, input.id);
  if (SENT.includes(message.status)) throw new DomainError('This message has already been sent.');

  const facts = reviveLedger(message.personalizationFacts);
  const existing = await db.messageClaim.findMany({ where: { messageId: message.id } });
  const reported: ReportedClaim[] = existing
    .filter((c) => c.factId)
    .map((c) => ({ sentence: c.text, factId: c.factId, kind: c.kind === 'SENDER_PROOF' ? 'SENDER' : 'PROSPECT' }));

  const campaign = message.campaignId
    ? await db.campaign.findUnique({ where: { id: message.campaignId }, include: { playbook: { select: { approvedClaimTypes: true } } } })
    : null;
  const approvedClaimTypes: ClaimType[] = campaign?.approvedClaimTypes.length ? campaign.approvedClaimTypes : campaign?.playbook?.approvedClaimTypes ?? [];
  const contact = message.contactId ? await db.contact.findUnique({ where: { id: message.contactId }, include: { account: true, client: true } }) : null;

  const { findings, verification } = checkDraft({
    subject: input.subject,
    body: input.bodyText,
    tier: message.personalizationTier,
    facts,
    reported,
    approvedClaimTypes,
    bannedPhrases: campaign?.bannedPhrases ?? [],
    knownEntities: [contact?.firstName, contact?.lastName, contact?.account.name, contact?.client.name, contact?.client.senderName]
      .filter((x): x is string => !!x),
  });

  return db.$transaction(async (tx) => {
    const updated = await tx.message.update({
      where: { id: message.id },
      data: {
        subject: input.subject,
        bodyText: input.bodyText,
        bodyHtml: renderHtml(input.bodyText),
        lintFindings: findings as unknown as Prisma.InputJsonValue,
        verificationStatus: verification.status,
        verificationScore: verification.score,
        verificationSummary: verification.summary as unknown as Prisma.InputJsonValue,
        verifiedAt: new Date(),
        editedByHuman: true,
        status: hasBlockers(findings) || UNVERIFIED.includes(verification.status) ? 'NEEDS_EDIT' : 'DRAFT',
        approvedById: null,
        approvedAt: null,
        approvalSource: null,
      },
    });
    await saveClaims(tx, access.organizationId, message.id, verification);
    await tx.auditLog.create({
      data: { organizationId: access.organizationId, userId, action: 'message.edit', entityType: 'Message', entityId: message.id,
        after: { verification: verification.status, score: verification.score } },
    });
    return updated;
  });
}

/**
 * Approval by a person. Lint blockers (banned phrases, merge tags left in)
 * cannot be overridden. Unverified claims can, but only with
 * `acknowledgeUnverified` and a note, which are recorded with the approval.
 */
export async function approveDraft(access: AccessContext, userId: string, input: {
  id: string;
  scheduledFor?: Date;
  acknowledgeUnverified?: boolean;
  note?: string;
}) {
  const message = await findMessage(access, input.id);
  if (SENT.includes(message.status)) throw new DomainError('This message has already been sent.');
  const findings = (message.lintFindings ?? []) as unknown as LintFinding[];
  if (hasBlockers(findings)) throw new DomainError('This draft has issues that must be edited before it can be approved.');

  const unverified = message.verificationStatus && UNVERIFIED.includes(message.verificationStatus);
  if (unverified && (!input.acknowledgeUnverified || !input.note?.trim())) {
    throw new DomainError('Some claims could not be verified. Edit them out, or confirm you checked them yourself and say how.');
  }

  const updated = await db.message.update({
    where: { id: message.id },
    data: {
      status: input.scheduledFor ? 'SCHEDULED' : 'APPROVED',
      scheduledFor: input.scheduledFor ?? null,
      approvedById: userId,
      approvedAt: new Date(),
      approvalSource: 'HUMAN',
      ...(unverified ? {
        approvalPolicy: {
          override: true,
          previousVerification: message.verificationStatus,
          note: input.note!.trim(),
          by: userId,
          at: new Date().toISOString(),
        },
      } : {}),
    },
  });
  await db.auditLog.create({
    data: {
      organizationId: access.organizationId, userId, action: unverified ? 'message.approve_override' : 'message.approve',
      entityType: 'Message', entityId: message.id,
      before: { status: message.status, verification: message.verificationStatus },
      after: { status: updated.status, tier: message.personalizationTier, note: input.note ?? null },
    },
  });
  return updated;
}

export async function rejectDraft(access: AccessContext, userId: string, input: { id: string; reason?: string }) {
  const message = await findMessage(access, input.id);
  if (SENT.includes(message.status)) throw new DomainError('This message has already been sent.');
  await db.message.update({
    where: { id: message.id },
    data: { status: 'CANCELLED', failureReason: input.reason ?? 'Rejected in review' },
  });
  await logActivity({
    organizationId: access.organizationId, clientId: message.clientId, accountId: message.accountId,
    contactId: message.contactId, userId, type: 'SYSTEM', title: 'Draft rejected', body: input.reason,
  });
}

/** Email history for an account or contact, both directions, newest first. */
export async function messageThread(access: AccessContext, params: { accountId?: string; contactId?: string; limit?: number }) {
  if (!params.accountId && !params.contactId) return [];
  return db.message.findMany({
    where: {
      ...clientFilter(access),
      ...(params.accountId ? { accountId: params.accountId } : {}),
      ...(params.contactId ? { contactId: params.contactId } : {}),
      status: { notIn: ['GENERATING'] },
    },
    orderBy: { createdAt: 'desc' },
    take: params.limit ?? 50,
    select: {
      id: true, direction: true, status: true, subject: true, bodyText: true, sentAt: true, createdAt: true,
      openCount: true, clickCount: true, replyClass: true, verificationStatus: true, verificationScore: true,
      approvalSource: true, stepOrder: true, personalizationTier: true,
      contact: { select: { id: true, firstName: true, lastName: true } },
      campaign: { select: { id: true, name: true } },
    },
  });
}
