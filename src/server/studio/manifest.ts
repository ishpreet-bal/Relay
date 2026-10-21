import { z } from 'zod';
import { MODULES, majorOf, moduleByKey, stepDefinition, type ValueRef } from './modules';

/**
 * An application manifest says how modules are assembled for one customer:
 * branding, terminology, roles, collections and their fields, business rule
 * values, workflows, integrations and limits. It is data, validated in full
 * before anything is deployed; it can reference modules and steps but never
 * carries code.
 */

const key = z.string().regex(/^[a-z][a-z0-9_]{0,40}$/, 'lower_snake_case, starting with a letter');
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'a #rrggbb colour');

export const fieldSchema = z.object({
  key,
  label: z.string().min(1).max(80),
  type: z.enum(['text', 'number', 'date', 'boolean', 'email', 'select']),
  required: z.boolean().default(false),
  options: z.array(z.string().min(1).max(60)).max(30).optional(),
}).strict();

const stepSchema = z.object({ key, type: z.string().min(1), config: z.record(z.string(), z.unknown()).default({}) }).strict();

const workflowSchema = z.object({
  key,
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  trigger: z.object({
    type: z.enum(['manual', 'schedule', 'webhook', 'record_created']),
    cron: z.string().optional(),
    collection: key.optional(),
  }).strict(),
  steps: z.array(stepSchema).min(1).max(30),
  /** Synthetic input for test runs. Never real customer data. */
  testInput: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const PLATFORM_LIMITS = { maxExecutionsPerDay: 10_000, maxConcurrent: 10 };

export const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  app: z.object({ name: z.string().min(1).max(120), description: z.string().max(1000).default('') }).strict(),
  branding: z.object({
    displayName: z.string().min(1).max(120),
    primaryColor: hex.default('#2563EB'),
    logoUrl: z.string().url().max(500).nullable().default(null),
    theme: z.enum(['light', 'dark', 'system']).default('system'),
  }).strict(),
  terminology: z.record(key, z.string().min(1).max(60)).default({}),
  modules: z.array(z.object({ key, version: z.string().regex(/^\d+\.\d+$/), config: z.record(z.string(), z.unknown()).default({}) }).strict()).min(1),
  roles: z.array(z.object({ key, label: z.string().min(1).max(60), permissions: z.array(z.string()).default([]) }).strict()).min(1),
  collections: z.array(z.object({ key, label: z.string().min(1).max(80), fields: z.array(fieldSchema).min(1).max(60) }).strict()).default([]),
  rules: z.record(key, z.union([z.number(), z.string().max(200), z.boolean()])).default({}),
  workflows: z.array(workflowSchema).default([]),
  integrations: z.array(z.object({ key, provider: z.enum(['rest_api', 'webhook']), required: z.boolean().default(false), purpose: z.string().max(200) }).strict()).default([]),
  dashboard: z.object({
    widgets: z.array(z.object({ type: z.enum(['count', 'sum', 'list']), collection: key, title: z.string().min(1).max(80), field: key.optional() }).strict()).max(20).default([]),
  }).strict().default({ widgets: [] }),
  limits: z.object({
    maxExecutionsPerDay: z.number().int().min(1).max(PLATFORM_LIMITS.maxExecutionsPerDay).default(500),
    maxConcurrent: z.number().int().min(1).max(PLATFORM_LIMITS.maxConcurrent).default(2),
  }).strict().default({ maxExecutionsPerDay: 500, maxConcurrent: 2 }),
}).strict();

export type Manifest = z.infer<typeof manifestSchema>;

/** What one customer may change on top of a template. */
export const overridesSchema = z.object({
  app: z.object({ name: z.string().min(1).max(120).optional(), description: z.string().max(1000).optional() }).strict().optional(),
  branding: manifestSchema.shape.branding.partial().optional(),
  terminology: z.record(key, z.string().min(1).max(60)).optional(),
  rules: z.record(key, z.union([z.number(), z.string().max(200), z.boolean()])).optional(),
  roles: manifestSchema.shape.roles.optional(),
  limits: z.object({ maxExecutionsPerDay: z.number().int().min(1).max(PLATFORM_LIMITS.maxExecutionsPerDay), maxConcurrent: z.number().int().min(1).max(PLATFORM_LIMITS.maxConcurrent) }).partial().strict().optional(),
  moduleConfig: z.record(key, z.record(z.string(), z.unknown())).optional(),
  /** Integration key → this customer's connection id. */
  bindings: z.record(key, z.string().uuid()).optional(),
  disabledWorkflows: z.array(key).optional(),
  extraFields: z.record(key, z.array(fieldSchema)).optional(),
}).strict();

export type Overrides = z.infer<typeof overridesSchema>;

/** Template manifest + a customer's overrides. Overrides win; nothing else changes. */
export function applyOverrides(base: Manifest, o: Overrides): Manifest {
  return {
    ...base,
    app: { ...base.app, ...(o.app ?? {}) },
    branding: { ...base.branding, ...(o.branding ?? {}) },
    terminology: { ...base.terminology, ...(o.terminology ?? {}) },
    rules: { ...base.rules, ...(o.rules ?? {}) },
    roles: o.roles ?? base.roles,
    limits: { ...base.limits, ...(o.limits ?? {}) },
    modules: base.modules.map((m) => ({ ...m, config: { ...m.config, ...(o.moduleConfig?.[m.key] ?? {}) } })),
    collections: base.collections.map((c) => ({ ...c, fields: [...c.fields, ...(o.extraFields?.[c.key] ?? [])] })),
    workflows: base.workflows.filter((w) => !(o.disabledWorkflows ?? []).includes(w.key)),
  };
}

export interface ValidationIssue { path: string; message: string }

export interface ConnectionInfo { id: string; provider: string; clientId: string; status: string }

/**
 * Full validation of a resolved manifest for one customer: shape, modules
 * and versions, step types and their configuration, every reference
 * (collections, fields, rules, roles, steps, integrations), connection
 * ownership, schedules and limits.
 */
export function validateManifest(raw: unknown, ctx: { clientId: string; bindings: Record<string, string>; connections: ConnectionInfo[] }): { ok: boolean; manifest: Manifest | null; issues: ValidationIssue[] } {
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, manifest: null, issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) };
  }
  const m = parsed.data;
  const issues: ValidationIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  const dupes = (items: string[], path: string) => {
    const seen = new Set<string>();
    for (const k of items) { if (seen.has(k)) add(path, `Duplicate key "${k}"`); seen.add(k); }
  };

  dupes(m.modules.map((x) => x.key), 'modules');
  dupes(m.roles.map((x) => x.key), 'roles');
  dupes(m.collections.map((x) => x.key), 'collections');
  dupes(m.workflows.map((x) => x.key), 'workflows');
  dupes(m.integrations.map((x) => x.key), 'integrations');

  const enabled = new Map<string, (typeof MODULES)[number]>();
  m.modules.forEach((mod, i) => {
    const def = moduleByKey(mod.key);
    if (!def) return add(`modules.${i}`, `Unknown module "${mod.key}"`);
    if (majorOf(def.version) !== majorOf(mod.version)) return add(`modules.${i}`, `Module "${mod.key}" is at ${def.version}; this manifest needs ${mod.version}`);
    const cfg = def.config.safeParse(mod.config);
    if (!cfg.success) add(`modules.${i}.config`, cfg.error.issues.map((x) => x.message).join('; '));
    enabled.set(mod.key, def);
  });

  const permissions = new Set([...enabled.values()].flatMap((d) => d.permissions));
  m.roles.forEach((r, i) => r.permissions.forEach((p) => { if (!permissions.has(p)) add(`roles.${i}`, `Permission "${p}" is not provided by any enabled module`); }));

  const collections = new Map(m.collections.map((c) => [c.key, c]));
  m.collections.forEach((c, i) => {
    dupes(c.fields.map((f) => f.key), `collections.${i}.fields`);
    c.fields.forEach((f, j) => { if (f.type === 'select' && !f.options?.length) add(`collections.${i}.fields.${j}`, 'A select field needs options'); });
  });
  if (m.collections.length && !enabled.has('records')) add('modules', 'Collections need the records module');

  const roles = new Set(m.roles.map((r) => r.key));
  const rules = new Set(Object.keys(m.rules));
  const integrations = new Map(m.integrations.map((x) => [x.key, x]));

  m.integrations.forEach((integ, i) => {
    const bound = ctx.bindings[integ.key];
    if (!bound) { if (integ.required) add(`integrations.${i}`, `Required integration "${integ.key}" has no connection`); return; }
    const conn = ctx.connections.find((c) => c.id === bound);
    // A connection must belong to this customer: one customer's systems are never used in another's app.
    if (!conn || conn.clientId !== ctx.clientId) return add(`integrations.${i}`, `Connection for "${integ.key}" is not one of this customer's connections`);
    if (conn.provider !== integ.provider) add(`integrations.${i}`, `"${integ.key}" needs a ${integ.provider} connection, not ${conn.provider}`);
    if (conn.status !== 'CONNECTED') add(`integrations.${i}`, `Connection for "${integ.key}" is ${conn.status.toLowerCase()}`);
  });

  m.dashboard.widgets.forEach((w, i) => {
    const c = collections.get(w.collection);
    if (!c) return add(`dashboard.widgets.${i}`, `Unknown collection "${w.collection}"`);
    if (w.field && !c.fields.some((f) => f.key === w.field)) add(`dashboard.widgets.${i}`, `Unknown field "${w.field}"`);
    if (w.type === 'sum' && !w.field) add(`dashboard.widgets.${i}`, 'A sum widget needs a number field');
  });

  m.workflows.forEach((wf, wi) => {
    const path = `workflows.${wi}`;
    if (wf.trigger.type === 'schedule' && !/^(\S+\s+){4}\S+$/.test(wf.trigger.cron ?? '')) add(`${path}.trigger`, 'A schedule needs a five-field cron expression');
    if (wf.trigger.type === 'record_created' && !collections.has(wf.trigger.collection ?? '')) add(`${path}.trigger`, 'A record trigger needs a known collection');
    dupes(wf.steps.map((s) => s.key), `${path}.steps`);
    const earlier = new Set<string>();
    wf.steps.forEach((s, si) => {
      const sp = `${path}.steps.${si}`;
      const def = stepDefinition(s.type);
      if (!def) { add(sp, `Unknown step type "${s.type}"`); earlier.add(s.key); return; }
      if (!enabled.has(def.module.key)) add(sp, `Step "${s.type}" needs the ${def.module.name} module`);
      const cfg = def.step.config.safeParse(s.config);
      if (!cfg.success) { add(`${sp}.config`, cfg.error.issues.map((x) => `${x.path.join('.') || 'config'}: ${x.message}`).join('; ')); earlier.add(s.key); return; }
      const c = cfg.data as Record<string, unknown>;
      if (typeof c.collection === 'string') {
        const coll = collections.get(c.collection);
        if (!coll) add(sp, `Unknown collection "${c.collection}"`);
        else {
          for (const f of [c.field, ...Object.keys((c.where as object) ?? {}), ...(isPlainMap(c.data) ? Object.keys(c.data as object) : [])]) {
            if (typeof f === 'string' && !coll.fields.some((x) => x.key === f)) add(sp, `Unknown field "${f}" in ${coll.key}`);
          }
        }
      }
      if (Array.isArray(c.toRoles)) (c.toRoles as string[]).forEach((r) => { if (!roles.has(r)) add(sp, `Unknown role "${r}"`); });
      if (typeof c.approverRole === 'string' && !roles.has(c.approverRole)) add(sp, `Unknown role "${c.approverRole}"`);
      if (typeof c.integration === 'string' && !integrations.has(c.integration)) add(sp, `Undeclared integration "${c.integration}"`);
      for (const ref of refsIn(c)) {
        if ('$rule' in ref && !rules.has(ref.$rule)) add(sp, `Unknown rule "${ref.$rule}"`);
        if ('$step' in ref && !earlier.has(ref.$step.split('.')[0]!)) add(sp, `"${ref.$step}" refers to a step that hasn't run yet`);
      }
      earlier.add(s.key);
    });
  });

  return { ok: issues.length === 0, manifest: m, issues };
}

function isPlainMap(v: unknown) {
  return !!v && typeof v === 'object' && !Array.isArray(v) && !('$input' in (v as object)) && !('$step' in (v as object)) && !('$rule' in (v as object));
}

/** Every reference ({$input}, {$step}, {$rule}) anywhere inside a value. */
export function refsIn(v: unknown): Array<Exclude<ValueRef, string | number | boolean | null>> {
  if (!v || typeof v !== 'object') return [];
  if (Array.isArray(v)) return v.flatMap(refsIn);
  const o = v as Record<string, unknown>;
  if (typeof o.$input === 'string') return [{ $input: o.$input }];
  if (typeof o.$step === 'string') return [{ $step: o.$step }];
  if (typeof o.$rule === 'string') return [{ $rule: o.$rule }];
  return Object.values(o).flatMap(refsIn);
}

/** Changes between two template manifests that can break an existing customer app. */
export function breakingChanges(from: Manifest, to: Manifest): string[] {
  const out: string[] = [];
  for (const mod of from.modules) {
    const next = to.modules.find((x) => x.key === mod.key);
    if (!next) out.push(`Module "${mod.key}" removed`);
    else if (majorOf(next.version) !== majorOf(mod.version)) out.push(`Module "${mod.key}" moves to ${next.version}`);
  }
  for (const c of from.collections) {
    const next = to.collections.find((x) => x.key === c.key);
    if (!next) { out.push(`Collection "${c.key}" removed`); continue; }
    for (const f of c.fields) {
      const nf = next.fields.find((x) => x.key === f.key);
      if (!nf) out.push(`Field "${c.key}.${f.key}" removed`);
      else if (nf.type !== f.type) out.push(`Field "${c.key}.${f.key}" changes type ${f.type} → ${nf.type}`);
      else if (!f.required && nf.required) out.push(`Field "${c.key}.${f.key}" becomes required`);
    }
  }
  for (const w of from.workflows) if (!to.workflows.some((x) => x.key === w.key)) out.push(`Workflow "${w.key}" removed`);
  for (const r of Object.keys(from.rules)) if (!(r in to.rules)) out.push(`Rule "${r}" removed`);
  return out;
}
