import { createHmac } from 'node:crypto';
import { z } from 'zod';
import type { ConsentBasis, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { clientFilter, systemAccess, type AccessContext } from '@/server/access/scope';
import { DomainError, NotConfiguredError, NotFoundError } from '@/server/errors';
import { createAccount } from '@/server/services/accounts';
import { logActivity } from '@/server/services/activity';
import { CATEGORIES, CATEGORY_LABELS, categorize, inquirySchema, MARKETING_CONSENT_TEXT, SERVICE_CHOICES, splitName, type InquiryInput } from '@/site/inquiry';
import { CONSULT_MINUTES, CONSULT_TZ, formatSlot, isOfferedSlot } from '@/site/consultation';

/**
 * Website inquiries. A visitor's message is stored first, exactly as sent;
 * then it is linked into the CRM as an account, a contact with its consent
 * recorded, a note and a follow-up task. If linking fails, the inquiry is
 * still there for a person to pick up. Nothing here sends email.
 */

export const INQUIRY_STATUSES = ['NEW', 'CONTACTED', 'BOOKED', 'QUALIFIED', 'CLOSED', 'SPAM'] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

const PER_IP_PER_HOUR = 5;
const PER_EMAIL_PER_DAY = 3;
const MIN_FILL_MS = 2500;

export class RateLimitedError extends Error {}
export class InvalidInquiryError extends Error {
  constructor(public fields: Record<string, string>) {
    super('Please check the highlighted fields.');
  }
}

export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  const key = process.env.ENCRYPTION_KEY ?? process.env.UNSUBSCRIBE_SIGNING_KEY ?? 'relay-inquiries';
  return createHmac('sha256', key).update(`inquiry:${ip}`).digest('hex').slice(0, 32);
}

/**
 * Where website inquiries land: INQUIRY_CLIENT_ID when set, otherwise the
 * workspace's one internal client (Relay itself). Anything ambiguous is a
 * configuration problem, not a guess.
 */
async function inquiryTarget(): Promise<{ organizationId: string; clientId: string }> {
  const configured = process.env.INQUIRY_CLIENT_ID;
  if (configured) {
    const c = await db.client.findFirst({ where: { id: configured, archivedAt: null }, select: { id: true, organizationId: true } });
    if (!c) throw new NotConfiguredError('inquiries', 'INQUIRY_CLIENT_ID does not match an active client.');
    return { organizationId: c.organizationId, clientId: c.id };
  }
  const internal = await db.client.findMany({ where: { kind: 'INTERNAL', archivedAt: null }, select: { id: true, organizationId: true }, take: 2 });
  if (internal.length !== 1) throw new NotConfiguredError('inquiries', 'Set INQUIRY_CLIENT_ID to the client that should receive website inquiries.');
  return { organizationId: internal[0]!.organizationId, clientId: internal[0]!.id };
}

const CONSENT_RANK: Record<ConsentBasis, number> = { UNKNOWN: 0, IMPLIED_PUBLISHED: 1, IMPLIED_RELATIONSHIP: 2, EXPRESS: 3 };

export type SubmitResult = { ok: true; id: string };

export async function submitInquiry(raw: InquiryInput, meta: { ip: string | null; now?: Date }): Promise<SubmitResult> {
  const now = meta.now ?? new Date();
  const parsed = inquirySchema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[String(issue.path[0] ?? 'form')] ??= issue.message;
    throw new InvalidInquiryError(fields);
  }
  const input = parsed.data;
  const badTime = input.preferredTimes.find((t) => !isOfferedSlot(t, now));
  if (badTime) throw new InvalidInquiryError({ preferredTimes: 'One of the times is no longer available. Please pick again.' });

  const ipHash = hashIp(meta.ip);
  const hourAgo = new Date(now.getTime() - 3_600_000);
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const [byIp, byEmail] = await Promise.all([
    ipHash ? db.inquiry.count({ where: { ipHash, createdAt: { gte: hourAgo } } }) : 0,
    db.inquiry.count({ where: { email: input.email, createdAt: { gte: dayAgo } } }),
  ]);
  if (byIp >= PER_IP_PER_HOUR || byEmail >= PER_EMAIL_PER_DAY) throw new RateLimitedError('Too many inquiries. Please try again later, or email us directly.');

  // Likely automated: kept for a person to glance at, but never put in the CRM.
  const spamReason = input.companyWebsite ? 'Hidden field was filled in'
    : input.startedAt && now.getTime() - input.startedAt < MIN_FILL_MS ? 'Sent within seconds of opening the form'
    : null;

  const target = await inquiryTarget();
  const { category, source } = categorize(input.service, input.message);
  const inquiry = await db.inquiry.create({
    data: {
      organizationId: target.organizationId,
      clientId: target.clientId,
      name: input.name,
      company: input.company,
      email: input.email,
      phone: input.phone ?? null,
      website: input.website ?? null,
      industry: input.industry ?? null,
      service: input.service,
      category,
      categorySource: source,
      message: input.message,
      preferredTimes: input.preferredTimes.length ? input.preferredTimes : undefined,
      marketingConsent: input.marketingConsent,
      consentText: input.marketingConsent ? MARKETING_CONSENT_TEXT : null,
      sourcePath: input.sourcePath ?? null,
      ipHash,
      status: spamReason ? 'SPAM' : 'NEW',
      spamReason,
    },
  });
  logger.info('inquiry.received', { inquiryId: inquiry.id, category, spam: Boolean(spamReason) });
  if (spamReason) return { ok: true, id: inquiry.id };

  try {
    await linkToCrm(inquiry.id, now);
  } catch (err) {
    logger.error('inquiry.crm_link_failed', { inquiryId: inquiry.id, error: err });
  }
  return { ok: true, id: inquiry.id };
}

/** Account, contact (with consent), note and follow-up task for one stored inquiry. */
export async function linkToCrm(inquiryId: string, now = new Date()) {
  const q = await db.inquiry.findUniqueOrThrow({ where: { id: inquiryId } });
  const access = systemAccess(q.organizationId);
  const day = now.toLocaleDateString('en-CA', { timeZone: CONSULT_TZ });
  const consentBasis: ConsentBasis = q.marketingConsent ? 'EXPRESS' : 'IMPLIED_RELATIONSHIP';
  const consentNote = q.marketingConsent
    ? `Opted in on the website on ${day}: “${q.consentText}”`
    : `Website inquiry on ${day}: implied consent to reply and follow up about this inquiry, for six months (CASL).`;
  const { firstName, lastName } = splitName(q.name);
  const website = q.website ? (/^https?:\/\//i.test(q.website) ? q.website : `https://${q.website}`) : null;

  const created = await createAccount(access, null, {
    clientId: q.clientId,
    name: q.company,
    websiteUrl: website,
    phone: q.phone,
    industry: q.industry,
    source: 'INBOUND',
    tags: ['website-inquiry', CATEGORY_LABELS[q.category as keyof typeof CATEGORY_LABELS].toLowerCase().replace(/\s+/g, '-')],
    contacts: [{ firstName, lastName, email: q.email, phone: q.phone, source: 'INBOUND', consentBasis, consentNote }],
  }, { label: 'website inquiry' });
  if (created.status === 'excluded') {
    logger.warn('inquiry.account_excluded', { inquiryId, reason: created.reason });
    return;
  }
  const accountId = created.accountId;

  // An existing contact gains the stronger consent, never a weaker one.
  const contact = await db.contact.findFirst({ where: { accountId, email: { equals: q.email, mode: 'insensitive' } }, select: { id: true, consentBasis: true } });
  if (contact && CONSENT_RANK[consentBasis] > CONSENT_RANK[contact.consentBasis]) {
    await db.contact.update({ where: { id: contact.id }, data: { consentBasis, consentNote } });
  }

  const times = (q.preferredTimes as string[] | null) ?? [];
  const body = [
    q.message,
    '',
    `Service: ${SERVICE_CHOICES.find((s) => s.value === q.service)?.label ?? q.service}${q.industry ? ` · Industry: ${q.industry}` : ''}`,
    times.length ? `Suggested consultation times: ${times.map(formatSlot).join('; ')}` : 'No consultation times suggested.',
  ].join('\n');

  await logActivity({ organizationId: q.organizationId, accountId, contactId: contact?.id ?? null, type: 'NOTE', title: `Website inquiry: ${CATEGORY_LABELS[q.category as keyof typeof CATEGORY_LABELS]}`, body, metadata: { inquiryId } });
  const task = await db.task.create({
    data: {
      organizationId: q.organizationId,
      accountId,
      title: times.length ? `Confirm a consultation with ${q.name} (${q.company})` : `Reply to ${q.name} at ${q.company}`,
      description: body,
      priority: 1,
      dueAt: new Date(now.getTime() + 86_400_000),
    },
  });
  await db.inquiry.update({ where: { id: inquiryId }, data: { accountId, contactId: contact?.id ?? null, taskId: task.id } });
}

export async function listInquiries(access: AccessContext, opts: { status?: InquiryStatus | null; cursor?: string | null; limit?: number } = {}) {
  const limit = Math.min(opts.limit ?? 30, 100);
  const scope = clientFilter(access);
  const rows = await db.inquiry.findMany({
    where: { ...scope, ...(opts.status ? { status: opts.status } : { status: { not: 'SPAM' } }) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const counts = await db.inquiry.groupBy({ by: ['status'], where: scope, _count: true });
  return {
    // The IP hash exists for rate limiting only; it is never shown.
    items: rows.slice(0, limit).map((r) => { const { ipHash, ...rest } = r; void ipHash; return rest; }),
    nextCursor: rows.length > limit ? rows[limit - 1]!.id : null,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) as Partial<Record<InquiryStatus, number>>,
  };
}

async function loadInquiry(access: AccessContext, id: string) {
  const q = await db.inquiry.findFirst({ where: { id, ...clientFilter(access) } });
  if (!q) throw new NotFoundError('Inquiry');
  return q;
}

export const updateInquirySchema = z.object({
  status: z.enum(INQUIRY_STATUSES).optional(),
  category: z.enum(CATEGORIES).optional(),
});

export async function updateInquiry(access: AccessContext, id: string, raw: z.input<typeof updateInquirySchema>) {
  const before = await loadInquiry(access, id);
  const input = updateInquirySchema.parse(raw);
  const data: Prisma.InquiryUpdateInput = {};
  if (input.status) data.status = input.status;
  if (input.category && input.category !== before.category) { data.category = input.category; data.categorySource = 'staff'; }
  const after = await db.inquiry.update({ where: { id }, data });
  // Marked as genuine after all: it goes into the CRM like any other.
  if (before.status === 'SPAM' && after.status !== 'SPAM' && !after.accountId) await linkToCrm(id);
  return after;
}

/** Retries linking an inquiry into the CRM, for one that failed or was held as spam. */
export async function relinkInquiry(access: AccessContext, id: string) {
  const q = await loadInquiry(access, id);
  if (q.accountId) return { accountId: q.accountId };
  if (q.status === 'SPAM') await db.inquiry.update({ where: { id }, data: { status: 'NEW' } });
  await linkToCrm(id);
  const after = await db.inquiry.findUniqueOrThrow({ where: { id }, select: { accountId: true } });
  if (!after.accountId) throw new DomainError('It could not be added as an account. It may match one of this client’s existing customers.');
  return { accountId: after.accountId };
}

/** Confirms one of the times the visitor offered: a meeting on the account, the inquiry marked booked. */
export async function bookConsultation(access: AccessContext, userId: string, id: string, startsAt: string) {
  const q = await loadInquiry(access, id);
  const times = (q.preferredTimes as string[] | null) ?? [];
  if (!times.includes(startsAt)) throw new DomainError('Pick one of the times the visitor suggested.');
  if (!q.accountId) throw new DomainError('This inquiry is not linked to an account yet.');
  if (q.meetingId) return { meetingId: q.meetingId };
  const start = new Date(startsAt);
  const meeting = await db.meeting.create({
    data: {
      organizationId: q.organizationId,
      clientId: q.clientId,
      accountId: q.accountId,
      contactId: q.contactId,
      bookedById: userId,
      title: `Consultation: ${q.company}`,
      startsAt: start,
      endsAt: new Date(start.getTime() + CONSULT_MINUTES * 60_000),
      timezone: CONSULT_TZ,
      source: 'INBOUND',
      status: 'BOOKED',
      qualificationNotes: q.message.slice(0, 2000),
    },
  });
  await db.inquiry.update({ where: { id }, data: { status: 'BOOKED', meetingId: meeting.id } });
  if (q.taskId) await db.task.update({ where: { id: q.taskId }, data: { status: 'DONE', completedAt: new Date() } }).catch(() => undefined);
  return { meetingId: meeting.id };
}
