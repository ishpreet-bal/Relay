import { z } from 'zod';
import type { DataSource, EvidenceStatus, Prisma, SignalType } from '@prisma/client';
import { db } from '@/lib/db';
import { clientFilter, type AccessContext } from '@/server/access/scope';
import { NotFoundError } from '@/server/errors';
import { logActivity } from './activity';
import { rescoreAccount } from './scoring';
import { signalFreshness } from './scoring/account-score';
import { normalizeForMatch } from '@/server/ai/grounding';
import { SIGNAL_TYPES, SIGNAL_LABELS } from '@/lib/domain';

/**
 * Signals: things about an account that make outreach timely. One record
 * feeds three consumers — scoring (is this account worth contacting now?),
 * personalization (what may a draft truthfully mention?) and call prep
 * (what should the caller open with?).
 */

export { SIGNAL_TYPES, SIGNAL_LABELS };

export interface NewSignal {
  type: SignalType;
  title: string;
  summary?: string | null;
  sourceUrl?: string | null;
  sourceQuote?: string | null;
  sourceTitle?: string | null;
  source: DataSource;
  provider?: string | null;
  providerRecordId?: string | null;
  eventDate?: Date | null;
  confidence?: number;
  evidenceStatus: EvidenceStatus;
  metadata?: Prisma.InputJsonValue;
  createdById?: string | null;
}

/** Same event reported twice (re-research, two providers) is one signal. */
function isSameSignal(a: { type: SignalType; sourceQuote: string | null; title: string }, b: NewSignal) {
  if (a.type !== b.type) return false;
  if (a.sourceQuote && b.sourceQuote) return normalizeForMatch(a.sourceQuote) === normalizeForMatch(b.sourceQuote);
  return normalizeForMatch(a.title) === normalizeForMatch(b.title);
}

/**
 * Stores signals for an account, skipping ones it already has. Returns the
 * newly created rows. Activity and rescoring happen once for the batch.
 */
export async function saveSignals(
  account: { id: string; organizationId: string; clientId: string },
  signals: NewSignal[],
  opts: { rescore?: boolean } = {},
) {
  if (!signals.length) return [];
  const existing = await db.signal.findMany({
    where: { accountId: account.id },
    select: { type: true, sourceQuote: true, title: true },
  });

  const fresh = signals.filter((s) => !existing.some((e) => isSameSignal(e, s)));
  const created = [];
  for (const s of fresh) {
    created.push(await db.signal.create({
      data: {
        organizationId: account.organizationId,
        clientId: account.clientId,
        accountId: account.id,
        type: s.type,
        title: s.title.slice(0, 200),
        summary: s.summary ?? null,
        sourceUrl: s.sourceUrl ?? null,
        sourceQuote: s.sourceQuote ?? null,
        sourceTitle: s.sourceTitle ?? null,
        source: s.source,
        provider: s.provider ?? null,
        providerRecordId: s.providerRecordId ?? null,
        eventDate: s.eventDate ?? null,
        confidence: Math.max(0, Math.min(1, s.confidence ?? 0.5)),
        evidenceStatus: s.evidenceStatus,
        metadata: s.metadata,
        createdById: s.createdById ?? null,
      },
    }));
  }

  if (created.length) {
    // A new event is a reason to look again: screening is cheap, and a
    // previously screened-out account may now qualify.
    await db.account.update({ where: { id: account.id }, data: { screenedAt: null } });
    await logActivity({
      organizationId: account.organizationId, clientId: account.clientId, accountId: account.id,
      type: 'SIGNAL_DETECTED',
      title: created.length === 1 ? `Signal: ${created[0]!.title}` : `${created.length} new signals`,
      body: created.map((s) => `• ${SIGNAL_LABELS[s.type]}: ${s.title}`).join('\n'),
      metadata: { signalIds: created.map((s) => s.id) },
    });
    if (opts.rescore !== false) await rescoreAccount(account.id);
  }
  return created;
}

export const manualSignalSchema = z.object({
  accountId: z.string().uuid(),
  type: z.enum(SIGNAL_TYPES),
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().max(2000).optional(),
  sourceUrl: z.string().url().max(500).optional(),
  sourceQuote: z.string().trim().max(2000).optional(),
  eventDate: z.coerce.date().optional(),
});

/**
 * A signal entered by a person. It is stored as UNVERIFIED: a human saw it,
 * but nothing checked the quote against the source, so drafts treat it as
 * needing review before it can be stated as fact.
 */
export async function addManualSignal(access: AccessContext, userId: string, input: z.infer<typeof manualSignalSchema>) {
  const account = await db.account.findFirst({
    where: { id: input.accountId, ...clientFilter(access), deletedAt: null },
    select: { id: true, organizationId: true, clientId: true },
  });
  if (!account) throw new NotFoundError('Account');
  const [signal] = await saveSignals(account, [{
    type: input.type,
    title: input.title,
    summary: input.summary,
    sourceUrl: input.sourceUrl,
    sourceQuote: input.sourceQuote,
    eventDate: input.eventDate,
    source: 'MANUAL',
    confidence: 0.6,
    evidenceStatus: 'UNVERIFIED',
    createdById: userId,
  }]);
  return signal ?? null;
}

export async function dismissSignal(access: AccessContext, userId: string, id: string, reason: string | null) {
  const signal = await db.signal.findFirst({ where: { id, ...clientFilter(access) } });
  if (!signal) throw new NotFoundError('Signal');
  await db.signal.update({ where: { id }, data: { dismissedAt: new Date(), dismissedById: userId, dismissReason: reason } });
  await rescoreAccount(signal.accountId);
}

/** Signals as call prep shows them: freshest first, with age spelled out. */
export function describeSignalAge(signal: { detectedAt: Date; eventDate: Date | null }, now = new Date()) {
  const { age } = signalFreshness(signal, now);
  const when = signal.eventDate ? '' : 'found ';
  if (age === 0) return `${when}today`;
  if (age < 14) return `${when}${age} day${age === 1 ? '' : 's'} ago`;
  if (age < 60) return `${when}${Math.round(age / 7)} weeks ago`;
  return `${when}${Math.round(age / 30)} months ago`;
}
