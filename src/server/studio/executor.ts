import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decryptSecret } from '@/lib/crypto';
import { safeFetch } from '@/server/services/net-guard';
import { systemAccess } from '@/server/access/scope';
import { DomainError, NotFoundError } from '@/server/errors';
import type { Manifest } from './manifest';
import { stepDefinition, type ValueRef } from './modules';

/**
 * Runs one workflow execution. Every read and write is pinned to the
 * execution's customer (clientId) and application, and test runs touch only
 * test records and never call a production connection, so one customer's
 * run can't see or change another's data, and a demo can't touch
 * production.
 *
 * Progress is saved after every step. Steps that write records commit the
 * write and the progress checkpoint in one transaction, so a retried job
 * resumes after them instead of writing twice. An approval step pauses the
 * run until someone decides.
 *
 * A record created by a workflow starts the workflows that trigger on that
 * collection. Record-triggered runs don't trigger further runs, so a
 * workflow can't loop on its own records.
 */

export class StepError extends Error {
  constructor(message: string, public retryable = false) {
    super(message);
    this.name = 'StepError';
  }
}

export interface StepLog {
  key: string;
  type: string;
  status: 'SUCCEEDED' | 'SKIPPED' | 'STOPPED' | 'FAILED' | 'WAITING';
  startedAt: string;
  durationMs: number;
  output?: unknown;
  error?: string;
}

type CreatedRecord = { collection: string; id: string; data: Record<string, unknown> };

interface RunState {
  next: number;
  skipNext: boolean;
  log: StepLog[];
  outputs: Record<string, unknown>;
  /** Records committed whose triggered workflows haven't been started yet. */
  pending?: CreatedRecord[];
}

interface Ctx {
  clientId: string;
  applicationId: string;
  executionId: string;
  configVersionId: string;
  trigger: string;
  isTest: boolean;
  manifest: Manifest;
  input: Record<string, unknown>;
  outputs: Record<string, unknown>;
  bindings: Record<string, string>;
  /** Commits the step's writes together with its checkpoint. */
  commit: (writes: Prisma.PrismaPromise<unknown>[], output: unknown, opts?: { wait?: boolean; created?: CreatedRecord[] }) => Promise<void>;
}

// ---------------------------------------------------------------------------
// References and templates
// ---------------------------------------------------------------------------

function getPath(obj: unknown, path: string): unknown {
  if (path === '*' || path === '') return obj;
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

export function resolve(value: unknown, ctx: Pick<Ctx, 'input' | 'outputs' | 'manifest'>): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => resolve(v, ctx));
  const o = value as Record<string, unknown>;
  if (typeof o.$input === 'string') return getPath(ctx.input, o.$input);
  if (typeof o.$step === 'string') {
    const [step, ...rest] = o.$step.split('.');
    return getPath(ctx.outputs[step!], rest.join('.'));
  }
  if (typeof o.$rule === 'string') return ctx.manifest.rules[o.$rule];
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, resolve(v, ctx)]));
}

/** "{{input.customer}}", "{{steps.count.value}}", "{{rules.limit}}" — text only, no expressions. */
export function render(template: string, ctx: Pick<Ctx, 'input' | 'outputs' | 'manifest'>): string {
  return template.replace(/\{\{\s*(input|steps|rules)\.([a-z0-9_.]+)\s*\}\}/gi, (_, scope: string, path: string) => {
    const root = scope === 'input' ? ctx.input : scope === 'steps' ? ctx.outputs : ctx.manifest.rules;
    const v = getPath(root, path);
    return v === undefined || v === null ? '' : String(v).slice(0, 200);
  });
}

// ---------------------------------------------------------------------------
// Field validation
// ---------------------------------------------------------------------------

export function validateRecord(manifest: Manifest, collectionKey: string, data: Record<string, unknown>) {
  const collection = manifest.collections.find((c) => c.key === collectionKey);
  if (!collection) return { valid: false, errors: [`Unknown collection ${collectionKey}`], clean: {} };
  const errors: string[] = [];
  const clean: Record<string, unknown> = {};
  for (const f of collection.fields) {
    const v = data[f.key];
    if (v === undefined || v === null || v === '') {
      if (f.required) errors.push(`${f.label} is required`);
      continue;
    }
    switch (f.type) {
      case 'number': { const n = typeof v === 'number' ? v : Number(v); if (!Number.isFinite(n)) errors.push(`${f.label} must be a number`); else clean[f.key] = n; break; }
      case 'boolean': clean[f.key] = v === true || v === 'true'; break;
      case 'date': { if (Number.isNaN(new Date(String(v)).getTime())) errors.push(`${f.label} must be a date`); else clean[f.key] = String(v); break; }
      case 'email': { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))) errors.push(`${f.label} must be an email address`); else clean[f.key] = String(v).toLowerCase(); break; }
      case 'select': { if (!f.options?.includes(String(v))) errors.push(`${f.label} must be one of ${f.options?.join(', ')}`); else clean[f.key] = String(v); break; }
      default: clean[f.key] = String(v).slice(0, 5000);
    }
  }
  return { valid: errors.length === 0, errors, clean };
}

function compare(op: string, left: unknown, right: unknown): boolean {
  const num = (x: unknown) => (typeof x === 'number' ? x : Number(x));
  switch (op) {
    case 'eq': return String(left) === String(right);
    case 'neq': return String(left) !== String(right);
    case 'gt': return num(left) > num(right);
    case 'gte': return num(left) >= num(right);
    case 'lt': return num(left) < num(right);
    case 'lte': return num(left) <= num(right);
    case 'contains': return String(left ?? '').toLowerCase().includes(String(right ?? '').toLowerCase());
    case 'exists': return left !== undefined && left !== null && left !== '';
    case 'in': return Array.isArray(right) && right.map(String).includes(String(left));
    default: return false;
  }
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

type Control = { output: unknown; control?: 'stop' | 'skip_next' | 'wait'; note?: string; committed?: boolean };

const scope = (ctx: Ctx) => ({ clientId: ctx.clientId, applicationId: ctx.applicationId, isTest: ctx.isTest });

function recordWrite(ctx: Ctx, collection: string, data: Prisma.InputJsonValue, id = randomUUID()) {
  return { id, write: db.appRecord.create({ data: { id, ...scope(ctx), collection, data, createdByExecutionId: ctx.executionId } }) };
}

async function runStep(type: string, config: Record<string, unknown>, ctx: Ctx): Promise<Control> {
  const r = (v: unknown) => resolve(v, ctx);
  switch (type) {
    case 'validate': {
      const { valid, errors } = validateRecord(ctx.manifest, String(config.collection), (ctx.input ?? {}) as Record<string, unknown>);
      if (!valid && config.onInvalid !== 'stop') throw new StepError(`Invalid input: ${errors.join('; ')}`);
      return { output: { valid, errors }, ...(valid ? {} : { control: 'stop' as const, note: 'Input failed validation' }) };
    }
    case 'create_record': {
      const data = (r(config.data) ?? {}) as Record<string, unknown>;
      const { clean, errors, valid } = validateRecord(ctx.manifest, String(config.collection), data);
      if (!valid) throw new StepError(`Record not valid: ${errors.join('; ')}`);
      const rec = recordWrite(ctx, String(config.collection), clean as Prisma.InputJsonValue);
      await ctx.commit([rec.write], { id: rec.id }, { created: [{ collection: String(config.collection), id: rec.id, data: clean }] });
      return { output: { id: rec.id }, committed: true };
    }
    case 'update_record': {
      const id = String(r(config.id) ?? '');
      const rec = await db.appRecord.findFirst({ where: { id, ...scope(ctx), collection: String(config.collection) } });
      if (!rec) throw new StepError(`No ${config.collection} record ${id} in this application`);
      const merged = { ...(rec.data as object), ...((r(config.data) ?? {}) as object) } as Record<string, unknown>;
      const { clean, errors, valid } = validateRecord(ctx.manifest, String(config.collection), merged);
      if (!valid) throw new StepError(`Record not valid: ${errors.join('; ')}`);
      await db.appRecord.update({ where: { id }, data: { data: clean as Prisma.InputJsonValue } });
      return { output: { id } };
    }
    case 'find_records': {
      const where = (r(config.where) ?? {}) as Record<string, unknown>;
      const items = await db.appRecord.findMany({
        where: { ...scope(ctx), collection: String(config.collection), AND: Object.entries(where).map(([k, v]) => ({ data: { path: [k], equals: v as Prisma.InputJsonValue } })) },
        orderBy: { createdAt: 'desc' },
        take: Number(config.limit ?? 20),
        select: { id: true, data: true, createdAt: true },
      });
      return { output: { count: items.length, items } };
    }
    case 'aggregate': {
      const field = typeof config.field === 'string' ? config.field : null;
      const since = typeof config.sinceDays === 'number' ? new Date(Date.now() - config.sinceDays * 86_400_000) : new Date(0);
      const rows = await db.$queryRaw<Array<{ n: number; total: number | null; avg: number | null }>>`
        SELECT count(*)::int AS n,
          ${field ? Prisma.sql`sum((data->>${field})::numeric)::float` : Prisma.sql`NULL::float`} AS total,
          ${field ? Prisma.sql`avg((data->>${field})::numeric)::float` : Prisma.sql`NULL::float`} AS avg
        FROM "AppRecord"
        WHERE "clientId" = ${ctx.clientId}::uuid AND "applicationId" = ${ctx.applicationId}::uuid AND "isTest" = ${ctx.isTest}
          AND "collection" = ${String(config.collection)} AND "createdAt" >= ${since}`;
      const row = rows[0] ?? { n: 0, total: null, avg: null };
      const value = config.op === 'count' ? row.n : config.op === 'sum' ? Math.round((row.total ?? 0) * 100) / 100 : Math.round((row.avg ?? 0) * 100) / 100;
      return { output: { value, records: row.n } };
    }
    case 'condition': {
      const result = compare(String(config.op), r(config.left), r(config.right));
      if (result) return { output: { result } };
      const onFalse = String(config.onFalse ?? 'stop');
      return { output: { result }, ...(onFalse === 'stop' ? { control: 'stop' as const, note: 'Condition was false' } : onFalse === 'skip_next' ? { control: 'skip_next' as const } : {}) };
    }
    case 'transform': {
      const out: Record<string, unknown> = {};
      for (const [k, spec] of Object.entries((config.output ?? {}) as Record<string, unknown>)) {
        if (spec && typeof spec === 'object' && 'from' in (spec as object)) {
          const { from, fn } = spec as { from: ValueRef; fn: string };
          const v = r(from);
          out[k] = fn === 'upper' ? String(v ?? '').toUpperCase() : fn === 'lower' ? String(v ?? '').toLowerCase() : fn === 'trim' ? String(v ?? '').trim()
            : fn === 'number' ? Number(v) : fn === 'date' ? new Date(String(v)).toISOString() : String(v ?? '');
        } else {
          out[k] = r(spec);
        }
      }
      return { output: out };
    }
    case 'notify': {
      const rec = recordWrite(ctx, '_notifications', {
        toRoles: config.toRoles as string[], title: render(String(config.title), ctx), body: config.body ? render(String(config.body), ctx) : null, read: false,
      });
      await ctx.commit([rec.write], { notificationId: rec.id });
      return { output: { notificationId: rec.id }, committed: true };
    }
    case 'approval': {
      const rec = recordWrite(ctx, '_approvals', {
        approverRole: String(config.approverRole), title: render(String(config.title), ctx), status: 'pending', executionId: ctx.executionId,
        onReject: String(config.onReject ?? 'stop'),
      });
      // The pause is part of the same commit, so a retry can't skip past it.
      await ctx.commit([rec.write], { approvalId: rec.id }, { wait: true });
      return { output: { approvalId: rec.id }, control: 'wait', committed: true };
    }
    case 'schedule_reminders': {
      const at = new Date(String(r(config.at)));
      if (Number.isNaN(at.getTime())) throw new StepError('Reminder time is not a date');
      const planned: Array<{ at: string; status: string }> = [];
      const writes: Prisma.PrismaPromise<unknown>[] = [];
      for (const h of config.hoursBefore as number[]) {
        const when = new Date(at.getTime() - h * 3_600_000);
        const status = when < new Date() ? 'skipped_past' : 'planned';
        writes.push(recordWrite(ctx, '_reminders', { at: when.toISOString(), title: render(String(config.title), ctx), status }).write);
        planned.push({ at: when.toISOString(), status });
      }
      await ctx.commit(writes, { reminders: planned });
      return { output: { reminders: planned }, committed: true };
    }
    case 'http_request': return httpRequest(config, ctx);
    default:
      throw new StepError(`No executor for step type ${type}`);
  }
}

async function httpRequest(config: Record<string, unknown>, ctx: Ctx): Promise<Control> {
  const integrationKey = String(config.integration);
  const connectionId = ctx.bindings[integrationKey];
  if (!connectionId) throw new StepError(`Integration "${integrationKey}" has no connection`);
  // Looked up by this customer's id: another customer's connection can't be used even if referenced.
  const conn = await db.integrationConnection.findFirst({ where: { id: connectionId, clientId: ctx.clientId } });
  if (!conn || conn.status !== 'CONNECTED') throw new StepError(`Connection for "${integrationKey}" is not available`);
  const cfg = conn.config as { baseUrl?: string; authHeader?: string };
  if (!cfg.baseUrl) throw new StepError('Connection has no base URL');
  const base = new URL(cfg.baseUrl);
  const url = new URL(String(config.path), base);
  if (url.origin !== base.origin) throw new StepError('Path must stay on the connection\'s own host');
  const body = config.body ? resolve(config.body, ctx) : undefined;
  if (ctx.isTest && !conn.isSandbox) {
    return { output: { dryRun: true, method: config.method, url: url.toString(), body }, note: 'Test run: production connection not called' };
  }
  const headers: Record<string, string> = { accept: 'application/json' };
  if (body) headers['content-type'] = 'application/json';
  if (conn.encryptedSecret) headers[cfg.authHeader ?? 'authorization'] = decryptSecret(conn.encryptedSecret);
  let res: Response;
  try {
    res = await safeFetch(url.toString(), { method: String(config.method), headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    throw new StepError(`Request failed: ${err instanceof Error ? err.message : 'network error'}`, true);
  }
  const text = (await res.text()).slice(0, 100_000);
  if (res.status >= 500 || res.status === 429) throw new StepError(`Remote system responded ${res.status}`, true);
  if (res.status >= 400) throw new StepError(`Remote system responded ${res.status}: ${text.slice(0, 200)}`);
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* plain text */ }
  return { output: { status: res.status, body: parsed } };
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

const ACTIVE = ['QUEUED', 'RUNNING'];

export async function runExecution(executionId: string): Promise<{ done: boolean; retryAt?: Date; reason?: string }> {
  const exec = await db.workflowExecution.findUnique({ where: { id: executionId }, include: { application: true } });
  if (!exec || !ACTIVE.includes(exec.status)) return { done: true };
  const app = exec.application;
  if (!exec.isTest && (app.status === 'PAUSED' || app.status === 'ARCHIVED')) {
    await db.workflowExecution.update({ where: { id: exec.id }, data: { status: 'CANCELLED', error: `Application is ${app.status.toLowerCase()}`, finishedAt: new Date() } });
    return { done: true };
  }
  const config = await db.appConfigVersion.findFirst({ where: { id: exec.configVersionId, applicationId: app.id } });
  if (!config) throw new StepError('Configuration version not found');
  const manifest = config.manifest as unknown as Manifest;
  const workflow = manifest.workflows.find((w) => w.key === exec.workflowKey);
  if (!workflow) {
    await db.workflowExecution.update({ where: { id: exec.id }, data: { status: 'FAILED', error: `Workflow ${exec.workflowKey} is not in this configuration`, finishedAt: new Date() } });
    return { done: true };
  }

  // Each application has its own concurrency limit, independent of others.
  const running = await db.workflowExecution.count({ where: { applicationId: app.id, status: 'RUNNING', id: { not: exec.id } } });
  if (running >= manifest.limits.maxConcurrent) {
    return { done: false, retryAt: new Date(Date.now() + 10_000), reason: `Waiting for one of ${manifest.limits.maxConcurrent} execution slots` };
  }

  const state: RunState = (exec.steps as unknown as RunState | null) ?? { next: 0, skipNext: false, log: [], outputs: {} };
  const started = exec.startedAt ?? new Date();
  await db.workflowExecution.update({ where: { id: exec.id }, data: { status: 'RUNNING', startedAt: started } });
  const ctx: Ctx = {
    clientId: exec.clientId, applicationId: app.id, executionId: exec.id, configVersionId: config.id, trigger: exec.trigger, isTest: exec.isTest, manifest,
    input: (exec.input ?? {}) as Record<string, unknown>, outputs: state.outputs,
    bindings: ((config.overrides as { bindings?: Record<string, string> }).bindings) ?? {},
    commit: async () => { throw new Error('commit outside a step'); },
  };
  const save = (data: Prisma.WorkflowExecutionUpdateInput = {}) =>
    db.workflowExecution.update({ where: { id: exec.id }, data: { steps: state as unknown as Prisma.InputJsonValue, ...data } });
  const finish = (status: 'SUCCEEDED' | 'FAILED', error: string | null = null) => save({
    status, error, finishedAt: new Date(), durationMs: Date.now() - started.getTime(), output: state.outputs as Prisma.InputJsonValue,
  });
  // Triggers a crashed attempt committed but didn't get to start.
  await flushTriggers(ctx, state, save);

  for (let i = state.next; i < workflow.steps.length; i++) {
    const step = workflow.steps[i]!;
    const t0 = Date.now();
    const at = new Date().toISOString();
    if (state.skipNext) {
      state.skipNext = false;
      state.log.push({ key: step.key, type: step.type, status: 'SKIPPED', startedAt: at, durationMs: 0 });
      state.next = i + 1;
      await save();
      continue;
    }
    const def = stepDefinition(step.type);
    const parsed = def?.step.config.safeParse(step.config);
    ctx.commit = async (writes, output, opts = {}) => {
      const entry: StepLog = { key: step.key, type: step.type, status: opts.wait ? 'WAITING' : 'SUCCEEDED', startedAt: at, durationMs: Date.now() - t0, output };
      const next: RunState = { ...state, next: i + 1, outputs: { ...state.outputs, [step.key]: output }, log: [...state.log, entry], pending: opts.created ?? [] };
      await db.$transaction([
        ...writes,
        db.workflowExecution.update({ where: { id: exec.id }, data: { steps: next as unknown as Prisma.InputJsonValue, ...(opts.wait ? { status: 'WAITING_APPROVAL' } : {}) } }),
      ]);
      state.outputs[step.key] = output;
      state.next = i + 1;
      state.log.push(entry);
      state.pending = opts.created ?? [];
    };
    try {
      if (!def || !parsed?.success) throw new StepError(`Step ${step.key} is not valid in this configuration`);
      const result = await runStep(step.type, parsed.data as Record<string, unknown>, ctx);
      await flushTriggers(ctx, state, save);
      if (result.committed) {
        if (result.control === 'wait') return { done: true };
        continue;
      }
      state.outputs[step.key] = result.output;
      state.next = i + 1;
      if (result.control === 'stop') {
        state.log.push({ key: step.key, type: step.type, status: 'STOPPED', startedAt: at, durationMs: Date.now() - t0, output: result.output, error: result.note });
        await finish('SUCCEEDED');
        return { done: true };
      }
      if (result.control === 'skip_next') state.skipNext = true;
      state.log.push({ key: step.key, type: step.type, status: 'SUCCEEDED', startedAt: at, durationMs: Date.now() - t0, output: result.output });
      await save();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof StepError && err.retryable) {
        // Progress so far is saved; the job retries this step.
        await save();
        throw err;
      }
      if (!(err instanceof StepError)) {
        // Infrastructure trouble (database, network): retry the job from this step.
        logger.error('studio.step_error', { executionId: exec.id, step: step.key, error: err });
        await save().catch(() => undefined);
        throw err;
      }
      state.log.push({ key: step.key, type: step.type, status: 'FAILED', startedAt: at, durationMs: Date.now() - t0, error: message });
      await finish('FAILED', message);
      return { done: true };
    }
  }
  await finish('SUCCEEDED');
  return { done: true };
}

/**
 * Starts the workflows that trigger on a collection a step just wrote to.
 * The pending list is part of the step's checkpoint, and each start has a
 * unique key (record + workflow) in the database, so a crash or a repeated
 * job delivery can't start the same triggered run twice.
 */
async function flushTriggers(ctx: Ctx, state: RunState, save: () => Promise<unknown>) {
  const created = state.pending ?? [];
  if (!created.length) return;
  if (ctx.trigger !== 'RECORD') await startRecordTriggers(ctx, created);
  state.pending = [];
  await save();
}

async function startRecordTriggers(ctx: Ctx, created: CreatedRecord[]) {
  const { startExecution } = await import('./applications');
  const app = await db.clientApplication.findUniqueOrThrow({ where: { id: ctx.applicationId } });
  const access = { ...systemAccess(app.organizationId), clients: { kind: 'clients' as const, ids: [ctx.clientId] } };
  for (const rec of created) {
    for (const wf of ctx.manifest.workflows) {
      if (wf.trigger.type !== 'record_created' || wf.trigger.collection !== rec.collection) continue;
      await startExecution(access, null, ctx.applicationId, wf.key, { ...rec.data, _recordId: rec.id }, {
        test: ctx.isTest, configVersionId: ctx.configVersionId, trigger: 'RECORD', idempotencyKey: `record:${rec.id}:${wf.key}`,
      }).catch((err) => {
        // A business refusal (daily limit, paused app) is logged; anything else retries the job.
        if (!(err instanceof DomainError) && !(err instanceof NotFoundError)) throw err;
        logger.warn('studio.record_trigger_refused', { executionId: ctx.executionId, workflow: wf.key, error: err.message });
      });
    }
  }
}
