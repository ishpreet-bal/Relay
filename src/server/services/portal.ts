import { db } from '@/lib/db';
import { assertClientAccess, type AccessContext } from '@/server/access/scope';
import { NotFoundError } from '@/server/errors';
import { funnel, meetingsTrend, windowFromDays } from './analytics/funnel';

/**
 * What a client sees. Every function here returns a curated shape: results,
 * meetings and campaign performance, never prompts, internal notes, provider
 * data, scores' inner workings or review machinery. The portal is read-only
 * except for the client's own business profile (see services/clients).
 */

async function portalClient(access: AccessContext, clientId: string) {
  assertClientAccess(access, clientId);
  const client = await db.client.findFirst({
    where: { id: clientId, organizationId: access.organizationId, archivedAt: null },
    select: { id: true, name: true, currency: true, timezone: true, status: true },
  });
  if (!client) throw new NotFoundError('Client');
  return client;
}

export async function portalOverview(access: AccessContext, clientId: string, days = 30) {
  const client = await portalClient(access, clientId);
  const window = windowFromDays(days);
  const [{ funnel: f }, trend, upcoming, totals] = await Promise.all([
    funnel(access, { clientId, window }),
    meetingsTrend(access, { clientId, weeks: 12 }),
    portalMeetings(access, clientId, 'upcoming', 5),
    db.meeting.aggregate({
      where: { clientId, status: { not: 'CANCELLED' } },
      _count: true,
      _sum: { actualValueCents: true },
    }),
  ]);
  return {
    client,
    days,
    numbers: {
      prospectsIdentified: f.accountsQualified,
      contactsFound: f.contactsFound,
      emailsSent: f.emailsSent,
      calls: f.callsAttempted,
      conversations: f.connections,
      positiveReplies: f.positiveReplies,
      meetingsBooked: f.meetingsBooked,
      meetingsHeld: f.meetingsHeld,
      pipelineCents: f.pipelineCents,
      dealsWon: f.dealsWon,
      revenueCents: f.revenueCents,
    },
    allTime: { meetings: totals._count, revenueCents: totals._sum.actualValueCents ?? 0 },
    trend,
    upcoming,
  };
}

export async function portalMeetings(access: AccessContext, clientId: string, range: 'upcoming' | 'past' | 'all' = 'all', limit = 100) {
  await portalClient(access, clientId);
  const now = new Date();
  const meetings = await db.meeting.findMany({
    where: {
      clientId,
      ...(range === 'upcoming' ? { startsAt: { gte: now }, status: { in: ['BOOKED', 'CONFIRMED', 'RESCHEDULED'] } } : {}),
      ...(range === 'past' ? { startsAt: { lt: now } } : {}),
    },
    orderBy: { startsAt: range === 'past' ? 'desc' : 'asc' },
    take: limit,
    select: {
      id: true, title: true, startsAt: true, endsAt: true, timezone: true, location: true, meetingUrl: true,
      status: true, outcome: true, qualificationNotes: true, estimatedValueCents: true, actualValueCents: true, currency: true,
      account: { select: { name: true, industry: true, city: true, region: true, websiteUrl: true } },
      contact: { select: { firstName: true, lastName: true, title: true, email: true, phone: true, directPhone: true } },
    },
  });
  // Internal notes are never selected; qualification notes are written for the client.
  return meetings;
}

export async function portalCampaigns(access: AccessContext, clientId: string) {
  await portalClient(access, clientId);
  const campaigns = await db.campaign.findMany({
    where: { clientId, status: { not: 'ARCHIVED' } },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true, name: true, status: true, startedAt: true,
      offer: { select: { summary: true } },
      icp: { select: { name: true } },
      _count: { select: { enrollments: true } },
    },
  });
  const ids = campaigns.map((c) => c.id);
  const [sent, replies, positive, meetings] = await Promise.all([
    db.message.groupBy({ by: ['campaignId'], where: { campaignId: { in: ids }, direction: 'OUTBOUND', sentAt: { not: null } }, _count: true }),
    db.message.groupBy({ by: ['campaignId'], where: { campaignId: { in: ids }, direction: 'INBOUND', replyClass: { not: 'OUT_OF_OFFICE' } }, _count: true }),
    db.message.groupBy({ by: ['campaignId'], where: { campaignId: { in: ids }, direction: 'INBOUND', replyClass: { in: ['POSITIVE', 'REFERRAL'] } }, _count: true }),
    db.meeting.groupBy({ by: ['campaignId'], where: { campaignId: { in: ids }, status: { not: 'CANCELLED' } }, _count: true }),
  ]);
  const count = (rows: Array<{ campaignId: string | null; _count: number }>, id: string) => rows.find((r) => r.campaignId === id)?._count ?? 0;
  return campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    startedAt: c.startedAt,
    offer: c.offer?.summary ?? null,
    audience: c.icp?.name ?? null,
    prospects: c._count.enrollments,
    emailsSent: count(sent, c.id),
    replies: count(replies, c.id),
    positiveReplies: count(positive, c.id),
    meetings: count(meetings, c.id),
  }));
}

/** The client's own profile, offers, ICPs and team, as they may see and edit them. */
export async function portalSettings(access: AccessContext, clientId: string) {
  await portalClient(access, clientId);
  return db.client.findUniqueOrThrow({
    where: { id: clientId },
    select: {
      id: true, name: true, websiteUrl: true, description: true, productsServices: true, serviceAreas: true,
      industriesServed: true, differentiators: true, existingCustomers: true, averageDealValueCents: true,
      currency: true, timezone: true, senderName: true, senderTitle: true, bookingUrl: true,
      primaryContactName: true, primaryContactEmail: true, primaryContactPhone: true,
      offers: { where: { isActive: true }, select: { id: true, name: true, summary: true, valueProposition: true, callToAction: true } },
      icps: {
        where: { isActive: true },
        select: {
          id: true, name: true, description: true, industries: true, employeeMin: true, employeeMax: true,
          locations: true, targetTitles: true, requiredAttributes: true,
        },
      },
      proofPoints: { where: { isActive: true }, select: { id: true, kind: true, title: true, statement: true, approvedForOutreach: true } },
      memberships: {
        where: { role: { in: ['CLIENT_ADMIN', 'CLIENT_MEMBER'] } },
        select: { role: true, user: { select: { firstName: true, lastName: true, email: true } } },
      },
    },
  });
}
