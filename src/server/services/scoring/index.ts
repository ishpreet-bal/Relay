import type { IdealCustomerProfile, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { scoreAccount, employeeEstimate } from './account-score';
import { scoreContact } from './contact-score';
import { CONNECTED_OUTCOMES, EMPTY_ENGAGEMENT, type AccountScore, type EngagementFacts, type IcpCriteria } from './types';

export * from './types';
export { scoreAccount, employeeEstimate, signalFreshness } from './account-score';
export { scoreContact } from './contact-score';

const SENT_STATUSES = ['SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'REPLIED', 'BOUNCED', 'COMPLAINED'] as const;

export function icpCriteria(icp: IdealCustomerProfile): IcpCriteria {
  return {
    industries: icp.industries,
    industryKeywords: icp.industryKeywords,
    excludedIndustries: icp.excludedIndustries,
    employeeMin: icp.employeeMin,
    employeeMax: icp.employeeMax,
    locations: icp.locations,
    targetTitles: icp.targetTitles,
    targetDepartments: icp.targetDepartments,
    targetSeniorities: icp.targetSeniorities,
    smallCompanyMaxEmployees: icp.smallCompanyMaxEmployees,
    smallCompanyTitles: icp.smallCompanyTitles,
    preferredSignals: icp.preferredSignals,
  };
}

export function temperatureFor(score: number) {
  if (score >= 75) return 'HOT' as const;
  if (score >= 50) return 'WARM' as const;
  return 'COLD' as const;
}

/** Engagement per contact, from messages, calls and meetings. */
async function loadEngagement(accountId: string): Promise<Map<string | null, EngagementFacts>> {
  const [messages, calls, meetings] = await Promise.all([
    db.message.findMany({
      where: { accountId },
      select: { contactId: true, direction: true, status: true, openCount: true, clickCount: true, replyClass: true, sentAt: true, createdAt: true },
    }),
    db.call.findMany({ where: { accountId }, select: { contactId: true, outcome: true } }),
    db.meeting.findMany({ where: { accountId, status: { not: 'CANCELLED' } }, select: { contactId: true } }),
  ]);

  const byContact = new Map<string | null, EngagementFacts>();
  const get = (id: string | null) => {
    let e = byContact.get(id);
    if (!e) { e = { ...EMPTY_ENGAGEMENT, replies: [] }; byContact.set(id, e); }
    return e;
  };

  for (const m of messages) {
    const e = get(m.contactId);
    if (m.direction === 'INBOUND') {
      e.replies.push({ replyClass: m.replyClass, at: m.sentAt ?? m.createdAt });
    } else if ((SENT_STATUSES as readonly string[]).includes(m.status)) {
      e.emailsSent++;
      if (m.openCount > 0) e.opened++;
      if (m.clickCount > 0) e.clicked++;
    }
  }
  for (const c of calls) if (CONNECTED_OUTCOMES.includes(c.outcome)) get(c.contactId).callsConnected++;
  for (const m of meetings) get(m.contactId).meetingsBooked++;
  return byContact;
}

function sumEngagement(all: Iterable<EngagementFacts>): EngagementFacts {
  const total: EngagementFacts = { ...EMPTY_ENGAGEMENT, replies: [] };
  for (const e of all) {
    total.emailsSent += e.emailsSent;
    total.opened += e.opened;
    total.clicked += e.clicked;
    total.replies.push(...e.replies);
    total.callsConnected += e.callsConnected;
    total.meetingsBooked += e.meetingsBooked;
  }
  return total;
}

/**
 * Recomputes an account's score and every contact's score, and records which
 * ICP the account fits best. Called after any change that could move a score:
 * enrichment, research, new signals, replies, calls, meetings.
 */
export async function rescoreAccount(accountId: string, now = new Date()): Promise<AccountScore | null> {
  const account = await db.account.findUnique({
    where: { id: accountId },
    include: {
      contacts: { where: { deletedAt: null } },
      signals: { where: { dismissedAt: null } },
      client: { include: { icps: { where: { isActive: true }, orderBy: { createdAt: 'asc' } } } },
    },
  });
  if (!account || account.deletedAt) return null;

  const engagement = await loadEngagement(accountId);
  const facts = {
    account: { ...account, doNotContact: account.doNotContact },
    contacts: account.contacts,
    signals: account.signals,
    engagement: sumEngagement(engagement.values()),
    now,
  };

  // Score against every active ICP and keep the one it fits best. A pinned
  // ICP (account.icpId) is respected while it stays active.
  const icps = account.client.icps;
  const pinned = icps.find((i) => i.id === account.icpId);
  const candidates = pinned ? [pinned] : icps;
  let best: { icp: IdealCustomerProfile | null; score: AccountScore } = {
    icp: null,
    score: scoreAccount({ ...facts, icp: null }),
  };
  for (const icp of candidates) {
    const score = scoreAccount({ ...facts, icp: icpCriteria(icp) });
    if (!best.icp || score.total > best.score.total) best = { icp, score };
  }

  const criteria = best.icp ? icpCriteria(best.icp) : null;
  const size = employeeEstimate(account.employeeCount, account.employeeRange);
  const contactUpdates: Prisma.PrismaPromise<unknown>[] = account.contacts.map((c) => {
    const s = scoreContact({ contact: c, icp: criteria, employeeCount: size, engagement: engagement.get(c.id) ?? EMPTY_ENGAGEMENT });
    return db.contact.update({ where: { id: c.id }, data: { score: s.total, scoreBreakdown: s as unknown as Prisma.InputJsonValue } });
  });

  const component = (key: string) => best.score.components.find((c) => c.key === key)?.points ?? 0;
  const effective = account.scoreOverride ?? best.score.total;

  await db.$transaction([
    ...contactUpdates,
    db.account.update({
      where: { id: accountId },
      data: {
        score: effective,
        fitScore: component('fit'),
        engagementScore: component('engagement'),
        scoreBreakdown: best.score as unknown as Prisma.InputJsonValue,
        scoredAt: now,
        icpId: best.icp?.id ?? null,
        temperature: temperatureFor(effective),
      },
    }),
  ]);

  return best.score;
}

/** Marks scores stale so the worker recomputes them in the background. */
export async function markScoresStale(where: Prisma.AccountWhereInput) {
  return db.account.updateMany({ where, data: { scoredAt: null } });
}
