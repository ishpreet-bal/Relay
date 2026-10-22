import { db } from '@/lib/db';
import { QUEUES, isQueueName, type QueueDefinition, type QueueName } from './registry';

/** A queue's defaults with any operator overrides applied. */
export interface QueueRuntime extends QueueDefinition {
  paused: boolean;
  pausedReason: string | null;
}

let cache: { at: number; rows: Map<string, Awaited<ReturnType<typeof db.queueSetting.findMany>>[number]> } | null = null;
const CACHE_MS = 5_000;

export function clearQueueSettingsCache() {
  cache = null;
}

export async function queueRuntime(name: QueueName): Promise<QueueRuntime> {
  if (!cache || Date.now() - cache.at > CACHE_MS) {
    const rows = await db.queueSetting.findMany();
    cache = { at: Date.now(), rows: new Map(rows.map((r) => [r.queue, r])) };
  }
  const base = QUEUES[name];
  const o = cache.rows.get(name);
  return {
    ...base,
    concurrency: o?.concurrency ?? base.concurrency,
    perOrgConcurrency: o?.perOrgConcurrency ?? base.perOrgConcurrency,
    maxPerMinute: o?.maxPerMinute ?? base.maxPerMinute,
    timeoutMs: o?.timeoutMs ?? base.timeoutMs,
    maxAttempts: o?.maxAttempts ?? base.maxAttempts,
    retryBaseMs: o?.retryBaseMs ?? base.retryBaseMs,
    paused: o?.paused ?? false,
    pausedReason: o?.pausedReason ?? null,
  };
}

export async function runtimeFor(queue: string): Promise<QueueRuntime | null> {
  return isQueueName(queue) ? queueRuntime(queue) : null;
}

export interface QueueOverride {
  paused?: boolean;
  pausedReason?: string | null;
  concurrency?: number | null;
  perOrgConcurrency?: number | null;
  maxPerMinute?: number | null;
  timeoutMs?: number | null;
  maxAttempts?: number | null;
  retryBaseMs?: number | null;
}

export async function setQueueOverride(queue: QueueName, override: QueueOverride, userId: string | null) {
  const row = await db.queueSetting.upsert({
    where: { queue },
    create: { queue, ...override, paused: override.paused ?? false, updatedById: userId },
    update: { ...override, updatedById: userId },
  });
  clearQueueSettingsCache();
  return row;
}
