import { subDays } from 'date-fns';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { clientFilter, type AccessContext } from '@/server/access/scope';
import { CONNECTED_OUTCOMES } from '@/server/services/scoring/types';

/**
 * Full-funnel reporting, from accounts discovered to revenue won.
 *
 * Opens are deliberately absent from the headline numbers: privacy proxies
 * open mail automatically, so they measure the recipient's mail client more
 * than the recipient. The funnel is built from things that are true —
 * replies, conversations, meetings, money.
 */

export interface FunnelWindow { from: Date; to: Date }

export function windowFromDays(days: number, now = new Date()): FunnelWindow {
  return { from: subDays(now, days), to: now };
}

const SENT = ['SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'REPLIED', 'BOUNCED', 'COMPLAINED'] as const;

export interface Funnel {
  accountsDiscovered: number;
  accountsQualified: number;
  contactsFound: number;
  validEmails: number;
  phonesFound: number;
  emailsSent: number;
  emailsAutoApproved: number;
  bounces: number;
  replies: number;
  positiveReplies: number;
  negativeReplies: number;
  callsAttempted: number;
  connections: number;
  qualifiedConversations: number;
  meetingsBooked: number;
  meetingsHeld: number;
  meetingsNoShow: number;
  opportunities: number;
  dealsWon: number;
  revenueCents: number;
  pipelineCents: number;
  costMillicents: number;
}

export interface FunnelRates {
  replyRate: number | null;
  positiveReplyRate: number | null;
  bounceRate: number | null;
  connectRate: number | null;
  meetingsPerConnection: number | null;
  showRate: number | null;
  winRate: number | null;
  costPerMeetingCents: number | null;
  costPerWinCents: number | null;
}

const rate = (num: number, den: number) => (den > 0 ? num / den : null);

/** Fit at or above 70% of the ICP-fit component counts as qualified. */
const QUALIFIED_FIT = 28;

export async function funnel(access: AccessContext, params: { clientId?: string | null; window: FunnelWindow }) {
  const scope = clientFilter(access, params.clientId);
  const range = { gte: params.window.from, lte: params.window.to };

  const accountWhere: Prisma.AccountWhereInput = { ...scope, deletedAt: null, createdAt: range };
  const contactWhere: Prisma.ContactWhereInput = { ...scope, deletedAt: null, createdAt: range };

  const [
    accountsDiscovered, accountsQualified, contactsFound, validEmails, phonesFound,
    sent, autoApproved, bounces, replyGroups, calls, connections, qualifiedCalls,
    meetingsBooked, meetingStatus, outcomes, pipeline, cost,
  ] = await Promise.all([
    db.account.count({ where: accountWhere }),
    db.account.count({ where: { ...accountWhere, fitScore: { gte: QUALIFIED_FIT } } }),
    db.contact.count({ where: contactWhere }),
    db.contact.count({ where: { ...contactWhere, emailVerification: 'VALID' } }),
    db.contact.count({ where: { ...contactWhere, OR: [{ directPhone: { not: null } }, { mobilePhone: { not: null } }, { phone: { not: null } }] } }),
    db.message.count({ where: { ...scope, direction: 'OUTBOUND', sentAt: range, status: { in: [...SENT] } } }),
    db.message.count({ where: { ...scope, direction: 'OUTBOUND', sentAt: range, approvalSource: 'POLICY' } }),
    db.message.count({ where: { ...scope, direction: 'OUTBOUND', sentAt: range, status: 'BOUNCED' } }),
    db.message.groupBy({ by: ['replyClass'], where: { ...scope, direction: 'INBOUND', createdAt: range }, _count: true }),
    db.call.count({ where: { ...scope, startedAt: range } }),
    db.call.count({ where: { ...scope, startedAt: range, outcome: { in: [...CONNECTED_OUTCOMES] } } }),
    db.call.count({ where: { ...scope, startedAt: range, outcome: { in: ['QUALIFIED', 'MEETING_BOOKED'] } } }),
    db.meeting.count({ where: { ...scope, createdAt: range } }),
    db.meeting.groupBy({ by: ['status'], where: { ...scope, startsAt: { ...range, lte: new Date(Math.min(params.window.to.getTime(), Date.now())) } }, _count: true }),
    db.meeting.groupBy({
      by: ['outcome'],
      where: { ...scope, outcomeRecordedAt: range, outcome: { in: ['QUALIFIED_OPPORTUNITY', 'WON', 'LOST'] } },
      _count: true,
      _sum: { actualValueCents: true },
    }),
    db.meeting.aggregate({
      where: { ...scope, status: { not: 'CANCELLED' }, outcome: { in: ['PENDING', 'QUALIFIED_OPPORTUNITY'] } },
      _sum: { estimatedValueCents: true },
    }),
    db.usageRecord.aggregate({
      where: { organizationId: access.organizationId, ...(scope.clientId ? { clientId: scope.clientId } : {}), occurredAt: range },
      _sum: { costMillicents: true },
    }),
  ]);

  const replyCount = (classes: string[]) => replyGroups.filter((g) => classes.includes(g.replyClass ?? 'UNCLASSIFIED')).reduce((n, g) => n + g._count, 0);
  const replies = replyGroups
    .filter((g) => g.replyClass !== 'OUT_OF_OFFICE')
    .reduce((n, g) => n + g._count, 0);
  const statusCount = (s: string) => meetingStatus.find((m) => m.status === s)?._count ?? 0;
  const outcome = (o: string) => outcomes.find((x) => x.outcome === o);

  const f: Funnel = {
    accountsDiscovered,
    accountsQualified,
    contactsFound,
    validEmails,
    phonesFound,
    emailsSent: sent,
    emailsAutoApproved: autoApproved,
    bounces,
    replies,
    positiveReplies: replyCount(['POSITIVE', 'REFERRAL']),
    negativeReplies: replyCount(['NEGATIVE', 'UNSUBSCRIBE']),
    callsAttempted: calls,
    connections,
    qualifiedConversations: qualifiedCalls,
    meetingsBooked,
    meetingsHeld: statusCount('ATTENDED'),
    meetingsNoShow: statusCount('NO_SHOW'),
    opportunities: outcomes.reduce((n, o) => n + o._count, 0),
    dealsWon: outcome('WON')?._count ?? 0,
    revenueCents: outcome('WON')?._sum.actualValueCents ?? 0,
    pipelineCents: pipeline._sum.estimatedValueCents ?? 0,
    costMillicents: cost._sum.costMillicents ?? 0,
  };

  const costCents = f.costMillicents / 1000;
  const rates: FunnelRates = {
    replyRate: rate(f.replies, f.emailsSent),
    positiveReplyRate: rate(f.positiveReplies, f.emailsSent),
    bounceRate: rate(f.bounces, f.emailsSent),
    connectRate: rate(f.connections, f.callsAttempted),
    meetingsPerConnection: rate(f.meetingsBooked, f.connections),
    showRate: rate(f.meetingsHeld, f.meetingsHeld + f.meetingsNoShow),
    winRate: rate(f.dealsWon, f.opportunities),
    costPerMeetingCents: f.meetingsBooked ? Math.round(costCents / f.meetingsBooked) : null,
    costPerWinCents: f.dealsWon ? Math.round(costCents / f.dealsWon) : null,
  };

  return { window: params.window, funnel: f, rates };
}

/** Meetings booked per week, for the trend line. */
export async function meetingsTrend(access: AccessContext, params: { clientId?: string | null; weeks: number }) {
  const scope = clientFilter(access, params.clientId);
  const since = subDays(new Date(), params.weeks * 7);
  const [meetings, replies] = await Promise.all([
    db.meeting.findMany({ where: { ...scope, createdAt: { gte: since } }, select: { createdAt: true } }),
    db.message.findMany({
      where: { ...scope, direction: 'INBOUND', createdAt: { gte: since }, replyClass: { in: ['POSITIVE', 'REFERRAL'] } },
      select: { createdAt: true },
    }),
  ]);
  const buckets = Array.from({ length: params.weeks }, (_, i) => {
    const start = subDays(new Date(), (params.weeks - i) * 7);
    return { start, label: start.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }), meetings: 0, positiveReplies: 0 };
  });
  const place = (d: Date) => {
    for (let i = buckets.length - 1; i >= 0; i--) if (d >= buckets[i]!.start) return buckets[i]!;
    return null;
  };
  for (const m of meetings) { const b = place(m.createdAt); if (b) b.meetings++; }
  for (const r of replies) { const b = place(r.createdAt); if (b) b.positiveReplies++; }
  return buckets.map(({ label, meetings: mm, positiveReplies }) => ({ label, meetings: mm, positiveReplies }));
}
