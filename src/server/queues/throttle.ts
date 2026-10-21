import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Shared request budgets and circuit breakers for external providers.
 *
 * Every call to a throttled provider first takes a slot. A slot is refused
 * when the provider's per-minute budget is spent, or while its breaker is
 * open after repeated failures; the caller then pauses that work (only that
 * provider's) and retries later. State lives in Postgres so every worker
 * process sees the same budget.
 *
 * Breaker: `failureThreshold` consecutive failures open it for `cooldownMs`;
 * the first request after the cooldown is a trial. A success closes it and
 * resets the cooldown; another failure re-opens it with the cooldown doubled
 * (to at most 30 minutes).
 */

export class ProviderUnavailableError extends Error {
  constructor(public provider: string, public retryAt: Date, public reason: 'RATE_LIMIT' | 'CIRCUIT_OPEN') {
    super(reason === 'RATE_LIMIT'
      ? `${provider}: request budget for this minute is used up; retrying at ${retryAt.toISOString()}`
      : `${provider}: paused after repeated failures; retrying at ${retryAt.toISOString()}`);
    this.name = 'ProviderUnavailableError';
  }
}

const DEFAULT_COOLDOWN_MS = 60_000;
const MAX_COOLDOWN_MS = 30 * 60_000;

/** Default per-minute budgets; operators can change them on the System page. */
export const DEFAULT_PROVIDER_LIMITS: Record<string, number> = {
  google_places: 60,
  apollo: 50,
  anthropic: 50,
  hunter: 30,
  zerobounce: 60,
};

interface SlotRow { windowCount: number; maxPerMinute: number | null; windowStart: Date; circuitOpenUntil: Date | null }

export async function takeProviderSlot(provider: string): Promise<void> {
  const defaultMax = DEFAULT_PROVIDER_LIMITS[provider] ?? null;
  const rows = await db.$queryRaw<SlotRow[]>`
    INSERT INTO "ProviderThrottle" ("provider", "maxPerMinute", "windowStart", "windowCount", "totalRequests", "updatedAt")
    VALUES (${provider}, ${defaultMax}, NOW(), 1, 1, NOW())
    ON CONFLICT ("provider") DO UPDATE SET
      "windowStart" = CASE WHEN "ProviderThrottle"."windowStart" <= NOW() - INTERVAL '1 minute' THEN NOW() ELSE "ProviderThrottle"."windowStart" END,
      "windowCount" = CASE WHEN "ProviderThrottle"."windowStart" <= NOW() - INTERVAL '1 minute' THEN 1 ELSE "ProviderThrottle"."windowCount" + 1 END,
      "totalRequests" = "ProviderThrottle"."totalRequests" + 1,
      "updatedAt" = NOW()
    WHERE "ProviderThrottle"."circuitOpenUntil" IS NULL OR "ProviderThrottle"."circuitOpenUntil" <= NOW()
    RETURNING "windowCount", "maxPerMinute", "windowStart", "circuitOpenUntil";
  `;
  const row = rows[0];
  if (!row) {
    const state = await db.providerThrottle.findUnique({ where: { provider }, select: { circuitOpenUntil: true } });
    throw new ProviderUnavailableError(provider, state?.circuitOpenUntil ?? new Date(Date.now() + DEFAULT_COOLDOWN_MS), 'CIRCUIT_OPEN');
  }
  if (row.maxPerMinute !== null && row.windowCount > row.maxPerMinute) {
    // Give the slot back; this request does not happen.
    await db.$executeRaw`UPDATE "ProviderThrottle" SET "windowCount" = "windowCount" - 1, "totalRequests" = "totalRequests" - 1 WHERE "provider" = ${provider}`;
    throw new ProviderUnavailableError(provider, new Date(row.windowStart.getTime() + 60_000), 'RATE_LIMIT');
  }
}

/**
 * Records how a request went. `failure` means the provider misbehaved
 * (errors, timeouts, rate limiting); a clean "not found" is a success.
 */
export async function reportProviderResult(provider: string, outcome: { ok: true } | { ok: false; error: string; retryAfter?: Date }) {
  if (outcome.ok) {
    await db.$executeRaw`
      UPDATE "ProviderThrottle" SET "consecutiveFailures" = 0, "circuitOpenUntil" = NULL, "cooldownMs" = ${DEFAULT_COOLDOWN_MS},
        "lastSuccessAt" = NOW(), "updatedAt" = NOW()
      WHERE "provider" = ${provider} AND ("consecutiveFailures" > 0 OR "circuitOpenUntil" IS NOT NULL OR "lastSuccessAt" IS NULL OR "lastSuccessAt" < NOW() - INTERVAL '1 minute')`;
    await db.job.updateMany({ where: { provider, waitingReason: { not: null }, status: { in: ['QUEUED', 'RETRYING'] } }, data: { waitingReason: null } });
    return;
  }
  const error = outcome.error.slice(0, 500);
  // SET expressions read the row's old values, so the threshold check uses the pre-increment count + 1.
  const rows = await db.$queryRaw<Array<{ circuitOpenUntil: Date | null }>>`
    UPDATE "ProviderThrottle" SET
      "consecutiveFailures" = "consecutiveFailures" + 1,
      "totalFailures" = "totalFailures" + 1,
      "lastError" = ${error},
      "lastFailureAt" = NOW(),
      "circuitOpenUntil" = CASE
        WHEN ${outcome.retryAfter ?? null}::timestamp IS NOT NULL THEN GREATEST(COALESCE("circuitOpenUntil", NOW()), ${outcome.retryAfter ?? null}::timestamp)
        WHEN "consecutiveFailures" + 1 >= "failureThreshold" THEN NOW() + ("cooldownMs" * INTERVAL '1 millisecond')
        ELSE "circuitOpenUntil" END,
      "cooldownMs" = CASE WHEN "consecutiveFailures" + 1 > "failureThreshold" THEN LEAST("cooldownMs" * 2, ${MAX_COOLDOWN_MS}) ELSE "cooldownMs" END,
      "updatedAt" = NOW()
    WHERE "provider" = ${provider}
    RETURNING "circuitOpenUntil";
  `;
  const until = rows[0]?.circuitOpenUntil;
  if (until && until > new Date()) {
    logger.warn('provider.paused', { provider, until, error });
    await db.job.updateMany({
      where: { provider, status: { in: ['QUEUED', 'RETRYING'] } },
      data: { waitingReason: `${provider} paused until ${until.toISOString()}: ${error.slice(0, 200)}` },
    });
  }
}

/** Providers whose breaker is open right now; their jobs are not claimed. */
export async function unavailableProviders(): Promise<string[]> {
  const rows = await db.providerThrottle.findMany({ where: { circuitOpenUntil: { gt: new Date() } }, select: { provider: true } });
  return rows.map((r) => r.provider);
}

export function listProviderThrottles() {
  return db.providerThrottle.findMany({ orderBy: { provider: 'asc' } });
}

export async function setProviderThrottle(provider: string, data: { maxPerMinute?: number | null; failureThreshold?: number; reset?: boolean }) {
  const reset = data.reset ? { consecutiveFailures: 0, circuitOpenUntil: null, cooldownMs: DEFAULT_COOLDOWN_MS } : {};
  const row = await db.providerThrottle.upsert({
    where: { provider },
    create: { provider, maxPerMinute: data.maxPerMinute ?? DEFAULT_PROVIDER_LIMITS[provider] ?? null, failureThreshold: data.failureThreshold ?? 5 },
    update: {
      ...(data.maxPerMinute !== undefined ? { maxPerMinute: data.maxPerMinute } : {}),
      ...(data.failureThreshold !== undefined ? { failureThreshold: data.failureThreshold } : {}),
      ...reset,
    },
  });
  if (data.reset) await db.job.updateMany({ where: { provider, waitingReason: { not: null } }, data: { waitingReason: null } });
  return row;
}

/**
 * Runs one provider request under the throttle: takes a slot, runs it, and
 * reports the outcome. `classify` decides whether a result counts as the
 * provider failing.
 */
export async function throttled<T>(provider: string, fn: () => Promise<T>, classify: (r: T) => { ok: true } | { ok: false; error: string; retryAfter?: Date } = () => ({ ok: true })): Promise<T> {
  await takeProviderSlot(provider);
  let result: T;
  try {
    result = await fn();
  } catch (err) {
    await reportProviderResult(provider, { ok: false, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
  await reportProviderResult(provider, classify(result));
  return result;
}
