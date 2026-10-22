import type { JobType } from '@prisma/client';

/**
 * Every queue, with the defaults it runs under. Operators can override any
 * limit at runtime (QueueSetting); these are conservative starting points,
 * to be raised once measured throughput and provider allowances support it.
 *
 * Queues belong to worker groups. A worker runs one group (or all), so
 * customer workflows can run in their own process where high-volume
 * prospecting can't starve them, and a research backlog can't delay billing.
 */

export type WorkerGroup = 'intelligence' | 'studio' | 'platform';

export interface QueueDefinition {
  name: string;
  group: WorkerGroup;
  label: string;
  description: string;
  /** Jobs of this queue running at once, across all workers. */
  concurrency: number;
  /** Per organization, so one workspace's backlog can't take every slot. */
  perOrgConcurrency: number | null;
  /** Job starts per minute across all workers. */
  maxPerMinute: number | null;
  /** Longest one attempt may run. Pausable jobs yield before it. */
  timeoutMs: number;
  maxAttempts: number;
  /** First retry delay; each further retry waits four times longer. */
  retryBaseMs: number;
  /** Safe to run inside a serverless function's time limit (the cron tick). */
  serverless: boolean;
  /** Nonessential research spending, paused first when budgets run out. */
  optional: boolean;
}

const MIN = 60_000;

const q = (d: QueueDefinition) => d;

export const QUEUES = {
  discovery: q({ name: 'discovery', group: 'intelligence', label: 'Business discovery', description: 'Discovery runs against connected sources.', concurrency: 2, perOrgConcurrency: 1, maxPerMinute: null, timeoutMs: 5 * MIN, maxAttempts: 3, retryBaseMs: MIN, serverless: true, optional: true }),
  normalize: q({ name: 'normalize', group: 'intelligence', label: 'Normalization', description: 'Imports and company-identity normalization.', concurrency: 4, perOrgConcurrency: 2, maxPerMinute: null, timeoutMs: 2 * MIN, maxAttempts: 3, retryBaseMs: MIN, serverless: true, optional: false }),
  screening: q({ name: 'screening', group: 'intelligence', label: 'Preliminary screening', description: 'Deterministic screening scores (no AI).', concurrency: 4, perOrgConcurrency: 2, maxPerMinute: null, timeoutMs: 2 * MIN, maxAttempts: 3, retryBaseMs: 30_000, serverless: true, optional: false }),
  research: q({ name: 'research', group: 'intelligence', label: 'Website research', description: 'Focused website reading and AI analysis.', concurrency: 2, perOrgConcurrency: 1, maxPerMinute: 20, timeoutMs: 5 * MIN, maxAttempts: 3, retryBaseMs: 2 * MIN, serverless: false, optional: true }),
  'deep-research': q({ name: 'deep-research', group: 'intelligence', label: 'Deep research', description: 'In-depth analysis of high-priority prospects.', concurrency: 1, perOrgConcurrency: 1, maxPerMinute: 6, timeoutMs: 10 * MIN, maxAttempts: 2, retryBaseMs: 5 * MIN, serverless: false, optional: true }),
  enrichment: q({ name: 'enrichment', group: 'intelligence', label: 'Contact enrichment', description: 'Company and contact enrichment from data providers.', concurrency: 2, perOrgConcurrency: 1, maxPerMinute: 30, timeoutMs: 2 * MIN, maxAttempts: 3, retryBaseMs: MIN, serverless: true, optional: true }),
  verification: q({ name: 'verification', group: 'intelligence', label: 'Email verification', description: 'Deliverability checks before outreach.', concurrency: 2, perOrgConcurrency: 1, maxPerMinute: 60, timeoutMs: 2 * MIN, maxAttempts: 3, retryBaseMs: MIN, serverless: true, optional: true }),
  scoring: q({ name: 'scoring', group: 'intelligence', label: 'Lead scoring', description: 'Rescoring and call-queue refresh.', concurrency: 2, perOrgConcurrency: 1, maxPerMinute: null, timeoutMs: 5 * MIN, maxAttempts: 3, retryBaseMs: MIN, serverless: true, optional: false }),
  opportunities: q({ name: 'opportunities', group: 'intelligence', label: 'Opportunity generation', description: 'Opportunity assessments and solution matching.', concurrency: 2, perOrgConcurrency: 1, maxPerMinute: null, timeoutMs: 2 * MIN, maxAttempts: 3, retryBaseMs: MIN, serverless: true, optional: false }),
  refresh: q({ name: 'refresh', group: 'intelligence', label: 'Record refresh', description: 'Scheduled freshness checks.', concurrency: 2, perOrgConcurrency: 1, maxPerMinute: 30, timeoutMs: 2 * MIN, maxAttempts: 3, retryBaseMs: MIN, serverless: true, optional: true }),
  demos: q({ name: 'demos', group: 'studio', label: 'Demo generation', description: 'Building demo configurations from templates.', concurrency: 1, perOrgConcurrency: 1, maxPerMinute: null, timeoutMs: 2 * MIN, maxAttempts: 3, retryBaseMs: MIN, serverless: true, optional: false }),
  'customer-workflows': q({ name: 'customer-workflows', group: 'studio', label: 'Customer workflows', description: 'Production automation for paying customers.', concurrency: 4, perOrgConcurrency: 4, maxPerMinute: null, timeoutMs: 5 * MIN, maxAttempts: 5, retryBaseMs: 30_000, serverless: false, optional: false }),
  billing: q({ name: 'billing', group: 'studio', label: 'Billing and usage', description: 'Usage metering and billing sync.', concurrency: 1, perOrgConcurrency: 1, maxPerMinute: null, timeoutMs: 2 * MIN, maxAttempts: 5, retryBaseMs: MIN, serverless: true, optional: false }),
  maintenance: q({ name: 'maintenance', group: 'platform', label: 'Maintenance', description: 'Retention sweeps, key backfills, housekeeping.', concurrency: 1, perOrgConcurrency: null, maxPerMinute: null, timeoutMs: 10 * MIN, maxAttempts: 3, retryBaseMs: MIN, serverless: true, optional: false }),
  synthetic: q({ name: 'synthetic', group: 'platform', label: 'Synthetic load', description: 'Test tasks for queue validation; acts only on synthetic clients.', concurrency: 8, perOrgConcurrency: null, maxPerMinute: null, timeoutMs: 30_000, maxAttempts: 3, retryBaseMs: 1_000, serverless: false, optional: false }),
} satisfies Record<string, QueueDefinition>;

export type QueueName = keyof typeof QUEUES;
export const QUEUE_NAMES = Object.keys(QUEUES) as QueueName[];

export const JOB_TYPE_QUEUE: Record<JobType, QueueName> = {
  DISCOVERY_RUN: 'discovery',
  IMPORT: 'normalize',
  SCREENING: 'screening',
  RESEARCH: 'research',
  DEEP_RESEARCH: 'deep-research',
  ACCOUNT_ENRICHMENT: 'enrichment',
  CONTACT_ENRICHMENT: 'enrichment',
  VERIFICATION: 'verification',
  RESCORE: 'scoring',
  CALL_QUEUE_REFRESH: 'scoring',
  OPPORTUNITY_ASSESSMENT: 'opportunities',
  RECORD_REFRESH: 'refresh',
  DEMO_BUILD: 'demos',
  WORKFLOW_EXECUTION: 'customer-workflows',
  BILLING_SYNC: 'billing',
  CAMPAIGN_SCHEDULING: 'maintenance',
  ANALYTICS: 'maintenance',
  PROVIDER_SYNC: 'maintenance',
  RETENTION_SWEEP: 'maintenance',
  MAINTENANCE: 'maintenance',
  SYNTHETIC_TASK: 'synthetic',
};

export function isQueueName(v: string): v is QueueName {
  return v in QUEUES;
}

/** Queues a worker of this group runs. `all` runs everything except synthetic load. */
export function queuesFor(group: WorkerGroup | 'all'): QueueName[] {
  return QUEUE_NAMES.filter((n) => n !== 'synthetic' && (group === 'all' || QUEUES[n].group === group));
}

/** Queues the cron tick may run inside a serverless function's time limit. */
export const SERVERLESS_QUEUES = QUEUE_NAMES.filter((n) => QUEUES[n].serverless);
