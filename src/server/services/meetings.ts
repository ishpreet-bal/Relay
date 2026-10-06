import { z } from 'zod';
import { addMinutes } from 'date-fns';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { clientFilter, type AccessContext } from '@/server/access/scope';
import { NotFoundError } from '@/server/errors';
import { logActivity } from './activity';
import { advanceAccountStatus } from './accounts';
import { exitEnrollment } from './campaigns';
import { rescoreAccount } from './scoring';
import { MEETING_STATUSES, MEETING_OUTCOMES } from '@/lib/domain';

/**
 * Meetings are where Foundry's work becomes the client's pipeline. Scheduling
 * status (booked → attended / no-show / cancelled) is tracked separately from
 * the commercial outcome (qualified opportunity → won / lost), and both feed
 * analytics, because "meetings booked" and "revenue created" are different
 * questions.
 */

export { MEETING_STATUSES, MEETING_OUTCOMES };

export const meetingInputSchema = z.object({
  accountId: z.string().uuid(),
  contactId: z.string().uuid().nullish(),
  campaignId: z.string().uuid().nullish(),
  title: z.string().trim().min(1).max(200).optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional(),
  durationMinutes: z.number().int().min(5).max(480).default(30),
  timezone: z.string().max(60).nullish(),
  location: z.string().trim().max(300).nullish(),
  meetingUrl: z.string().url().max(500).nullish(),
  source: z.enum(['CALL', 'EMAIL_REPLY', 'CALENDAR_LINK', 'INBOUND', 'MANUAL']).default('MANUAL'),
  qualificationNotes: z.string().trim().max(4000).nullish(),
  notes: z.string().trim().max(4000).nullish(),
  estimatedValueCents: z.number().int().min(0).max(1_000_000_000).nullish(),
});
export type MeetingInput = z.input<typeof meetingInputSchema>;

export async function createMeeting(
  access: AccessContext,
  userId: string | null,
  raw: MeetingInput,
  opts: { callId?: string; tx?: Prisma.TransactionClient } = {},
) {
  const input = meetingInputSchema.parse(raw);
  const client = opts.tx ?? db;
  const account = await client.account.findFirst({
    where: { id: input.accountId, ...clientFilter(access), deletedAt: null },
    include: { client: { select: { currency: true, timezone: true } } },
  });
  if (!account) throw new NotFoundError('Account');
  const contact = input.contactId
    ? await client.contact.findFirst({ where: { id: input.contactId, accountId: account.id, deletedAt: null } })
    : null;
  if (input.contactId && !contact) throw new NotFoundError('Contact');

  const contactName = contact ? [contact.firstName, contact.lastName].filter(Boolean).join(' ') : null;
  const meeting = await client.meeting.create({
    data: {
      organizationId: access.organizationId,
      clientId: account.clientId,
      accountId: account.id,
      contactId: contact?.id ?? null,
      campaignId: input.campaignId ?? null,
      callId: opts.callId ?? null,
      bookedById: userId,
      title: input.title ?? `Intro: ${account.name}${contactName ? ` (${contactName})` : ''}`,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? addMinutes(input.startsAt, input.durationMinutes),
      timezone: input.timezone ?? account.client.timezone,
      location: input.location ?? null,
      meetingUrl: input.meetingUrl ?? null,
      source: input.source,
      qualificationNotes: input.qualificationNotes ?? null,
      notes: input.notes ?? null,
      estimatedValueCents: input.estimatedValueCents ?? null,
      currency: account.client.currency,
    },
  });

  await advanceAccountStatus(account.id, 'MEETING_BOOKED', client);
  if (!opts.tx) await afterMeetingBooked(access.organizationId, meeting.id);
  return meeting;
}

/** Side effects that run outside the booking transaction. */
export async function afterMeetingBooked(organizationId: string, meetingId: string) {
  const meeting = await db.meeting.findUniqueOrThrow({ where: { id: meetingId } });
  // A booked meeting ends every email sequence at the account and takes the
  // contact out of the call queue.
  await exitEnrollment({ accountId: meeting.accountId, reason: 'REPLIED', note: 'Meeting booked' });
  if (meeting.contactId) {
    await db.callTask.updateMany({
      where: { contactId: meeting.contactId, status: { in: ['OPEN', 'SNOOZED'] } },
      data: { status: 'COMPLETED', completedAt: new Date(), completedReason: 'Meeting booked' },
    });
  }
  await logActivity({
    organizationId, clientId: meeting.clientId, accountId: meeting.accountId, contactId: meeting.contactId,
    campaignId: meeting.campaignId, userId: meeting.bookedById, type: 'MEETING',
    title: `Meeting booked for ${meeting.startsAt.toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone: meeting.timezone ?? 'America/Toronto' })}`,
    body: meeting.qualificationNotes,
    metadata: { meetingId: meeting.id, source: meeting.source },
  });
  await rescoreAccount(meeting.accountId);
}

export const meetingUpdateSchema = z.object({
  status: z.enum(MEETING_STATUSES).optional(),
  outcome: z.enum(MEETING_OUTCOMES).optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  location: z.string().trim().max(300).nullish(),
  meetingUrl: z.string().url().max(500).nullish(),
  qualificationNotes: z.string().trim().max(4000).nullish(),
  notes: z.string().trim().max(4000).nullish(),
  estimatedValueCents: z.number().int().min(0).max(1_000_000_000).nullish(),
  actualValueCents: z.number().int().min(0).max(1_000_000_000).nullish(),
  cancelledReason: z.string().trim().max(500).nullish(),
});

export async function updateMeeting(access: AccessContext, userId: string, id: string, raw: z.input<typeof meetingUpdateSchema>) {
  const patch = meetingUpdateSchema.parse(raw);
  const before = await db.meeting.findFirst({ where: { id, ...clientFilter(access) } });
  if (!before) throw new NotFoundError('Meeting');

  const rescheduled = patch.startsAt && patch.startsAt.getTime() !== before.startsAt.getTime();
  const after = await db.meeting.update({
    where: { id },
    data: {
      ...patch,
      ...(rescheduled && !patch.status ? { status: 'RESCHEDULED' as const } : {}),
      ...(patch.outcome && patch.outcome !== before.outcome ? { outcomeRecordedAt: new Date() } : {}),
    },
  });

  if (patch.outcome === 'WON') await db.account.update({ where: { id: after.accountId }, data: { status: 'WON' } });
  if (patch.outcome === 'LOST') await db.account.update({ where: { id: after.accountId }, data: { status: 'LOST' } });

  const changes = [
    patch.status && patch.status !== before.status ? `status ${patch.status.toLowerCase().replace(/_/g, ' ')}` : null,
    patch.outcome && patch.outcome !== before.outcome ? `outcome ${patch.outcome.toLowerCase().replace(/_/g, ' ')}` : null,
    rescheduled ? 'rescheduled' : null,
    patch.actualValueCents != null && patch.actualValueCents !== before.actualValueCents ? 'deal value recorded' : null,
  ].filter(Boolean);
  if (changes.length) {
    await logActivity({
      organizationId: access.organizationId, clientId: after.clientId, accountId: after.accountId, contactId: after.contactId,
      userId, type: 'MEETING', title: `Meeting updated: ${changes.join(', ')}`,
      body: patch.notes ?? null, metadata: { meetingId: id, before: { status: before.status, outcome: before.outcome } },
    });
  }
  return after;
}

export const meetingFilterSchema = z.object({
  clientId: z.string().uuid().nullish(),
  range: z.enum(['upcoming', 'past', 'all']).default('upcoming'),
  status: z.array(z.enum(MEETING_STATUSES)).optional(),
  limit: z.number().int().min(1).max(200).default(100),
});

export async function listMeetings(access: AccessContext, raw: z.input<typeof meetingFilterSchema>) {
  const f = meetingFilterSchema.parse(raw);
  const now = new Date();
  return db.meeting.findMany({
    where: {
      ...clientFilter(access, f.clientId),
      ...(f.range === 'upcoming' ? { startsAt: { gte: addMinutes(now, -60) } } : f.range === 'past' ? { startsAt: { lt: now } } : {}),
      ...(f.status?.length ? { status: { in: f.status } } : {}),
    },
    orderBy: { startsAt: f.range === 'past' ? 'desc' : 'asc' },
    take: f.limit,
    include: {
      account: { select: { id: true, name: true, industry: true, city: true, region: true } },
      contact: { select: { id: true, firstName: true, lastName: true, title: true, email: true, phone: true, directPhone: true } },
      client: { select: { id: true, name: true } },
      campaign: { select: { id: true, name: true } },
      bookedBy: { select: { firstName: true, lastName: true } },
    },
  });
}
