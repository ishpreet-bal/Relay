import { z } from 'zod';

/**
 * The modules a customer application is assembled from. Each is tested code
 * in this repository, identified by key and major version; a manifest can
 * enable modules and configure them, but can never supply code. Steps are
 * the units of work a module contributes to workflows.
 */

export interface StepDefinition {
  type: string;
  label: string;
  description: string;
  config: z.ZodTypeAny;
  /** Needs an integration binding to run outside test mode. */
  usesIntegration?: boolean;
  /** Calls an AI model. */
  usesAi?: boolean;
}

export interface ModuleDefinition {
  key: string;
  /** Major.minor; manifests pin a major version. */
  version: string;
  name: string;
  category: 'data' | 'automation' | 'integrations' | 'business' | 'ai';
  description: string;
  config: z.ZodTypeAny;
  permissions: string[];
  steps: StepDefinition[];
}

/** A value in step config: a literal, or a reference into the run. */
export const valueRef = z.union([
  z.string(), z.number(), z.boolean(), z.null(),
  z.object({ $input: z.string().min(1) }).strict(),
  z.object({ $step: z.string().min(1) }).strict(),
  z.object({ $rule: z.string().min(1) }).strict(),
]);
export type ValueRef = z.infer<typeof valueRef>;

const key = z.string().regex(/^[a-z][a-z0-9_]{0,40}$/, 'lower_snake_case, starting with a letter');
const dataMap = z.record(key, valueRef);

export const MODULES: ModuleDefinition[] = [
  {
    key: 'records', version: '1.0', name: 'Records', category: 'data',
    description: 'Collections of business records with typed fields, validation, create, update and search.',
    config: z.object({}).passthrough(),
    permissions: ['records:read', 'records:write'],
    steps: [
      { type: 'validate', label: 'Validate', description: 'Checks an input against a collection\'s field rules.', config: z.object({ collection: key, onInvalid: z.enum(['fail', 'stop']).default('fail') }).strict() },
      { type: 'create_record', label: 'Create record', description: 'Adds a record to a collection.', config: z.object({ collection: key, data: z.union([dataMap, z.object({ $input: z.string() }).strict(), z.object({ $step: z.string() }).strict()]) }).strict() },
      { type: 'update_record', label: 'Update record', description: 'Changes fields on a record found by id.', config: z.object({ collection: key, id: valueRef, data: dataMap }).strict() },
      { type: 'find_records', label: 'Find records', description: 'Looks up records by exact field values.', config: z.object({ collection: key, where: dataMap.default({}), limit: z.number().int().min(1).max(100).default(20) }).strict() },
    ],
  },
  {
    key: 'rules', version: '1.0', name: 'Business rules', category: 'automation',
    description: 'Conditions and field transformations driven by the customer\'s own rule values.',
    config: z.object({}).passthrough(),
    permissions: [],
    steps: [
      {
        type: 'condition', label: 'Condition', description: 'Compares two values; stops or skips when false.',
        config: z.object({
          left: valueRef, op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'exists', 'in']), right: valueRef.optional(),
          onFalse: z.enum(['stop', 'skip_next', 'continue']).default('stop'),
        }).strict(),
      },
      {
        type: 'transform', label: 'Transform', description: 'Builds an object from inputs and earlier steps.',
        config: z.object({ output: z.record(key, z.union([valueRef, z.object({ from: valueRef, fn: z.enum(['upper', 'lower', 'trim', 'number', 'date', 'string']) }).strict()])) }).strict(),
      },
    ],
  },
  {
    key: 'notifications', version: '1.0', name: 'Notifications', category: 'business',
    description: 'In-app notifications to the roles that need to act.',
    config: z.object({}).passthrough(),
    permissions: ['notifications:read'],
    steps: [
      { type: 'notify', label: 'Notify', description: 'Sends an in-app notification to roles.', config: z.object({ toRoles: z.array(key).min(1), title: z.string().min(1).max(200), body: z.string().max(2000).optional() }).strict() },
    ],
  },
  {
    key: 'approvals', version: '1.0', name: 'Approvals', category: 'business',
    description: 'Pauses a workflow until someone in a role approves or rejects.',
    config: z.object({}).passthrough(),
    permissions: ['approvals:decide'],
    steps: [
      { type: 'approval', label: 'Approval', description: 'Waits for a decision.', config: z.object({ approverRole: key, title: z.string().min(1).max(200), onReject: z.enum(['stop', 'fail']).default('stop') }).strict() },
    ],
  },
  {
    key: 'reporting', version: '1.0', name: 'Reporting', category: 'business',
    description: 'Counts, sums and averages over a collection.',
    config: z.object({}).passthrough(),
    permissions: ['reports:read'],
    steps: [
      { type: 'aggregate', label: 'Aggregate', description: 'Counts records or sums a number field.', config: z.object({ collection: key, op: z.enum(['count', 'sum', 'avg']), field: key.optional(), where: dataMap.default({}), sinceDays: z.number().int().min(1).max(366).optional() }).strict() },
    ],
  },
  {
    key: 'scheduling', version: '1.0', name: 'Scheduling', category: 'business',
    description: 'Reminders relative to a booked time.',
    config: z.object({ timezone: z.string().default('America/Toronto') }).passthrough(),
    permissions: [],
    steps: [
      { type: 'schedule_reminders', label: 'Schedule reminders', description: 'Plans reminders before a time.', config: z.object({ at: valueRef, hoursBefore: z.array(z.number().min(0).max(24 * 30)).min(1).max(5), title: z.string().min(1).max(200) }).strict() },
    ],
  },
  {
    key: 'integrations', version: '1.0', name: 'Integrations', category: 'integrations',
    description: 'Calls to the customer\'s own systems through their connections.',
    config: z.object({}).passthrough(),
    permissions: [],
    steps: [
      {
        type: 'http_request', label: 'HTTP request', description: 'Calls an endpoint on a connected REST API.', usesIntegration: true,
        config: z.object({ integration: key, method: z.enum(['GET', 'POST', 'PUT', 'PATCH']), path: z.string().startsWith('/').max(500), body: dataMap.optional() }).strict(),
      },
    ],
  },
];

export function moduleByKey(k: string) {
  return MODULES.find((m) => m.key === k) ?? null;
}

export function stepDefinition(type: string): { module: ModuleDefinition; step: StepDefinition } | null {
  for (const m of MODULES) {
    const step = m.steps.find((s) => s.type === type);
    if (step) return { module: m, step };
  }
  return null;
}

export const majorOf = (v: string) => v.split('.')[0] ?? v;
