import { z } from 'zod';
import type { CallOutcome, ObjectionType, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { clientFilter, type AccessContext } from '@/server/access/scope';
import { DomainError, NotFoundError } from '@/server/errors';
import { logActivity } from './activity';
import { advanceAccountStatus } from './accounts';
import { exitEnrollment } from './campaigns';
import { createContactRecord } from './contacts';
import { afterMeetingBooked, createMeeting } from './meetings';
import { refreshCallTask } from './call-queue';
import { setFieldEvidence } from './provenance';
import { rescoreAccount } from './scoring';
import { suppress, normalizePhone } from './suppression';
import { CALL_OUTCOMES, OBJECTIONS, OUTCOME_LABELS, OBJECTION_LABELS } from '@/lib/domain';

export { CALL_OUTCOMES, OBJECTIONS, OUTCOME_LABELS, OBJECTION_LABELS };

export const logCallSchema = z.object({
  contactId: z.string().uuid(),
  outcome: z.enum(CALL_OUTCOMES),
  objections: z.array(z.enum(OBJECTIONS)).max(7).default([]),
  objectionNote: z.string().trim().max(1000).nullish(),
  notes: z.string().trim().max(5000).nullish(),
  callbackAt: z.coerce.date().nullish(),
  durationSeconds: z.number().int().min(0).max(4 * 3600).nullish(),
  phoneNumber: z.string().trim().max(40).nullish(),
  referredTo: z.object({
    firstName: z.string().trim().max(80).nullish(),
    lastName: z.string().trim().max(80).nullish(),
    title: z.string().trim().max(160).nullish(),
    email: z.string().trim().email().max(254).nullish().or(z.literal('').transform(() => null)),
    phone: z.string().trim().max(40).nullish(),
  }).nullish(),
  meeting: z.object({
    startsAt: z.coerce.date(),
    durationMinutes: z.number().int().min(5).max(480).default(30),
    location: z.string().trim().max(300).nullish(),
    meetingUrl: z.string().url().max(500).nullish(),
    qualificationNotes: z.string().trim().max(4000).nullish(),
    estimatedValueCents: z.number().int().min(0).nullish(),
  }).nullish(),
});
export type LogCallInput = z.input<typeof logCallSchema>;

/** What each outcome does to the email sequence. */
const STOPS_SEQUENCE: Partial<Record<CallOutcome, 'contact' | 'account'>> = {
  NOT_INTERESTED: 'contact',
  DO_NOT_CALL: 'contact',
  WRONG_PERSON: 'contact',
  INTERESTED: 'account',
  QUALIFIED: 'account',
  MEETING_BOOKED: 'account',
};

/**
 * Records a call and everything that follows from its outcome: the contact's
 * phone data, the account's lifecycle, the email sequence, the suppression
 * list, a booked meeting, a referral, and the contact's place in the queue.
 * Snapshots of the queue priority and reasons at the moment of the call are
 * stored, so the ranking can later be judged against what happened.
 */
export async function logCall(access: AccessContext, userId: string, raw: LogCallInput) {
  const input = logCallSchema.parse(raw);
  if (input.outcome === 'CALL_BACK' && !input.callbackAt) {
    throw new DomainError('Pick a time to call back.');
  }
  if (input.outcome === 'MEETING_BOOKED' && !input.meeting) {
    throw new DomainError('Add the meeting time to record a booked meeting.');
  }

  const contact = await db.contact.findFirst({
    where: { id: input.contactId, ...clientFilter(access), deletedAt: null },
    include: {
      account: { select: { id: true, clientId: true, score: true, name: true } },
      callTask: true,
      enrollments: { where: { status: { in: ['ACTIVE', 'PENDING', 'PAUSED'] } }, select: { campaignId: true }, take: 1 },
    },
  });
  if (!contact) throw new NotFoundError('Contact');

  const now = new Date();
  const phoneNumber = input.phoneNumber ?? contact.directPhone ?? contact.mobilePhone ?? contact.phone;
  const campaignId = contact.enrollments[0]?.campaignId ?? contact.callTask?.campaignId ?? null;

  const { call, meetingId } = await db.$transaction(async (tx) => {
    const call = await tx.call.create({
      data: {
        organizationId: access.organizationId,
        clientId: contact.clientId,
        accountId: contact.accountId,
        contactId: contact.id,
        campaignId,
        callTaskId: contact.callTask?.id ?? null,
        callerId: userId,
        phoneNumber,
        startedAt: input.durationSeconds ? new Date(now.getTime() - input.durationSeconds * 1000) : now,
        endedAt: now,
        durationSeconds: input.durationSeconds ?? null,
        outcome: input.outcome,
        objections: input.objections,
        objectionNote: input.objectionNote ?? null,
        notes: input.notes ?? null,
        callbackAt: input.callbackAt ?? null,
        referredTo: (input.referredTo ?? undefined) as Prisma.InputJsonValue | undefined,
        queuePriorityAtCall: contact.callTask?.priority ?? null,
        queueReasonsAtCall: (contact.callTask?.reasons ?? undefined) as Prisma.InputJsonValue | undefined,
        accountScoreAtCall: contact.account.score,
        contactScoreAtCall: contact.score,
      },
    });

    await tx.contact.update({
      where: { id: contact.id },
      data: {
        lastCalledAt: now,
        callAttempts: { increment: 1 },
        ...(input.outcome === 'WRONG_NUMBER' ? { phoneStatus: 'WRONG_NUMBER' } : {}),
        ...(input.outcome === 'WRONG_PERSON' ? { status: 'WRONG_PERSON' } : {}),
        ...(['CONNECTED', 'INTERESTED', 'QUALIFIED', 'MEETING_BOOKED', 'CALL_BACK'].includes(input.outcome) && contact.phoneStatus === 'UNVERIFIED'
          ? { phoneStatus: 'VALID' } : {}),
      },
    });
    if (contact.callTask) {
      await tx.callTask.update({
        where: { id: contact.callTask.id },
        data: { attempts: { increment: 1 }, lastAttemptAt: now, lastOutcome: input.outcome },
      });
    }

    await advanceAccountStatus(contact.accountId, 'CALLING', tx);

    let meetingId: string | null = null;
    if (input.outcome === 'MEETING_BOOKED' && input.meeting) {
      const meeting = await createMeeting(access, userId, {
        accountId: contact.accountId,
        contactId: contact.id,
        campaignId,
        source: 'CALL',
        ...input.meeting,
      }, { callId: call.id, tx });
      meetingId = meeting.id;
    }
    return { call, meetingId };
  });

  // Consequences that touch other subsystems run after the call is safely recorded.
  if (input.outcome === 'DO_NOT_CALL') {
    const number = normalizePhone(phoneNumber);
    if (number) {
      await suppress({
        organizationId: access.organizationId, clientId: null, scope: 'PHONE', channel: 'PHONE', value: number,
        reason: 'DO_NOT_CALL', source: 'CALL_OUTCOME', contactId: contact.id, createdById: userId,
        note: `Asked not to be called (${[contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'contact'})`,
      });
    }
    await db.contact.update({ where: { id: contact.id }, data: { doNotCall: true, suppressedAt: now, suppressReason: 'DO_NOT_CALL' } });
  }
  if (input.outcome === 'WRONG_NUMBER') {
    await setFieldEvidence({ contactId: contact.id }, phoneNumber === contact.directPhone ? 'directPhone' : phoneNumber === contact.mobilePhone ? 'mobilePhone' : 'phone', 'REJECTED');
  }

  const stop = STOPS_SEQUENCE[input.outcome];
  if (stop) {
    await exitEnrollment(stop === 'account'
      ? { accountId: contact.accountId, reason: 'REPLIED', note: `Call: ${OUTCOME_LABELS[input.outcome].toLowerCase()}` }
      : { contactId: contact.id, reason: 'REMOVED', note: `Call: ${OUTCOME_LABELS[input.outcome].toLowerCase()}` });
  }

  let referredContactId: string | null = null;
  // "Wrong person — talk to Sam" is a referral too.
  if ((input.outcome === 'REFERRED' || input.outcome === 'WRONG_PERSON') && input.referredTo && (input.referredTo.firstName || input.referredTo.email || input.referredTo.phone)) {
    const referral = await db.$transaction((tx) => createContactRecord(tx, {
      organizationId: access.organizationId, clientId: contact.clientId, accountId: contact.accountId,
      input: {
        firstName: input.referredTo!.firstName, lastName: input.referredTo!.lastName, title: input.referredTo!.title,
        email: input.referredTo!.email ?? null, phone: input.referredTo!.phone, source: 'REFERRAL',
        consentNote: `Referred by ${[contact.firstName, contact.lastName].filter(Boolean).join(' ')} on a call`,
      },
      userId,
    }));
    referredContactId = referral.contact.id;
  }

  const objections = input.objections.map((o) => OBJECTION_LABELS[o]).join(', ');
  await logActivity({
    organizationId: access.organizationId, clientId: contact.clientId, accountId: contact.accountId, contactId: contact.id,
    campaignId, userId, type: 'CALL',
    title: `Call: ${OUTCOME_LABELS[input.outcome]}`,
    body: [input.notes, objections ? `Objections: ${objections}${input.objectionNote ? ` — ${input.objectionNote}` : ''}` : null,
      input.callbackAt ? `Call back ${input.callbackAt.toLocaleString('en-CA')}` : null].filter(Boolean).join('\n') || null,
    metadata: { callId: call.id, outcome: input.outcome, objections: input.objections },
  });

  if (meetingId) await afterMeetingBooked(access.organizationId, meetingId);
  await rescoreAccount(contact.accountId);

  // Re-rank this contact; unanswered calls space themselves out, callbacks
  // become due, closed outcomes leave the queue.
  const task = await refreshCallTask(contact.id);
  if (!task && contact.callTask && ['MEETING_BOOKED', 'QUALIFIED', 'NOT_INTERESTED', 'DO_NOT_CALL', 'WRONG_PERSON', 'WRONG_NUMBER', 'REFERRED'].includes(input.outcome)) {
    await db.callTask.update({
      where: { id: contact.callTask.id },
      data: { status: 'COMPLETED', completedAt: now, completedReason: OUTCOME_LABELS[input.outcome] },
    });
  }
  if (referredContactId) await refreshCallTask(referredContactId, { manual: true });

  return { call, meetingId, referredContactId };
}

// ---------------------------------------------------------------------------
// Call preparation
// ---------------------------------------------------------------------------

export interface ObjectionResponse { objection: ObjectionType; response: string }

function fill(template: string | null | undefined, vars: Record<string, string>) {
  if (!template) return null;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
}

/**
 * Everything a caller needs before dialing, on one screen: who, why now,
 * what we know (and how we know it), what was already said, what to open
 * with, and how to handle the likely objections for this client's offer.
 */
export async function getCallPrep(access: AccessContext, contactId: string) {
  const contact = await db.contact.findFirst({
    where: { id: contactId, ...clientFilter(access), deletedAt: null },
    include: {
      account: {
        include: {
          research: { select: { companySummary: true, talkingPoints: true, facts: true, relevance: true, refreshedAt: true, status: true } },
          signals: { where: { dismissedAt: null, evidenceStatus: { not: 'REJECTED' } }, orderBy: [{ eventDate: { sort: 'desc', nulls: 'last' } }, { detectedAt: 'desc' }], take: 6 },
          contacts: {
            where: { deletedAt: null, id: { not: contactId } },
            orderBy: { score: 'desc' },
            take: 6,
            select: { id: true, firstName: true, lastName: true, title: true, score: true, doNotCall: true },
          },
        },
      },
      client: {
        include: {
          offers: { where: { isActive: true }, orderBy: { createdAt: 'asc' }, take: 1 },
          playbooks: { where: { isActive: true }, orderBy: { updatedAt: 'desc' }, take: 1 },
          proofPoints: { where: { isActive: true, approvedForOutreach: true }, take: 5 },
        },
      },
      callTask: true,
      enrollments: {
        where: { status: { in: ['ACTIVE', 'PENDING', 'PAUSED'] } },
        include: { campaign: { include: { playbook: true, offer: true } } },
        take: 1,
      },
    },
  });
  if (!contact) throw new NotFoundError('Contact');

  const [messages, calls, meetings] = await Promise.all([
    db.message.findMany({
      where: { accountId: contact.accountId, status: { notIn: ['CANCELLED', 'GENERATING', 'DRAFT', 'NEEDS_EDIT'] } },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: {
        id: true, direction: true, status: true, subject: true, bodyText: true, sentAt: true, createdAt: true,
        openCount: true, clickCount: true, replyClass: true, stepOrder: true, contactId: true,
        campaign: { select: { name: true } },
      },
    }),
    db.call.findMany({
      where: { accountId: contact.accountId },
      orderBy: { startedAt: 'desc' },
      take: 10,
      include: { caller: { select: { firstName: true, lastName: true } }, contact: { select: { firstName: true, lastName: true } } },
    }),
    db.meeting.findMany({ where: { accountId: contact.accountId }, orderBy: { startsAt: 'desc' }, take: 5 }),
  ]);

  const enrollment = contact.enrollments[0];
  const playbook = enrollment?.campaign.playbook ?? contact.client.playbooks[0] ?? null;
  const offer = enrollment?.campaign.offer ?? contact.client.offers[0] ?? null;
  const vars = {
    firstName: contact.firstName ?? 'there',
    company: contact.account.name,
    client: contact.client.name,
    offer: offer?.summary ?? '',
  };

  return {
    contact,
    account: contact.account,
    client: { id: contact.client.id, name: contact.client.name, timezone: contact.client.timezone },
    offer,
    playbook: playbook ? { id: playbook.id, name: playbook.name, discoveryQuestions: playbook.discoveryQuestions, qualificationCriteria: playbook.qualificationCriteria } : null,
    opener: fill(playbook?.callOpener, vars)
      ?? `Hi ${vars.firstName}, it's {your name} with ${contact.client.name}. ${offer ? `We help companies like ${contact.account.name} with ${offer.summary.toLowerCase()}.` : ''} Did I catch you at an okay time?`,
    objectionHandling: (Array.isArray(playbook?.objectionHandling) ? playbook!.objectionHandling : []) as unknown as ObjectionResponse[],
    proofPoints: contact.client.proofPoints,
    talkingPoints: contact.account.research?.talkingPoints ?? [],
    whyNow: (contact.callTask?.reasons ?? []) as unknown as Array<{ code: string; label: string; points: number }>,
    callTask: contact.callTask,
    messages,
    calls,
    meetings,
    previousObjections: [...new Set(calls.flatMap((c) => c.objections))],
  };
}

export async function listCalls(access: AccessContext, params: { clientId?: string | null; callerId?: string; limit?: number }) {
  return db.call.findMany({
    where: { ...clientFilter(access, params.clientId), ...(params.callerId ? { callerId: params.callerId } : {}) },
    orderBy: { startedAt: 'desc' },
    take: params.limit ?? 50,
    include: {
      contact: { select: { id: true, firstName: true, lastName: true, title: true } },
      account: { select: { id: true, name: true } },
      caller: { select: { firstName: true, lastName: true } },
    },
  });
}
