import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { clientFilter, type AccessContext, type ClientWhere } from '@/server/access/scope';
import { SENIORITY_LABELS, SIGNAL_LABELS, humanize } from '@/lib/domain';
import type { FunnelWindow } from './funnel';

/**
 * Which kinds of prospects, signals, messages and people actually produce
 * conversations and meetings?
 *
 * These are descriptive statistics, not predictions. Every row carries its
 * sample size; a "lift" against the overall rate is only reported once both
 * the row and the rest of the data have enough contacts to mean something,
 * and the insight sentences are generated from those rows alone. With little
 * data the honest answer is "not enough data yet", and that is what is shown.
 */

export const MIN_SAMPLE = 20;

export type ContactDimension = 'seniority' | 'department' | 'industry' | 'companySize' | 'title';
export type MessageDimension = 'angle' | 'stepOrder' | 'ctaType';

export interface BreakdownRow {
  key: string;
  label: string;
  contacted: number;
  replied: number;
  positive: number;
  connected: number;
  meetings: number;
  meetingRate: number | null;
  positiveRate: number | null;
  lift: number | null;
  sufficient: boolean;
}

function clientCond(column: string, scope: ClientWhere): Prisma.Sql {
  const col = Prisma.raw(column);
  if (!scope.clientId) return Prisma.sql`TRUE`;
  if (typeof scope.clientId === 'string') return Prisma.sql`${col} = ${scope.clientId}::uuid`;
  return scope.clientId.in.length ? Prisma.sql`${col} = ANY(${scope.clientId.in}::uuid[])` : Prisma.sql`FALSE`;
}

const DIMENSION_SQL: Record<ContactDimension, Prisma.Sql> = {
  seniority: Prisma.sql`c."seniority"::text`,
  department: Prisma.sql`COALESCE(NULLIF(c."department", ''), 'Unknown')`,
  industry: Prisma.sql`COALESCE(NULLIF(a."industry", ''), 'Unknown')`,
  title: Prisma.sql`COALESCE(NULLIF(lower(c."title"), ''), 'unknown')`,
  companySize: Prisma.sql`CASE
    WHEN a."employeeCount" IS NULL THEN 'Unknown'
    WHEN a."employeeCount" < 20 THEN '1-19'
    WHEN a."employeeCount" < 50 THEN '20-49'
    WHEN a."employeeCount" < 200 THEN '50-199'
    WHEN a."employeeCount" < 500 THEN '200-499'
    ELSE '500+' END`,
};

const SIZE_ORDER = ['1-19', '20-49', '50-199', '200-499', '500+', 'Unknown'];

function finish(rows: Array<Omit<BreakdownRow, 'meetingRate' | 'positiveRate' | 'lift' | 'sufficient' | 'label'> & { label?: string }>, labeler: (key: string) => string): BreakdownRow[] {
  const total = rows.reduce((s, r) => ({ contacted: s.contacted + r.contacted, meetings: s.meetings + r.meetings }), { contacted: 0, meetings: 0 });
  return rows.map((r) => {
    const restContacted = total.contacted - r.contacted;
    const restMeetings = total.meetings - r.meetings;
    const meetingRate = r.contacted ? r.meetings / r.contacted : null;
    const restRate = restContacted ? restMeetings / restContacted : null;
    const sufficient = r.contacted >= MIN_SAMPLE && restContacted >= MIN_SAMPLE;
    return {
      ...r,
      label: r.label ?? labeler(r.key),
      meetingRate,
      positiveRate: r.contacted ? r.positive / r.contacted : null,
      lift: sufficient && meetingRate !== null && restRate ? meetingRate / restRate : null,
      sufficient,
    };
  });
}

/**
 * Contacts worked in the window (emailed or called), grouped by a property of
 * the contact or their company, with what each group went on to do.
 */
export async function contactBreakdown(
  access: AccessContext,
  params: { clientId?: string | null; window: FunnelWindow; dimension: ContactDimension; limit?: number },
): Promise<BreakdownRow[]> {
  const scope = clientFilter(access, params.clientId);
  const { from, to } = params.window;
  const dim = DIMENSION_SQL[params.dimension];

  const rows = await db.$queryRaw<Array<{ key: string; contacted: number; replied: number; positive: number; connected: number; meetings: number }>>`
    WITH worked AS (
      SELECT c."id", ${dim} AS key
      FROM "Contact" c
      JOIN "Account" a ON a."id" = c."accountId"
      WHERE c."organizationId" = ${access.organizationId}::uuid
        AND ${clientCond('c."clientId"', scope)}
        AND (
          EXISTS (SELECT 1 FROM "Message" m WHERE m."contactId" = c."id" AND m."direction" = 'OUTBOUND' AND m."sentAt" BETWEEN ${from} AND ${to})
          OR EXISTS (SELECT 1 FROM "Call" k WHERE k."contactId" = c."id" AND k."startedAt" BETWEEN ${from} AND ${to})
        )
    )
    SELECT w.key,
      count(*)::int AS contacted,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Message" r WHERE r."contactId" = w."id" AND r."direction" = 'INBOUND' AND COALESCE(r."replyClass"::text, '') <> 'OUT_OF_OFFICE'))::int AS replied,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Message" r WHERE r."contactId" = w."id" AND r."direction" = 'INBOUND' AND r."replyClass" IN ('POSITIVE', 'REFERRAL')))::int AS positive,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Call" k WHERE k."contactId" = w."id" AND k."outcome" NOT IN ('NO_ANSWER', 'VOICEMAIL', 'WRONG_NUMBER')))::int AS connected,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Meeting" t WHERE t."contactId" = w."id" AND t."status" <> 'CANCELLED'))::int AS meetings
    FROM worked w
    GROUP BY w.key
    ORDER BY contacted DESC
    LIMIT ${params.limit ?? 25}
  `;

  const labeler = (key: string) => {
    if (params.dimension === 'seniority') return SENIORITY_LABELS[key as keyof typeof SENIORITY_LABELS] ?? key;
    if (params.dimension === 'title') return key.replace(/\b\w/g, (c) => c.toUpperCase());
    return key;
  };
  const result = finish(rows, labeler);
  if (params.dimension === 'companySize') result.sort((a, b) => SIZE_ORDER.indexOf(a.key) - SIZE_ORDER.indexOf(b.key));
  return result;
}

/**
 * Accounts worked in the window, grouped by the signals they had. An account
 * with two signal types counts in both rows; "No signal" is the baseline.
 */
export async function signalBreakdown(
  access: AccessContext,
  params: { clientId?: string | null; window: FunnelWindow },
): Promise<BreakdownRow[]> {
  const scope = clientFilter(access, params.clientId);
  const { from, to } = params.window;

  const rows = await db.$queryRaw<Array<{ key: string; contacted: number; replied: number; positive: number; connected: number; meetings: number }>>`
    WITH worked AS (
      SELECT a."id"
      FROM "Account" a
      WHERE a."organizationId" = ${access.organizationId}::uuid
        AND ${clientCond('a."clientId"', scope)}
        AND (
          EXISTS (SELECT 1 FROM "Message" m WHERE m."accountId" = a."id" AND m."direction" = 'OUTBOUND' AND m."sentAt" BETWEEN ${from} AND ${to})
          OR EXISTS (SELECT 1 FROM "Call" k WHERE k."accountId" = a."id" AND k."startedAt" BETWEEN ${from} AND ${to})
        )
    ),
    outcomes AS (
      SELECT w."id",
        EXISTS (SELECT 1 FROM "Message" r WHERE r."accountId" = w."id" AND r."direction" = 'INBOUND' AND COALESCE(r."replyClass"::text, '') <> 'OUT_OF_OFFICE') AS replied,
        EXISTS (SELECT 1 FROM "Message" r WHERE r."accountId" = w."id" AND r."direction" = 'INBOUND' AND r."replyClass" IN ('POSITIVE', 'REFERRAL')) AS positive,
        EXISTS (SELECT 1 FROM "Call" k WHERE k."accountId" = w."id" AND k."outcome" NOT IN ('NO_ANSWER', 'VOICEMAIL', 'WRONG_NUMBER')) AS connected,
        EXISTS (SELECT 1 FROM "Meeting" t WHERE t."accountId" = w."id" AND t."status" <> 'CANCELLED') AS met
      FROM worked w
    ),
    tagged AS (
      SELECT DISTINCT o.*, s."type"::text AS key
      FROM outcomes o JOIN "Signal" s ON s."accountId" = o."id" AND s."dismissedAt" IS NULL AND s."evidenceStatus" <> 'REJECTED'
      UNION ALL
      SELECT o.*, 'NONE' AS key FROM outcomes o
      WHERE NOT EXISTS (SELECT 1 FROM "Signal" s WHERE s."accountId" = o."id" AND s."dismissedAt" IS NULL AND s."evidenceStatus" <> 'REJECTED')
    )
    SELECT key,
      count(*)::int AS contacted,
      count(*) FILTER (WHERE replied)::int AS replied,
      count(*) FILTER (WHERE positive)::int AS positive,
      count(*) FILTER (WHERE connected)::int AS connected,
      count(*) FILTER (WHERE met)::int AS meetings
    FROM tagged GROUP BY key ORDER BY contacted DESC
  `;
  return finish(rows, (key) => (key === 'NONE' ? 'No signal' : SIGNAL_LABELS[key as keyof typeof SIGNAL_LABELS] ?? key));
}

/** Outbound emails grouped by how they were written, with replies they drew. */
export async function messageBreakdown(
  access: AccessContext,
  params: { clientId?: string | null; window: FunnelWindow; dimension: MessageDimension },
) {
  const scope = clientFilter(access, params.clientId);
  const groups = await db.message.groupBy({
    by: [params.dimension],
    where: { ...scope, direction: 'OUTBOUND', sentAt: { gte: params.window.from, lte: params.window.to } },
    _count: true,
  });
  const replied = await db.message.groupBy({
    by: [params.dimension],
    where: { ...scope, direction: 'OUTBOUND', status: 'REPLIED', sentAt: { gte: params.window.from, lte: params.window.to } },
    _count: true,
  });
  return groups
    .map((g) => {
      const key = String(g[params.dimension] ?? 'unknown');
      const r = replied.find((x) => String(x[params.dimension] ?? 'unknown') === key)?._count ?? 0;
      return {
        key,
        label: params.dimension === 'stepOrder' ? (key === 'unknown' ? 'Outside a sequence' : `Step ${Number(key) + 1}`) : key === 'unknown' ? 'Not recorded' : key,
        sent: g._count,
        replied: r,
        replyRate: g._count ? r / g._count : null,
        sufficient: g._count >= MIN_SAMPLE,
      };
    })
    .sort((a, b) => (params.dimension === 'stepOrder' ? a.key.localeCompare(b.key) : b.sent - a.sent));
}

/** Campaigns and playbooks side by side: what was sent and what came back. */
export async function campaignBreakdown(access: AccessContext, params: { clientId?: string | null; window: FunnelWindow }) {
  const scope = clientFilter(access, params.clientId);
  const range = { gte: params.window.from, lte: params.window.to };
  const [campaigns, sent, replied, calls, meetings] = await Promise.all([
    db.campaign.findMany({
      where: { ...scope, status: { not: 'ARCHIVED' } },
      select: { id: true, name: true, status: true, client: { select: { name: true } }, playbook: { select: { id: true, name: true } } },
    }),
    db.message.groupBy({ by: ['campaignId'], where: { ...scope, direction: 'OUTBOUND', sentAt: range }, _count: true }),
    db.message.groupBy({ by: ['campaignId'], where: { ...scope, direction: 'OUTBOUND', status: 'REPLIED', sentAt: range }, _count: true }),
    db.call.groupBy({ by: ['campaignId'], where: { ...scope, startedAt: range }, _count: true }),
    db.meeting.groupBy({ by: ['campaignId'], where: { ...scope, createdAt: range, status: { not: 'CANCELLED' } }, _count: true, _sum: { actualValueCents: true } }),
  ]);
  const get = <T extends { campaignId: string | null }>(rows: T[], id: string) => rows.find((r) => r.campaignId === id);
  const rows = campaigns.map((c) => {
    const s = get(sent, c.id)?._count ?? 0;
    const r = get(replied, c.id)?._count ?? 0;
    const m = get(meetings, c.id);
    return {
      id: c.id, name: c.name, status: c.status, client: c.client.name, playbook: c.playbook?.name ?? null, playbookId: c.playbook?.id ?? null,
      sent: s, replied: r, calls: get(calls, c.id)?._count ?? 0, meetings: m?._count ?? 0, revenueCents: m?._sum.actualValueCents ?? 0,
      replyRate: s ? r / s : null,
    };
  }).sort((a, b) => b.meetings - a.meetings || b.sent - a.sent);

  const playbooks = new Map<string, { name: string; sent: number; replied: number; calls: number; meetings: number; campaigns: number }>();
  for (const r of rows) {
    const key = r.playbookId ?? 'none';
    const p = playbooks.get(key) ?? { name: r.playbook ?? 'No playbook', sent: 0, replied: 0, calls: 0, meetings: 0, campaigns: 0 };
    p.sent += r.sent; p.replied += r.replied; p.calls += r.calls; p.meetings += r.meetings; p.campaigns++;
    playbooks.set(key, p);
  }
  return {
    campaigns: rows,
    playbooks: [...playbooks.entries()].map(([id, p]) => ({ id, ...p, replyRate: p.sent ? p.replied / p.sent : null })),
  };
}

/** Each caller's activity and results. */
export async function callerBreakdown(access: AccessContext, params: { clientId?: string | null; window: FunnelWindow }) {
  const scope = clientFilter(access, params.clientId);
  const range = { gte: params.window.from, lte: params.window.to };
  const [attempts, outcomes, booked] = await Promise.all([
    db.call.groupBy({ by: ['callerId'], where: { ...scope, startedAt: range }, _count: true, _sum: { durationSeconds: true } }),
    db.call.groupBy({ by: ['callerId', 'outcome'], where: { ...scope, startedAt: range }, _count: true }),
    db.meeting.groupBy({ by: ['bookedById'], where: { ...scope, createdAt: range, source: 'CALL' }, _count: true }),
  ]);
  const users = await db.user.findMany({
    where: { id: { in: attempts.map((a) => a.callerId).filter((x): x is string => !!x) } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  return attempts.map((a) => {
    const u = users.find((x) => x.id === a.callerId);
    const of = (o: string[]) => outcomes.filter((x) => x.callerId === a.callerId && o.includes(x.outcome)).reduce((n, x) => n + x._count, 0);
    const connections = a._count - of(['NO_ANSWER', 'VOICEMAIL', 'WRONG_NUMBER']);
    const meetings = booked.find((b) => b.bookedById === a.callerId)?._count ?? 0;
    return {
      callerId: a.callerId,
      name: u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email : 'Unknown',
      calls: a._count,
      talkMinutes: Math.round((a._sum.durationSeconds ?? 0) / 60),
      connections,
      qualified: of(['QUALIFIED', 'MEETING_BOOKED']),
      meetings,
      connectRate: a._count ? connections / a._count : null,
      meetingsPerConnection: connections ? meetings / connections : null,
    };
  }).sort((a, b) => b.meetings - a.meetings || b.calls - a.calls);
}

/** Objections heard on calls, most common first — what the market is saying. */
export async function objectionBreakdown(access: AccessContext, params: { clientId?: string | null; window: FunnelWindow }) {
  const scope = clientFilter(access, params.clientId);
  const calls = await db.call.findMany({
    where: { ...scope, startedAt: { gte: params.window.from, lte: params.window.to }, NOT: { objections: { isEmpty: true } } },
    select: { objections: true },
  });
  const counts = new Map<string, number>();
  for (const c of calls) for (const o of c.objections) counts.set(o, (counts.get(o) ?? 0) + 1);
  return [...counts.entries()].map(([key, count]) => ({ key, label: humanize(key), count })).sort((a, b) => b.count - a.count);
}

/**
 * Plain-English findings, generated only from rows with enough data. Never
 * more confident than the numbers: each sentence states its sample.
 */
export function insightsFrom(dimensionLabel: string, rows: BreakdownRow[]): string[] {
  return rows
    .filter((r) => r.lift !== null && (r.lift >= 1.5 || r.lift <= 0.67) && r.key !== 'Unknown' && r.key !== 'UNKNOWN')
    .sort((a, b) => Math.abs(Math.log(b.lift!)) - Math.abs(Math.log(a.lift!)))
    .slice(0, 3)
    .map((r) => {
      const direction = r.lift! >= 1 ? `${r.lift!.toFixed(1)}× the rate of the rest` : `${(1 / r.lift!).toFixed(1)}× less often than the rest`;
      return `${dimensionLabel} "${r.label}" booked meetings at ${direction} (${r.meetings} of ${r.contacted} contacted).`;
    });
}

