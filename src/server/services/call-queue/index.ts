import { subDays } from 'date-fns';
import type { CallTaskCategory, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { clientFilter, type AccessContext } from '@/server/access/scope';
import { DomainError, NotFoundError } from '@/server/errors';
import { prioritize, type QueueFacts } from './prioritize';

export { prioritize } from './prioritize';
export type { QueueReason, QueueDecision } from './prioritize';

/**
 * Keeps one CallTask per contact in step with what Relay knows. Called
 * whenever something relevant changes (a reply, an open, a signal, a call)
 * and periodically by the worker, so the queue a caller opens is already
 * ranked.
 */
export async function refreshCallTask(contactId: string, opts: { manual?: boolean; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const contact = await db.contact.findUnique({
    where: { id: contactId },
    include: {
      account: {
        select: {
          id: true, score: true, status: true, phone: true, doNotContact: true, deletedAt: true, clientId: true, organizationId: true,
          signals: { where: { dismissedAt: null }, select: { type: true, title: true, eventDate: true, detectedAt: true, evidenceStatus: true }, orderBy: { detectedAt: 'desc' }, take: 5 },
        },
      },
      callTask: true,
      calls: { orderBy: { startedAt: 'desc' }, take: 20, select: { startedAt: true, outcome: true, callbackAt: true } },
      messages: {
        where: { createdAt: { gte: subDays(now, 60) } },
        select: { direction: true, sentAt: true, createdAt: true, openCount: true, clickCount: true, replyClass: true, bodyText: true },
      },
      meetings: { where: { startsAt: { gte: now }, status: { in: ['BOOKED', 'CONFIRMED', 'RESCHEDULED'] } }, select: { id: true } },
      enrollments: { where: { status: { in: ['ACTIVE', 'PENDING'] } }, select: { campaignId: true, campaign: { select: { callFollowUp: true } } } },
    },
  });
  if (!contact) return null;
  const account = contact.account;

  const existing = contact.callTask;
  const manual = opts.manual || (existing?.category === 'MANUAL' && existing.status !== 'COMPLETED' && existing.status !== 'CANCELLED');

  const facts: QueueFacts = {
    now,
    accountScore: account.score,
    contactScore: contact.score,
    accountStatus: account.status,
    hasDirectPhone: !!(contact.directPhone || contact.mobilePhone),
    hasAnyPhone: !!(contact.directPhone || contact.mobilePhone || contact.phone || account.phone),
    doNotCall: contact.doNotCall || account.doNotContact || !!contact.deletedAt || !!account.deletedAt || contact.phoneStatus === 'WRONG_NUMBER',
    contactStatus: contact.status,
    replies: contact.messages
      .filter((m) => m.direction === 'INBOUND')
      .map((m) => ({ at: m.sentAt ?? m.createdAt, replyClass: m.replyClass, snippet: firstLine(m.bodyText) })),
    emails: contact.messages
      .filter((m) => m.direction === 'OUTBOUND' && m.sentAt)
      .map((m) => ({ sentAt: m.sentAt!, opened: m.openCount > 0, clicked: m.clickCount > 0 })),
    calls: contact.calls.map((c) => ({ at: c.startedAt, outcome: c.outcome, callbackAt: c.callbackAt })),
    signals: account.signals.map((s) => ({ type: s.type, title: s.title, at: s.eventDate ?? s.detectedAt, evidenceStatus: s.evidenceStatus })),
    upcomingMeeting: contact.meetings.length > 0,
    manual,
  };

  // A campaign can opt out of call follow-up; manual adds and callbacks still count.
  const enrolledWithoutCalls = contact.enrollments.length > 0 && contact.enrollments.every((e) => !e.campaign.callFollowUp);
  const decision = prioritize(facts);

  if (!decision.eligible || (enrolledWithoutCalls && !manual && decision.category !== 'CALLBACK_DUE' && decision.category !== 'REPLIED')) {
    if (existing && (existing.status === 'OPEN' || existing.status === 'SNOOZED')) {
      await db.callTask.update({
        where: { id: existing.id },
        data: {
          status: 'CANCELLED', completedAt: now, computedAt: now,
          completedReason: decision.eligible ? 'Campaign does not use calls' : decision.reason,
        },
      });
    }
    return null;
  }

  const campaignId = contact.enrollments[0]?.campaignId ?? existing?.campaignId ?? null;
  const snoozed = decision.notBefore && decision.notBefore > now;
  const data = {
    category: decision.category,
    priority: decision.priority,
    reasons: decision.reasons as unknown as Prisma.InputJsonValue,
    dueAt: decision.dueAt,
    status: snoozed ? 'SNOOZED' as const : 'OPEN' as const,
    snoozedUntil: snoozed ? decision.notBefore : null,
    computedAt: now,
    campaignId,
    completedAt: null,
    completedReason: null,
  };

  return db.callTask.upsert({
    where: { contactId },
    create: {
      ...data,
      organizationId: account.organizationId,
      clientId: account.clientId,
      accountId: account.id,
      contactId,
      attempts: contact.calls.length,
      lastAttemptAt: contact.calls[0]?.startedAt ?? null,
      lastOutcome: contact.calls[0]?.outcome ?? null,
    },
    update: data,
  });
}

function firstLine(body: string | null) {
  if (!body) return null;
  const own = body.split(/\n\s*(>|On .+ wrote:|-{2,}\s*Original Message)/)[0] ?? body;
  return own.replace(/\s+/g, ' ').trim().slice(0, 140) || null;
}

/**
 * Recomputes the queue for a workspace (optionally one client). Candidates are
 * contacts with a phone at accounts that are either a good fit or showing
 * engagement, plus everyone already in the queue.
 */
export async function refreshQueue(organizationId: string, clientId?: string | null, limit = 1500) {
  const since = subDays(new Date(), 21);
  const candidates = await db.contact.findMany({
    where: {
      organizationId,
      ...(clientId ? { clientId } : {}),
      deletedAt: null,
      doNotCall: false,
      account: { deletedAt: null, doNotContact: false, status: { notIn: ['WON', 'LOST', 'DISQUALIFIED'] } },
      OR: [
        { callTask: { status: { in: ['OPEN', 'SNOOZED'] } } },
        { account: { score: { gte: 60 } }, score: { gte: 50 } },
        { messages: { some: { createdAt: { gte: since }, OR: [{ direction: 'INBOUND' }, { clickCount: { gt: 0 } }, { openCount: { gt: 1 } }] } } },
        { calls: { some: { callbackAt: { not: null } } } },
      ],
    },
    select: { id: true },
    orderBy: { score: 'desc' },
    take: limit,
  });

  let queued = 0;
  for (const c of candidates) {
    if (await refreshCallTask(c.id)) queued++;
  }
  // Snoozes that have expired become callable again.
  await db.callTask.updateMany({
    where: { organizationId, status: 'SNOOZED', snoozedUntil: { lte: new Date() } },
    data: { status: 'OPEN', snoozedUntil: null },
  });
  return { considered: candidates.length, queued };
}

// ---------------------------------------------------------------------------
// Reading the queue
// ---------------------------------------------------------------------------

export interface QueueFilter {
  clientId?: string | null;
  assignee?: 'me' | 'unassigned' | 'all';
  category?: CallTaskCategory;
  limit?: number;
}

const QUEUE_INCLUDE = {
  contact: {
    select: {
      id: true, firstName: true, lastName: true, title: true, email: true, phone: true, directPhone: true,
      mobilePhone: true, score: true, timezone: true, lastCalledAt: true, callAttempts: true,
    },
  },
  account: { select: { id: true, name: true, city: true, region: true, score: true, phone: true, industry: true, timezone: true } },
  client: { select: { id: true, name: true } },
  assignee: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.CallTaskInclude;

/**
 * The caller's view: callbacks that are due first, then by priority. Each item
 * carries its "why call now" reasons. Callers see work assigned to them plus
 * anything unassigned; admins can see everything.
 */
export async function listQueue(access: AccessContext, filter: QueueFilter) {
  const now = new Date();
  const and: Prisma.CallTaskWhereInput[] = [
    { OR: [{ status: 'OPEN' }, { status: 'SNOOZED', snoozedUntil: { lte: now } }] },
  ];
  if (filter.assignee === 'me') and.push({ OR: [{ assigneeId: access.userId }, { assigneeId: null }] });
  if (filter.assignee === 'unassigned') and.push({ assigneeId: null });
  const where: Prisma.CallTaskWhereInput = {
    ...clientFilter(access, filter.clientId),
    ...(filter.category ? { category: filter.category } : {}),
    AND: and,
  };

  // Fetch promised callbacks before applying the page limit. Sorting only
  // after a priority-limited query can hide a low-score callback entirely.
  const limit = filter.limit ?? 100;
  const dueCallbacks = await db.callTask.findMany({
    where: { ...where, dueAt: { lte: now } },
    orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
    take: limit,
    include: QUEUE_INCLUDE,
  });
  const rest = dueCallbacks.length < limit ? await db.callTask.findMany({
    where: { ...where, AND: [...and, { OR: [{ dueAt: null }, { dueAt: { gt: now } }] }] },
    orderBy: [{ priority: 'desc' }, { computedAt: 'asc' }],
    take: limit - dueCallbacks.length,
    include: QUEUE_INCLUDE,
  }) : [];
  const ordered = [...dueCallbacks, ...rest];

  const [scheduledCallbacks, snoozed] = await Promise.all([
    db.callTask.findMany({
      where: { ...clientFilter(access, filter.clientId), status: { in: ['OPEN', 'SNOOZED'] }, dueAt: { gt: now } },
      orderBy: { dueAt: 'asc' },
      take: 20,
      include: QUEUE_INCLUDE,
    }),
    db.callTask.count({ where: { ...clientFilter(access, filter.clientId), status: 'SNOOZED', snoozedUntil: { gt: now } } }),
  ]);

  return { items: ordered, upcomingCallbacks: scheduledCallbacks, snoozed };
}

export async function findCallTask(access: AccessContext, id: string) {
  const task = await db.callTask.findFirst({ where: { id, ...clientFilter(access) } });
  if (!task) throw new NotFoundError('Call task');
  return task;
}

export async function addToQueue(access: AccessContext, contactId: string) {
  const contact = await db.contact.findFirst({ where: { id: contactId, ...clientFilter(access), deletedAt: null } });
  if (!contact) throw new NotFoundError('Contact');
  const task = await refreshCallTask(contactId, { manual: true });
  if (!task) {
    throw new DomainError('This person can\'t be queued: there is no usable phone number, or they or their company are marked do-not-call or closed.');
  }
  return task;
}

export async function assignCallTasks(access: AccessContext, ids: string[], assigneeId: string | null) {
  if (assigneeId) {
    const member = await db.membership.findFirst({
      where: { organizationId: access.organizationId, userId: assigneeId, role: { in: ['CALLER', 'OPERATOR', 'RELAY_ADMIN', 'SUPER_ADMIN'] } },
    });
    if (!member) throw new NotFoundError('Team member');
  }
  const result = await db.callTask.updateMany({
    where: { id: { in: ids }, ...clientFilter(access) },
    data: { assigneeId },
  });
  return { updated: result.count };
}

export async function snoozeCallTask(access: AccessContext, id: string, until: Date) {
  await findCallTask(access, id);
  return db.callTask.update({ where: { id }, data: { status: 'SNOOZED', snoozedUntil: until } });
}
