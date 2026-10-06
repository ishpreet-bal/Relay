import { db } from '@/lib/db';
import type {
  Prisma, Suppression, SuppressionChannel, SuppressionReason, SuppressionScope, SuppressionSource,
} from '@prisma/client';
import { logActivity } from './activity';

/**
 * Suppression is the platform's memory of who not to contact, and on which
 * channel. Adding an entry cancels everything already in flight for the
 * people it covers in one transaction — an opt-out that leaves a scheduled
 * follow-up (or a queued call) behind is not an opt-out.
 *
 * Scope: an entry with clientId = null applies to every client in the
 * workspace. Opt-outs, bounces and complaints are recorded that way; a
 * client-scoped entry (for example "existing customer of this client") only
 * blocks that client's outreach.
 */

const MESSAGE_PENDING = ['GENERATING', 'DRAFT', 'NEEDS_EDIT', 'APPROVED', 'SCHEDULED'] as const;

/** Digits only, with a leading North American "1" dropped, so formats compare equal. */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits.length >= 7 ? digits : null;
}

export function normalizeSuppressionValue(scope: SuppressionScope, value: string): string {
  if (scope === 'PHONE') return normalizePhone(value) ?? value.trim();
  const v = value.toLowerCase().trim();
  return scope === 'DOMAIN' ? v.replace(/^@/, '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]! : v;
}

function emailBlocked(channel: SuppressionChannel) { return channel === 'ALL' || channel === 'EMAIL'; }
function phoneBlocked(channel: SuppressionChannel) { return channel === 'ALL' || channel === 'PHONE'; }

export interface SuppressParams {
  organizationId: string;
  clientId?: string | null;
  value: string;
  scope?: SuppressionScope;
  channel?: SuppressionChannel;
  reason: SuppressionReason;
  source?: SuppressionSource;
  note?: string;
  contactId?: string | null;
  campaignId?: string | null;
  createdById?: string | null;
}

export async function suppress(params: SuppressParams) {
  const scope = params.scope ?? 'EMAIL';
  const channel = params.channel ?? (scope === 'PHONE' ? 'PHONE' : 'ALL');
  const value = normalizeSuppressionValue(scope, params.value);
  const clientId = params.clientId ?? null;

  // There is no database unique constraint (clientId is nullable), so dedupe
  // here. A duplicate entry would be harmless anyway — it still suppresses.
  const existing = await db.suppression.findFirst({
    where: { organizationId: params.organizationId, clientId, scope, channel, value },
  });
  const entry = existing
    ? await db.suppression.update({
        where: { id: existing.id },
        data: { reason: params.reason, note: params.note ?? existing.note },
      })
    : await db.suppression.create({
        data: {
          organizationId: params.organizationId,
          clientId,
          scope,
          channel,
          value,
          reason: params.reason,
          source: params.source ?? 'MANUAL',
          note: params.note,
          contactId: params.contactId ?? null,
          campaignId: params.campaignId ?? null,
          createdById: params.createdById ?? null,
        },
      });

  const affected = await applySuppression(entry);
  return { entry, cancelledContacts: affected };
}

/** Contacts an entry covers, within its workspace and client scope. */
async function contactsCoveredBy(entry: Suppression) {
  const base: Prisma.ContactWhereInput = {
    organizationId: entry.organizationId,
    ...(entry.clientId ? { clientId: entry.clientId } : {}),
  };
  if (entry.scope === 'EMAIL') {
    return db.contact.findMany({
      where: { ...base, email: { equals: entry.value, mode: 'insensitive' } },
      select: { id: true, accountId: true, clientId: true },
    });
  }
  if (entry.scope === 'DOMAIN') {
    return db.contact.findMany({
      where: { ...base, OR: [{ email: { endsWith: `@${entry.value}`, mode: 'insensitive' } }, { account: { domain: entry.value } }] },
      select: { id: true, accountId: true, clientId: true },
    });
  }
  // Phone numbers are stored in whatever format they arrived in, so compare
  // normalized digits in the application.
  const candidates = await db.contact.findMany({
    where: { ...base, OR: [{ phone: { not: null } }, { directPhone: { not: null } }, { mobilePhone: { not: null } }] },
    select: { id: true, accountId: true, clientId: true, phone: true, directPhone: true, mobilePhone: true },
  });
  return candidates.filter((c) => [c.phone, c.directPhone, c.mobilePhone].some((p) => normalizePhone(p) === entry.value));
}

async function applySuppression(entry: Suppression): Promise<number> {
  const contacts = await contactsCoveredBy(entry);
  if (!contacts.length && entry.scope !== 'DOMAIN') return 0;

  const ids = contacts.map((c) => c.id);
  const now = new Date();
  const ops: Prisma.PrismaPromise<unknown>[] = [];

  if (emailBlocked(entry.channel) && ids.length) {
    ops.push(
      db.contact.updateMany({
        where: { id: { in: ids } },
        data: {
          doNotEmail: true,
          suppressedAt: now,
          suppressReason: entry.reason,
          ...(entry.reason === 'UNSUBSCRIBE' ? { unsubscribedAt: now } : {}),
          ...(entry.reason === 'HARD_BOUNCE' ? { emailVerification: 'INVALID' as const, status: 'BOUNCED' as const } : {}),
        },
      }),
      db.message.updateMany({
        where: { contactId: { in: ids }, direction: 'OUTBOUND', status: { in: [...MESSAGE_PENDING] } },
        data: { status: 'CANCELLED', failureReason: `Suppressed: ${entry.reason}` },
      }),
      db.campaignEnrollment.updateMany({
        where: { contactId: { in: ids }, status: { in: ['PENDING', 'ACTIVE', 'PAUSED'] } },
        data: { status: 'OPTED_OUT', exitReason: entry.reason, completedAt: now, nextActionAt: null },
      }),
    );
  }

  if (phoneBlocked(entry.channel) && ids.length) {
    ops.push(
      db.contact.updateMany({ where: { id: { in: ids } }, data: { doNotCall: true, suppressedAt: now, suppressReason: entry.reason } }),
      db.callTask.updateMany({
        where: { contactId: { in: ids }, status: { in: ['OPEN', 'SNOOZED'] } },
        data: { status: 'CANCELLED', completedAt: now, completedReason: `Suppressed: ${entry.reason}` },
      }),
    );
  }

  // A whole-domain, every-channel entry takes the account out of play.
  if (entry.scope === 'DOMAIN' && entry.channel === 'ALL') {
    ops.push(
      db.account.updateMany({
        where: { organizationId: entry.organizationId, domain: entry.value, ...(entry.clientId ? { clientId: entry.clientId } : {}) },
        data: { doNotContact: true, suppressedAt: now, suppressReason: entry.reason },
      }),
    );
  }

  if (ops.length) await db.$transaction(ops);

  const accounts = new Map(contacts.map((c) => [c.accountId, c.clientId]));
  for (const [accountId, clientId] of accounts) {
    await logActivity({
      organizationId: entry.organizationId, clientId, accountId, type: 'SUPPRESSION',
      title: entry.channel === 'PHONE' ? 'Added to do-not-call' : entry.channel === 'EMAIL' ? 'Added to do-not-email' : 'Added to do-not-contact',
      body: `${entry.value} — ${entry.reason.toLowerCase().replace(/_/g, ' ')}. Pending outreach on this channel was cancelled.`,
    });
  }
  return contacts.length;
}

/**
 * The single question every outbound path asks. Returns the blocking entry,
 * or null when the contact may be reached on this channel for this client.
 */
export async function findSuppression(params: {
  organizationId: string;
  clientId: string | null;
  channel: 'EMAIL' | 'PHONE';
  email?: string | null;
  phone?: string | null;
  domain?: string | null;
}): Promise<Suppression | null> {
  const values: Prisma.SuppressionWhereInput[] = [];
  const email = params.email?.toLowerCase().trim();
  const domain = (params.domain ?? email?.split('@')[1])?.toLowerCase().trim();
  if (email) values.push({ scope: 'EMAIL', value: email });
  if (domain) values.push({ scope: 'DOMAIN', value: domain });
  const phone = normalizePhone(params.phone);
  if (phone) values.push({ scope: 'PHONE', value: phone });
  if (!values.length) return null;

  return db.suppression.findFirst({
    where: {
      organizationId: params.organizationId,
      OR: values,
      AND: [
        { OR: [{ clientId: null }, ...(params.clientId ? [{ clientId: params.clientId }] : [])] },
        { channel: { in: ['ALL', params.channel] } },
      ],
    },
  });
}

/** Back-compatible email check used by drafting. */
export async function isSuppressed(organizationId: string, email: string, clientId: string | null = null) {
  return findSuppression({ organizationId, clientId, channel: 'EMAIL', email });
}

/**
 * Deletes a (removable) entry and recomputes the do-not-contact flags on the
 * people and accounts it covered, from whatever entries still apply. The
 * caller decides whether an entry may be removed at all.
 */
export async function releaseSuppression(entry: Suppression) {
  const covered = await contactsCoveredBy(entry);
  await db.suppression.delete({ where: { id: entry.id } });

  for (const { id } of covered) {
    const c = await db.contact.findUnique({
      where: { id },
      select: { email: true, phone: true, directPhone: true, mobilePhone: true, clientId: true, organizationId: true, account: { select: { domain: true } } },
    });
    if (!c) continue;
    const [emailBlock, phoneBlock] = await Promise.all([
      findSuppression({ organizationId: c.organizationId, clientId: c.clientId, channel: 'EMAIL', email: c.email, domain: c.account.domain }),
      findSuppression({ organizationId: c.organizationId, clientId: c.clientId, channel: 'PHONE', phone: c.directPhone ?? c.mobilePhone ?? c.phone, domain: c.account.domain }),
    ]);
    await db.contact.update({
      where: { id },
      data: {
        doNotEmail: !!emailBlock,
        doNotCall: !!phoneBlock,
        ...(!emailBlock && !phoneBlock ? { suppressedAt: null, suppressReason: null } : {}),
      },
    });
  }

  if (entry.scope === 'DOMAIN' && entry.channel === 'ALL') {
    const remaining = await db.suppression.count({
      where: { organizationId: entry.organizationId, scope: 'DOMAIN', value: entry.value, channel: 'ALL' },
    });
    if (!remaining) {
      await db.account.updateMany({
        where: { organizationId: entry.organizationId, domain: entry.value, ...(entry.clientId ? { clientId: entry.clientId } : {}) },
        data: { doNotContact: false, suppressedAt: null, suppressReason: null },
      });
    }
  }
  return { released: covered.length };
}
