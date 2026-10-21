import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { startOfDay } from 'date-fns';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { encryptSecret } from '@/lib/crypto';
import { assertClientAccess, clientFilter, systemAccess, type AccessContext } from '@/server/access/scope';
import { DomainError, NotFoundError } from '@/server/errors';
import { enqueueJob } from '@/server/services/jobs';
import { safeFetch } from '@/server/services/net-guard';
import { applyOverrides, breakingChanges, manifestSchema, overridesSchema, validateManifest, type Manifest, type Overrides } from './manifest';
import { BUILTIN_TEMPLATES } from './templates';
import { lastFireBetween } from './cron';

/**
 * Studio: customer applications assembled from versioned templates.
 *
 *   template version (tested manifest) + customer overrides
 *     → config version (validated, immutable once deployed)
 *     → deployment (sandbox or production; rollback redeploys an earlier one)
 *     → executions (on the customer-workflows queue, per-app limits)
 *
 * Everything is scoped to one customer (Client) through the access context.
 * Production deployment requires a passing test run of every workflow in
 * that exact configuration, on synthetic input.
 */

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/** JSON with sorted keys and no undefined values: Postgres JSONB doesn't keep key order. */
function canonical(v: unknown): string {
  const sort = (x: unknown): unknown => Array.isArray(x) ? x.map(sort)
    : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().filter((k) => (x as Record<string, unknown>)[k] !== undefined).map((k) => [k, sort((x as Record<string, unknown>)[k])]))
    : x;
  return JSON.stringify(sort(v));
}

let ensured: Promise<void> | null = null;

/** Makes sure the built-in templates exist at their current versions. Idempotent; runs once per process. */
export function ensureBuiltinTemplates(): Promise<void> {
  ensured ??= syncBuiltinTemplates().catch((err) => { ensured = null; throw err; });
  return ensured;
}

async function syncBuiltinTemplates() {
  for (const t of BUILTIN_TEMPLATES) {
    const manifest = manifestSchema.parse(t.manifest);
    const fields = {
      name: t.name, industry: t.industry, description: t.description, useCases: t.useCases,
      buildHoursEstimate: t.buildHoursEstimate, monthlyInfraCentsEstimate: t.monthlyInfraCentsEstimate,
      recommendedSetupCents: t.recommendedSetupCents, recommendedMonthlyCents: t.recommendedMonthlyCents, knownLimitations: t.knownLimitations,
    };
    let template = await db.appTemplate.findFirst({ where: { organizationId: null, slug: t.slug } });
    template = template
      ? await db.appTemplate.update({ where: { id: template.id }, data: fields })
      : await db.appTemplate.create({ data: { slug: t.slug, ...fields } });
    const stored = await db.appTemplateVersion.upsert({
      where: { templateId_version: { templateId: template.id, version: t.version } },
      create: { templateId: template.id, version: t.version, manifest: manifest as unknown as Prisma.InputJsonValue, status: 'PUBLISHED', publishedAt: new Date(), changelog: 'Initial release' },
      update: {},
    });
    // Released versions never change; a code edit without a version bump is a mistake to fix, not to apply.
    if (canonical(stored.manifest) !== canonical(manifest)) {
      logger.warn('studio.builtin_template_drift', { slug: t.slug, version: t.version, fix: 'bump the template version in templates.ts' });
    }
  }
}

export async function listTemplates(access: AccessContext) {
  await ensureBuiltinTemplates();
  return db.appTemplate.findMany({
    where: { OR: [{ organizationId: null }, { organizationId: access.organizationId }], archivedAt: null },
    orderBy: [{ industry: 'asc' }, { name: 'asc' }],
    include: {
      versions: { where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'desc' }, select: { id: true, version: true, publishedAt: true, changelog: true } },
      _count: { select: { applications: true } },
    },
  });
}

export const templateSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,60}$/),
  name: z.string().trim().min(1).max(120),
  industry: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(2000),
  useCases: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
});

/** A workspace's own template, for solutions the built-ins don't cover. */
export async function createTemplate(access: AccessContext, raw: z.input<typeof templateSchema>) {
  const input = templateSchema.parse(raw);
  return db.appTemplate.create({ data: { ...input, organizationId: access.organizationId } });
}

function compareVersions(a: string, b: string) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

/**
 * Publishes a new template version after validating it. Existing apps stay
 * on theirs until upgraded. Only a workspace's own templates take new
 * versions; built-ins are shared by every workspace, so they are copied
 * first (forkTemplate).
 */
export async function publishTemplateVersion(access: AccessContext, userId: string, templateId: string, input: { version: string; manifest: unknown; changelog: string }) {
  const template = await db.appTemplate.findFirst({ where: { id: templateId, organizationId: access.organizationId }, include: { versions: true } });
  if (!template) throw new NotFoundError('Template');
  if (!/^\d+\.\d+\.\d+$/.test(input.version)) throw new DomainError('Versions look like 1.2.0.');
  const latest = [...template.versions].sort((a, b) => compareVersions(b.version, a.version))[0];
  if (latest && compareVersions(input.version, latest.version) <= 0) throw new DomainError(`New version must be above ${latest.version}.`);
  const check = validateManifest(input.manifest, { clientId: 'template', bindings: {}, connections: [] });
  // Integrations a template declares can't be bound yet; anything else must be valid.
  const issues = check.issues.filter((i) => !/has no connection/.test(i.message));
  if (!check.manifest || issues.length) throw new DomainError(`Manifest is not valid: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`);
  return db.appTemplateVersion.create({
    data: { templateId, version: input.version, manifest: check.manifest as unknown as Prisma.InputJsonValue, changelog: input.changelog, status: 'PUBLISHED', publishedAt: new Date(), createdById: userId },
  });
}

/** Copies a template (built-in or the workspace's own) into the workspace, at one of its versions. */
export async function forkTemplate(access: AccessContext, userId: string, templateVersionId: string, raw: { slug: string; name: string }) {
  const tv = await db.appTemplateVersion.findUnique({ where: { id: templateVersionId }, include: { template: true } });
  if (!tv || (tv.template.organizationId && tv.template.organizationId !== access.organizationId)) throw new NotFoundError('Template version');
  const input = templateSchema.pick({ slug: true, name: true }).parse(raw);
  const t = tv.template;
  if (await db.appTemplate.count({ where: { organizationId: access.organizationId, slug: input.slug } })) throw new DomainError('A template with that slug already exists.');
  return db.appTemplate.create({
    data: {
      organizationId: access.organizationId, slug: input.slug, name: input.name, industry: t.industry, description: t.description, useCases: t.useCases,
      buildHoursEstimate: t.buildHoursEstimate, monthlyInfraCentsEstimate: t.monthlyInfraCentsEstimate, recommendedSetupCents: t.recommendedSetupCents,
      recommendedMonthlyCents: t.recommendedMonthlyCents, knownLimitations: t.knownLimitations,
      versions: { create: { version: '1.0.0', manifest: tv.manifest as Prisma.InputJsonValue, status: 'PUBLISHED', publishedAt: new Date(), changelog: `Copied from ${t.name} ${tv.version}`, createdById: userId } },
    },
  });
}

export async function getTemplate(access: AccessContext, id: string) {
  await ensureBuiltinTemplates();
  const t = await db.appTemplate.findFirst({
    where: { id, OR: [{ organizationId: null }, { organizationId: access.organizationId }] },
    include: { versions: { orderBy: { createdAt: 'desc' } } },
  });
  if (!t) throw new NotFoundError('Template');
  const applications = await db.clientApplication.count({ where: { templateId: id, ...clientFilter(access), archivedAt: null } });
  return { ...t, builtin: t.organizationId === null, applications };
}

// ---------------------------------------------------------------------------
// Applications and configuration versions
// ---------------------------------------------------------------------------

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'app';

async function loadApp(access: AccessContext, id: string) {
  const app = await db.clientApplication.findFirst({ where: { id, ...clientFilter(access), archivedAt: null } });
  if (!app) throw new NotFoundError('Application');
  return app;
}

async function connectionsFor(clientId: string) {
  return db.integrationConnection.findMany({ where: { clientId }, select: { id: true, provider: true, clientId: true, status: true } });
}

async function buildConfig(app: { id: string; clientId: string }, templateVersionId: string, overridesRaw: unknown) {
  const overrides = overridesSchema.parse(overridesRaw ?? {});
  const tv = await db.appTemplateVersion.findUnique({ where: { id: templateVersionId } });
  if (!tv) throw new NotFoundError('Template version');
  const merged = applyOverrides(manifestSchema.parse(tv.manifest), overrides);
  const result = validateManifest(merged, { clientId: app.clientId, bindings: overrides.bindings ?? {}, connections: await connectionsFor(app.clientId) });
  return { overrides, merged: result.manifest ?? merged, result };
}

export const createApplicationSchema = z.object({
  clientId: z.string().uuid(),
  templateVersionId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  overrides: overridesSchema.default({}),
});

export async function createApplication(access: AccessContext, userId: string | null, raw: z.input<typeof createApplicationSchema>) {
  const input = createApplicationSchema.parse(raw);
  assertClientAccess(access, input.clientId);
  const client = await db.client.findFirst({ where: { id: input.clientId, organizationId: access.organizationId } });
  if (!client) throw new NotFoundError('Client');
  const tv = await db.appTemplateVersion.findUnique({ where: { id: input.templateVersionId }, include: { template: true } });
  if (!tv || tv.status !== 'PUBLISHED' || (tv.template.organizationId && tv.template.organizationId !== access.organizationId)) throw new NotFoundError('Template version');

  let slug = slugify(input.name);
  if (await db.clientApplication.count({ where: { clientId: input.clientId, slug } })) slug = `${slug}-${randomBytes(2).toString('hex')}`;
  const app = await db.clientApplication.create({
    data: { organizationId: access.organizationId, clientId: input.clientId, templateId: tv.templateId, templateVersionId: tv.id, name: input.name, slug, createdById: userId },
  });
  const config = await saveConfig(access, userId, app.id, input.overrides, 'Created from template');
  return { app, config };
}

/** Validates a configuration without saving it, for the editor. */
export async function previewConfig(access: AccessContext, applicationId: string, overrides: unknown, templateVersionId?: string) {
  const app = await loadApp(access, applicationId);
  const tvId = templateVersionId ?? app.templateVersionId;
  if (!tvId) throw new DomainError('This application has no template version.');
  const parsed = overridesSchema.safeParse(overrides ?? {});
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((i) => ({ path: `overrides.${i.path.join('.')}`, message: i.message })), manifest: null };
  const { merged, result } = await buildConfig(app, tvId, parsed.data);
  return { ok: result.ok, issues: result.issues, manifest: merged };
}

/** A new configuration version. Never changes one that exists. */
export async function saveConfig(access: AccessContext, userId: string | null, applicationId: string, overrides: unknown, notes: string | null, templateVersionId?: string) {
  const app = await loadApp(access, applicationId);
  const tvId = templateVersionId ?? app.templateVersionId;
  if (!tvId) throw new DomainError('This application has no template version.');
  const { overrides: o, merged, result } = await buildConfig(app, tvId, overrides);
  const last = await db.appConfigVersion.findFirst({ where: { applicationId }, orderBy: { version: 'desc' }, select: { version: true } });
  return db.appConfigVersion.create({
    data: {
      applicationId, clientId: app.clientId, version: (last?.version ?? 0) + 1, overrides: o as unknown as Prisma.InputJsonValue,
      manifest: merged as unknown as Prisma.InputJsonValue, templateVersionId: tvId,
      status: result.ok ? 'VALID' : 'INVALID', validationErrors: result.issues as unknown as Prisma.InputJsonValue, notes, createdById: userId,
    },
  });
}

/**
 * Moves an application to a newer template version, keeping the customer's
 * overrides. Returns the new (undeployed) configuration and any breaking
 * changes, which a person reviews before deploying.
 */
export async function upgradeApplication(access: AccessContext, userId: string | null, applicationId: string, toTemplateVersionId: string) {
  const app = await loadApp(access, applicationId);
  const [from, to] = await Promise.all([
    app.templateVersionId ? db.appTemplateVersion.findUnique({ where: { id: app.templateVersionId } }) : null,
    db.appTemplateVersion.findUnique({ where: { id: toTemplateVersionId } }),
  ]);
  if (!from || !to || to.templateId !== from.templateId || to.status !== 'PUBLISHED') throw new NotFoundError('Template version');
  const current = await db.appConfigVersion.findFirst({ where: { applicationId }, orderBy: { version: 'desc' } });
  const breaking = breakingChanges(manifestSchema.parse(from.manifest), manifestSchema.parse(to.manifest));
  const config = await saveConfig(access, userId, applicationId, current?.overrides ?? {}, `Upgrade to template ${to.version}${breaking.length ? ` (${breaking.length} breaking changes)` : ''}`, to.id);
  await db.clientApplication.update({ where: { id: applicationId }, data: { templateVersionId: to.id } });
  return { config, breaking };
}

// ---------------------------------------------------------------------------
// Deployment
// ---------------------------------------------------------------------------

export type Environment = 'SANDBOX' | 'PRODUCTION';

export async function deployConfig(access: AccessContext, userId: string | null, applicationId: string, configVersionId: string, environment: Environment, notes: string | null = null) {
  const app = await loadApp(access, applicationId);
  const config = await db.appConfigVersion.findFirst({ where: { id: configVersionId, applicationId } });
  if (!config) throw new NotFoundError('Configuration');
  if (config.status === 'INVALID' || config.status === 'DRAFT') throw new DomainError('Only a valid configuration can be deployed. Fix the validation issues first.');
  const manifest = config.manifest as unknown as Manifest;

  if (environment === 'PRODUCTION') {
    // Every workflow must have passed a test run in this exact configuration.
    const passed = await db.workflowExecution.findMany({
      where: { applicationId, configVersionId, isTest: true, status: 'SUCCEEDED' }, select: { workflowKey: true }, distinct: ['workflowKey'],
    });
    const missing = manifest.workflows.map((w) => w.key).filter((k) => !passed.some((p) => p.workflowKey === k));
    if (missing.length) throw new DomainError(`Run a passing test of every workflow first. Not yet passed: ${missing.join(', ')}.`);
  }
  return activate(app, config.id, environment, 'DEPLOY', userId, notes);
}

async function activate(app: { id: string; clientId: string; activeConfigVersionId: string | null }, configVersionId: string, environment: Environment, kind: 'DEPLOY' | 'ROLLBACK', userId: string | null, notes: string | null) {
  const config = await db.appConfigVersion.findUniqueOrThrow({ where: { id: configVersionId } });
  const manifest = config.manifest as unknown as Manifest;
  return db.$transaction(async (tx) => {
    if (app.activeConfigVersionId && app.activeConfigVersionId !== configVersionId) {
      await tx.appConfigVersion.update({ where: { id: app.activeConfigVersionId }, data: { status: 'SUPERSEDED' } });
    }
    await tx.appConfigVersion.update({ where: { id: configVersionId }, data: { status: 'DEPLOYED' } });
    await tx.clientApplication.update({
      where: { id: app.id },
      data: {
        activeConfigVersionId: configVersionId, status: environment === 'PRODUCTION' ? 'ACTIVE' : 'TESTING',
        maxExecutionsPerDay: manifest.limits.maxExecutionsPerDay, maxConcurrent: manifest.limits.maxConcurrent,
      },
    });
    return tx.appDeployment.create({
      data: { applicationId: app.id, clientId: app.clientId, configVersionId, previousConfigVersionId: app.activeConfigVersionId, environment, kind, deployedById: userId, notes },
    });
  });
}

/** Redeploys the configuration that was live before the current one. */
export async function rollback(access: AccessContext, userId: string | null, applicationId: string) {
  const app = await loadApp(access, applicationId);
  const current = await db.appDeployment.findFirst({ where: { applicationId, configVersionId: app.activeConfigVersionId ?? undefined }, orderBy: { createdAt: 'desc' } });
  if (!current?.previousConfigVersionId) throw new DomainError('There is no earlier deployment to roll back to.');
  return activate(app, current.previousConfigVersionId, current.environment as Environment, 'ROLLBACK', userId, `Rolled back from configuration ${app.activeConfigVersionId}`);
}

export async function setApplicationStatus(access: AccessContext, applicationId: string, status: 'PAUSED' | 'ACTIVE' | 'ARCHIVED') {
  const app = await loadApp(access, applicationId);
  if (status === 'ACTIVE' && !app.activeConfigVersionId) throw new DomainError('Deploy a configuration first.');
  return db.clientApplication.update({ where: { id: app.id }, data: { status, ...(status === 'ARCHIVED' ? { archivedAt: new Date() } : {}) } });
}

// ---------------------------------------------------------------------------
// Executions
// ---------------------------------------------------------------------------

export interface StartOptions {
  test?: boolean;
  trigger?: 'MANUAL' | 'SCHEDULE' | 'WEBHOOK' | 'RECORD' | 'TEST';
  idempotencyKey?: string;
  /** Test a specific configuration version (defaults to the newest). */
  configVersionId?: string;
}

export async function startExecution(access: AccessContext, userId: string | null, applicationId: string, workflowKey: string, input: unknown, opts: StartOptions = {}) {
  const app = await loadApp(access, applicationId);
  const test = !!opts.test;
  const config = test
    ? await db.appConfigVersion.findFirst({ where: { applicationId, ...(opts.configVersionId ? { id: opts.configVersionId } : {}) }, orderBy: { version: 'desc' } })
    : app.activeConfigVersionId ? await db.appConfigVersion.findUnique({ where: { id: app.activeConfigVersionId } }) : null;
  if (!config) throw new DomainError(test ? 'Save a configuration first.' : 'This application has nothing deployed.');
  if (config.status === 'INVALID') throw new DomainError('This configuration has validation issues.');
  if (!test && app.status !== 'ACTIVE') throw new DomainError(`The application is ${app.status.toLowerCase()}; production runs need it active.`);
  const manifest = config.manifest as unknown as Manifest;
  const workflow = manifest.workflows.find((w) => w.key === workflowKey);
  if (!workflow) throw new NotFoundError('Workflow');

  if (!test) {
    // Per-application daily quota; one customer's volume never spends another's.
    const today = await db.workflowExecution.count({ where: { applicationId, isTest: false, createdAt: { gte: startOfDay(new Date()) } } });
    if (today >= manifest.limits.maxExecutionsPerDay) throw new DomainError(`Daily limit of ${manifest.limits.maxExecutionsPerDay} runs reached for this application.`);
  }
  const finalInput = test && (input === undefined || input === null) ? workflow.testInput ?? {} : input ?? {};
  try {
    const exec = await db.workflowExecution.create({
      data: {
        organizationId: app.organizationId, clientId: app.clientId, applicationId, configVersionId: config.id, workflowKey,
        // A record-triggered test run keeps RECORD so it can't trigger further runs.
        trigger: test ? (opts.trigger === 'RECORD' ? 'RECORD' : 'TEST') : opts.trigger ?? 'MANUAL', isTest: test, input: finalInput as Prisma.InputJsonValue,
        idempotencyKey: opts.idempotencyKey ?? null,
      },
    });
    const job = await enqueueJob({
      type: 'WORKFLOW_EXECUTION', organizationId: app.organizationId, clientId: app.clientId, entityType: 'WorkflowExecution', entityId: exec.id,
      createdById: userId, idempotencyKey: `wf:${exec.id}`, priority: test ? 0 : 5,
    });
    return db.workflowExecution.update({ where: { id: exec.id }, data: { jobId: job?.id ?? null } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && opts.idempotencyKey) {
      // The same event delivered twice starts one run.
      return db.workflowExecution.findFirstOrThrow({ where: { applicationId, idempotencyKey: opts.idempotencyKey } });
    }
    throw err;
  }
}

export async function decideApproval(access: AccessContext, userId: string, executionId: string, decision: 'APPROVE' | 'REJECT', note: string | null) {
  const exec = await db.workflowExecution.findFirst({ where: { id: executionId, ...clientFilter(access), status: 'WAITING_APPROVAL' } });
  if (!exec) throw new NotFoundError('Execution waiting for approval');
  const approval = await db.appRecord.findFirst({ where: { applicationId: exec.applicationId, clientId: exec.clientId, collection: '_approvals', createdByExecutionId: exec.id } , orderBy: { createdAt: 'desc' } });
  if (!approval) throw new NotFoundError('Approval');
  const data = approval.data as { onReject?: string };
  await db.appRecord.update({ where: { id: approval.id }, data: { data: { ...(approval.data as object), status: decision === 'APPROVE' ? 'approved' : 'rejected', decidedBy: userId, decidedAt: new Date().toISOString(), note } } });
  if (decision === 'REJECT') {
    return db.workflowExecution.update({
      where: { id: exec.id },
      data: { status: data.onReject === 'fail' ? 'FAILED' : 'SUCCEEDED', error: `Rejected${note ? `: ${note}` : ''}`, finishedAt: new Date() },
    });
  }
  const job = await enqueueJob({ type: 'WORKFLOW_EXECUTION', organizationId: exec.organizationId, clientId: exec.clientId, entityType: 'WorkflowExecution', entityId: exec.id, idempotencyKey: `wf:${exec.id}:approved:${approval.id}`, priority: 5 });
  // Point the run at the job that resumes it, so a page can drive it too.
  return db.workflowExecution.update({ where: { id: exec.id }, data: { status: 'QUEUED', jobId: job?.id ?? exec.jobId } });
}

/** Starts scheduled workflows whose time has come; the slot is the idempotency key, so once per slot. */
export async function runDueSchedules(now = new Date()) {
  const apps = await db.clientApplication.findMany({ where: { status: 'ACTIVE', archivedAt: null, activeConfigVersionId: { not: null } }, take: 500 });
  let started = 0;
  for (const app of apps) {
    const config = await db.appConfigVersion.findUnique({ where: { id: app.activeConfigVersionId! } });
    const manifest = config?.manifest as unknown as Manifest | undefined;
    // When each schedule was last checked, so a tick looks only at the time since.
    const state = (app.scheduleState ?? {}) as Record<string, string>;
    let changed = false;
    for (const wf of manifest?.workflows ?? []) {
      if (wf.trigger.type !== 'schedule' || !wf.trigger.cron) continue;
      const last = state[wf.key] ? new Date(state[wf.key]!) : new Date(now.getTime() - 60 * 60_000);
      const slot = lastFireBetween(wf.trigger.cron, last, now, wf.trigger.timezone ?? 'UTC');
      state[wf.key] = now.toISOString();
      changed = true;
      if (!slot) continue;
      const access: AccessContext = { ...systemAccess(app.organizationId), clients: { kind: 'clients', ids: [app.clientId] } };
      await startExecution(access, null, app.id, wf.key, {}, { trigger: 'SCHEDULE', idempotencyKey: `schedule:${wf.key}:${slot.toISOString()}` }).then(() => started++).catch(() => undefined);
    }
    if (changed) await db.clientApplication.update({ where: { id: app.id }, data: { scheduleState: state } });
  }
  return { started };
}

// ---------------------------------------------------------------------------
// Inbound webhooks
// ---------------------------------------------------------------------------

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

/** Issues a new webhook token (shown once); the previous one stops working. */
export async function rotateWebhookToken(access: AccessContext, applicationId: string) {
  const app = await loadApp(access, applicationId);
  const token = `relay_wh_${randomBytes(24).toString('base64url')}`;
  await db.clientApplication.update({ where: { id: app.id }, data: { webhookTokenHash: hashToken(token) } });
  return { token };
}

/** Finds the application a webhook token belongs to. */
export async function applicationForToken(applicationId: string, token: string) {
  const app = await db.clientApplication.findFirst({ where: { id: applicationId, archivedAt: null } });
  if (!app?.webhookTokenHash) return null;
  const a = Buffer.from(app.webhookTokenHash);
  const b = Buffer.from(hashToken(token));
  return a.length === b.length && timingSafeEqual(a, b) ? app : null;
}

/**
 * Starts a webhook-triggered workflow from a customer's system. The token
 * identifies one application, so the run is scoped to that customer only;
 * the workflow must be declared with a webhook trigger in the live
 * configuration. Returns null when the token doesn't match.
 */
export async function startFromWebhook(applicationId: string, token: string, workflowKey: string, input: unknown, idempotencyKey: string | null) {
  const app = await applicationForToken(applicationId, token);
  if (!app) return null;
  const config = app.activeConfigVersionId ? await db.appConfigVersion.findUnique({ where: { id: app.activeConfigVersionId } }) : null;
  const workflow = (config?.manifest as unknown as Manifest | undefined)?.workflows.find((w) => w.key === workflowKey);
  if (!workflow || workflow.trigger.type !== 'webhook') throw new NotFoundError('Webhook workflow');
  const access: AccessContext = { ...systemAccess(app.organizationId), clients: { kind: 'clients', ids: [app.clientId] } };
  return startExecution(access, null, app.id, workflowKey, input, { trigger: 'WEBHOOK', idempotencyKey: idempotencyKey ? `webhook:${idempotencyKey}` : undefined });
}

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

export const connectionSchema = z.object({
  clientId: z.string().uuid(),
  provider: z.enum(['rest_api', 'webhook']),
  label: z.string().trim().min(1).max(80),
  baseUrl: z.string().url().max(500).refine((u) => u.startsWith('https://'), 'Use an https:// address'),
  authHeader: z.string().regex(/^[A-Za-z0-9-]{1,60}$/).default('authorization'),
  secret: z.string().max(4000).optional(),
  isSandbox: z.boolean().default(false),
});

export async function createConnection(access: AccessContext, userId: string | null, raw: z.input<typeof connectionSchema>) {
  const input = connectionSchema.parse(raw);
  assertClientAccess(access, input.clientId);
  const row = await db.integrationConnection.create({
    data: {
      organizationId: access.organizationId, clientId: input.clientId, provider: input.provider, label: input.label,
      config: { baseUrl: input.baseUrl, authHeader: input.authHeader }, encryptedSecret: input.secret ? encryptSecret(input.secret) : null,
      isSandbox: input.isSandbox, createdById: userId,
    },
  });
  return publicConnection(row);
}

export function publicConnection(c: { id: string; clientId: string; provider: string; label: string; config: unknown; encryptedSecret: string | null; status: string; isSandbox: boolean; lastCheckedAt: Date | null; lastError: string | null; createdAt: Date }) {
  // The secret never leaves the server; only whether one is stored.
  return { id: c.id, clientId: c.clientId, provider: c.provider, label: c.label, config: c.config, hasSecret: !!c.encryptedSecret, status: c.status, isSandbox: c.isSandbox, lastCheckedAt: c.lastCheckedAt, lastError: c.lastError, createdAt: c.createdAt };
}

export async function listConnections(access: AccessContext, clientId?: string | null) {
  const rows = await db.integrationConnection.findMany({ where: { ...clientFilter(access, clientId) }, orderBy: { createdAt: 'desc' } });
  return rows.map(publicConnection);
}

/** Reaches the connection's base URL to confirm it answers (no secret sent). */
export async function checkConnection(access: AccessContext, id: string) {
  const conn = await db.integrationConnection.findFirst({ where: { id, ...clientFilter(access) } });
  if (!conn) throw new NotFoundError('Connection');
  const baseUrl = (conn.config as { baseUrl?: string }).baseUrl;
  let ok = false;
  let detail = '';
  try {
    const res = await safeFetch(baseUrl!, { method: 'GET', signal: AbortSignal.timeout(8_000) });
    ok = res.status < 500;
    detail = `Responded ${res.status}`;
  } catch (err) {
    detail = err instanceof Error ? err.message : 'Unreachable';
  }
  await db.integrationConnection.update({ where: { id }, data: { lastCheckedAt: new Date(), lastError: ok ? null : detail, status: ok ? 'CONNECTED' : 'ERROR' } });
  return { ok, detail };
}

export async function disconnect(access: AccessContext, id: string) {
  const conn = await db.integrationConnection.findFirst({ where: { id, ...clientFilter(access) } });
  if (!conn) throw new NotFoundError('Connection');
  return db.integrationConnection.update({ where: { id }, data: { status: 'DISCONNECTED', encryptedSecret: null } });
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function listApplications(access: AccessContext, clientId?: string | null) {
  const since = startOfDay(new Date());
  const rows = await db.clientApplication.findMany({
    where: { ...clientFilter(access, clientId), archivedAt: null },
    orderBy: { updatedAt: 'desc' },
    include: { client: { select: { id: true, name: true } }, template: { select: { name: true, industry: true } } },
  });
  const [today, failing] = await Promise.all([
    db.workflowExecution.groupBy({ by: ['applicationId'], where: { applicationId: { in: rows.map((r) => r.id) }, isTest: false, createdAt: { gte: since } }, _count: true }),
    db.workflowExecution.groupBy({ by: ['applicationId'], where: { applicationId: { in: rows.map((r) => r.id) }, isTest: false, status: 'FAILED', createdAt: { gte: since } }, _count: true }),
  ]);
  return rows.map(({ webhookTokenHash, ...r }) => ({
    ...r, hasWebhookToken: !!webhookTokenHash,
    runsToday: today.find((t) => t.applicationId === r.id)?._count ?? 0,
    failedToday: failing.find((t) => t.applicationId === r.id)?._count ?? 0,
  }));
}

export async function getApplication(access: AccessContext, id: string) {
  const app = await loadApp(access, id);
  const since = startOfDay(new Date());
  const [configs, deployments, executions, byStatus, records, client, template, templateVersion] = await Promise.all([
    db.appConfigVersion.findMany({ where: { applicationId: id }, orderBy: { version: 'desc' }, take: 20 }),
    db.appDeployment.findMany({ where: { applicationId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    db.workflowExecution.findMany({ where: { applicationId: id }, orderBy: { createdAt: 'desc' }, take: 30 }),
    db.workflowExecution.groupBy({ by: ['status'], where: { applicationId: id, isTest: false, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, _count: true }),
    db.appRecord.groupBy({ by: ['collection', 'isTest'], where: { applicationId: id }, _count: true }),
    db.client.findUnique({ where: { id: app.clientId }, select: { id: true, name: true } }),
    app.templateId ? db.appTemplate.findUnique({ where: { id: app.templateId }, include: { versions: { where: { status: 'PUBLISHED' }, select: { id: true, version: true } } } }) : null,
    app.templateVersionId ? db.appTemplateVersion.findUnique({ where: { id: app.templateVersionId }, select: { id: true, version: true, manifest: true } }) : null,
  ]);
  const runsToday = await db.workflowExecution.count({ where: { applicationId: id, isTest: false, createdAt: { gte: since } } });
  // The production gate for the newest configuration: which workflows have passed a test in it.
  const latest = configs[0];
  const passed = latest
    ? await db.workflowExecution.findMany({ where: { applicationId: id, configVersionId: latest.id, isTest: true, status: 'SUCCEEDED' }, select: { workflowKey: true }, distinct: ['workflowKey'] })
    : [];
  const gate = latest
    ? { configVersionId: latest.id, required: (latest.manifest as unknown as Manifest).workflows?.map((w) => w.key) ?? [], passed: passed.map((p) => p.workflowKey) }
    : null;
  const { webhookTokenHash, ...safeApp } = app;
  return {
    app: { ...safeApp, hasWebhookToken: !!webhookTokenHash }, client, template, templateVersion, configs, deployments, executions, gate,
    health: { last30Days: byStatus.map((b) => ({ status: b.status, count: b._count })), runsToday },
    records: records.map((r) => ({ collection: r.collection, isTest: r.isTest, count: r._count })),
  };
}

export async function listRecords(access: AccessContext, applicationId: string, collection: string, opts: { isTest?: boolean; limit?: number } = {}) {
  const app = await loadApp(access, applicationId);
  return db.appRecord.findMany({
    where: { applicationId: app.id, clientId: app.clientId, collection, isTest: opts.isTest ?? false },
    orderBy: { createdAt: 'desc' },
    take: opts.limit ?? 50,
  });
}

export async function getExecution(access: AccessContext, id: string) {
  const exec = await db.workflowExecution.findFirst({ where: { id, ...clientFilter(access) } });
  if (!exec) throw new NotFoundError('Execution');
  return exec;
}

export type { Overrides };
