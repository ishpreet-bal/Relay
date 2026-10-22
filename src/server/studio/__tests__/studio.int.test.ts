import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';

/**
 * Phase D acceptance: two synthetic customers on the same template, with
 * different branding, rules, users and connections, against a real
 * Postgres. Shows that their data, connections, approvals, quotas and
 * failures stay separate, and that deploy, rollback and template upgrades
 * keep each customer's configuration.
 */

vi.mock('node:dns/promises', () => ({ lookup: async () => [{ address: '93.184.216.34', family: 4 }] }));
process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');

const { dbTestsAllowed } = await import('@/test/db');
const { db } = await import('@/lib/db');
const reachable = dbTestsAllowed() && await db.$queryRaw`SELECT 1`.then(() => true).catch(() => false);

const studio = await import('../applications');
const { processQueues } = await import('@/server/services/job-runner');
const { systemAccess } = await import('@/server/access/scope');
type Access = ReturnType<typeof systemAccess>;

const calls: Array<{ url: string; auth: string | null }> = [];
vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  calls.push({ url, auth: (init?.headers as Record<string, string> | undefined)?.authorization ?? null });
  return Response.json({ ok: true, received: init?.body ? JSON.parse(String(init.body)) : null });
}));

async function drain() {
  for (let i = 0; i < 50; i++) {
    if (!(await processQueues('studio-test', ['customer-workflows'], 4, { deadline: Date.now() + 30_000 }))) return;
  }
}

describe.skipIf(!reachable)('studio tenant isolation (database)', () => {
  const orgId = randomUUID();
  const t: Record<'a' | 'b', { clientId: string; access: Access; userId: string; appId: string; connectionId: string }> = {} as never;
  let staff: Access;
  let templateVersionId = '';

  beforeAll(async () => {
    await db.organization.create({ data: { id: orgId, clerkOrgId: `test_${orgId}`, name: 'Studio test', slug: `studio-test-${orgId.slice(0, 8)}` } });
    staff = systemAccess(orgId);
    await studio.ensureBuiltinTemplates();
    const tpl = await db.appTemplate.findFirstOrThrow({ where: { organizationId: null, slug: 'manufacturing-quality-claims' }, include: { versions: true } });
    templateVersionId = tpl.versions.find((v) => v.version === '1.0.0')!.id;

    for (const [k, name] of [['a', 'Synthetic Northwind Parts'], ['b', 'Synthetic Contoso Metals']] as const) {
      const client = await db.client.create({ data: { organizationId: orgId, name, slug: `synthetic-${k}-${orgId.slice(0, 6)}` } });
      const user = await db.user.create({ data: { clerkUserId: `test_${orgId}_${k}`, email: `${k}-${orgId.slice(0, 8)}@example.test` } });
      const access: Access = { organizationId: orgId, userId: user.id, role: 'CLIENT_ADMIN', clients: { kind: 'clients', ids: [client.id] } };
      const conn = await studio.createConnection(access, user.id, { clientId: client.id, provider: 'rest_api', label: `${name} API`, baseUrl: `https://${k}-api.test`, secret: `Bearer secret-${k}`, isSandbox: true });
      t[k] = { clientId: client.id, access, userId: user.id, appId: '', connectionId: conn.id };
    }
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (reachable) {
      await db.organization.delete({ where: { id: orgId } }).catch(() => undefined);
      await db.user.deleteMany({ where: { clerkUserId: { startsWith: `test_${orgId}` } } });
    }
    await db.$disconnect();
  });

  it('builds two customer apps from one template with their own branding, rules and limits', async () => {
    const a = await studio.createApplication(staff, null, {
      clientId: t.a.clientId, templateVersionId, name: 'Northwind quality claims',
      overrides: { branding: { displayName: 'Northwind QA', primaryColor: '#111111' }, rules: { escalation_quantity: 10 }, limits: { maxExecutionsPerDay: 2 } },
    });
    const b = await studio.createApplication(staff, null, {
      clientId: t.b.clientId, templateVersionId, name: 'Contoso quality claims',
      overrides: { branding: { displayName: 'Contoso Quality', primaryColor: '#222222' }, rules: { escalation_quantity: 200 } },
    });
    t.a.appId = a.app.id;
    t.b.appId = b.app.id;
    expect(a.config.status).toBe('VALID');
    expect(b.config.status).toBe('VALID');
    const ma = a.config.manifest as { branding: { displayName: string }; rules: Record<string, number> };
    const mb = b.config.manifest as { branding: { displayName: string }; rules: Record<string, number> };
    expect([ma.branding.displayName, ma.rules.escalation_quantity]).toEqual(['Northwind QA', 10]);
    expect([mb.branding.displayName, mb.rules.escalation_quantity]).toEqual(['Contoso Quality', 200]);
  });

  it("refuses a configuration that uses another customer's connection", async () => {
    const tpl = await studio.createTemplate(staff, { slug: `claims-sync-${orgId.slice(0, 6)}`, name: 'Claims with ERP sync', industry: 'Manufacturing', description: 'Posts claims to the customer ERP.' });
    const base = (await db.appTemplateVersion.findUniqueOrThrow({ where: { id: templateVersionId } })).manifest as Record<string, unknown>;
    const manifest = {
      ...base,
      modules: [...(base.modules as object[]), { key: 'integrations', version: '1.0', config: {} }],
      integrations: [{ key: 'erp', provider: 'rest_api', required: true, purpose: 'Post claims' }],
      workflows: [{ key: 'sync', name: 'Sync claim', trigger: { type: 'manual' }, steps: [{ key: 'post', type: 'http_request', config: { integration: 'erp', method: 'POST', path: '/claims', body: { part: { $input: 'part_number' } } } }], testInput: { part_number: 'SYN-1' } }],
    };
    const v = await studio.publishTemplateVersion(staff, null as never, tpl.id, { version: '1.0.0', manifest, changelog: 'First' });
    const crossed = await studio.createApplication(staff, null, { clientId: t.a.clientId, templateVersionId: v.id, name: 'ERP sync', overrides: { bindings: { erp: t.b.connectionId } } });
    expect(crossed.config.status).toBe('INVALID');
    expect(JSON.stringify(crossed.config.validationErrors)).toMatch(/not one of this customer's connections/);

    // With its own connection it's valid; a test run calls the customer's sandbox API with its own secret.
    const own = await studio.saveConfig(staff, null, crossed.app.id, { bindings: { erp: t.a.connectionId } }, 'own connection');
    expect(own.status).toBe('VALID');
    await studio.startExecution(staff, null, crossed.app.id, 'sync', null, { test: true });
    await drain();
    expect(calls).toEqual([{ url: 'https://a-api.test/claims', auth: 'Bearer secret-a' }]);
    // The secret is never returned by the API.
    const listed = await studio.listConnections(t.a.access);
    expect(JSON.stringify(listed)).not.toMatch(/secret-a/);
    expect(listed[0]).toMatchObject({ hasSecret: true });
  });

  it('only deploys to production after every workflow passed a test on synthetic data', async () => {
    for (const k of ['a', 'b'] as const) {
      const config = await db.appConfigVersion.findFirstOrThrow({ where: { applicationId: t[k].appId }, orderBy: { version: 'desc' } });
      await expect(studio.deployConfig(staff, null, t[k].appId, config.id, 'PRODUCTION')).rejects.toThrow(/passing test of every workflow/);
      for (const wf of ['claim_intake', 'weekly_report']) await studio.startExecution(staff, null, t[k].appId, wf, null, { test: true });
      await drain();
      const tests = await db.workflowExecution.findMany({ where: { applicationId: t[k].appId, isTest: true } });
      // The synthetic claim (120 units, high) escalates for both and waits for approval; approve it.
      for (const e of tests.filter((x) => x.status === 'WAITING_APPROVAL')) await studio.decideApproval(staff, t[k].userId, e.id, 'APPROVE', null);
      await drain();
      expect((await db.workflowExecution.findMany({ where: { applicationId: t[k].appId, isTest: true } })).every((e) => e.status === 'SUCCEEDED')).toBe(true);
      await studio.deployConfig(staff, null, t[k].appId, config.id, 'PRODUCTION');
      expect((await db.clientApplication.findUniqueOrThrow({ where: { id: t[k].appId } })).status).toBe('ACTIVE');
    }
  });

  it("applies each customer's own rules, and keeps their data apart", async () => {
    const claim = { customer: 'Synthetic Buyer', part_number: 'P-50', defect: 'Scratch', quantity: 50, severity: 'medium' };
    const ea = await studio.startExecution(t.a.access, t.a.userId, t.a.appId, 'claim_intake', claim);
    const eb = await studio.startExecution(t.b.access, t.b.userId, t.b.appId, 'claim_intake', claim);
    await drain();
    // 50 ≥ Northwind's 10: escalated and waiting; 50 < Contoso's 200: recorded, done.
    expect((await db.workflowExecution.findUniqueOrThrow({ where: { id: ea.id } })).status).toBe('WAITING_APPROVAL');
    expect((await db.workflowExecution.findUniqueOrThrow({ where: { id: eb.id } })).status).toBe('SUCCEEDED');

    // Production listings show production records only, and only the customer's own.
    const aClaims = await studio.listRecords(t.a.access, t.a.appId, 'claims');
    const bClaims = await studio.listRecords(t.b.access, t.b.appId, 'claims');
    expect(aClaims).toHaveLength(1);
    expect(bClaims).toHaveLength(1);
    expect(aClaims.every((r) => r.clientId === t.a.clientId && !r.isTest)).toBe(true);
    expect(await db.appRecord.count({ where: { applicationId: t.a.appId, NOT: { clientId: t.a.clientId } } })).toBe(0);

    // A customer can't reach the other's app, records, run or approval.
    await expect(studio.getApplication(t.b.access, t.a.appId)).rejects.toThrow(/not found/i);
    await expect(studio.listRecords(t.b.access, t.a.appId, 'claims')).rejects.toThrow(/not found/i);
    await expect(studio.getExecution(t.b.access, ea.id)).rejects.toThrow(/not found/i);
    await expect(studio.decideApproval(t.b.access, t.b.userId, ea.id, 'APPROVE', null)).rejects.toThrow(/not found/i);
    expect((await studio.listApplications(t.b.access)).map((x) => x.id)).toEqual([t.b.appId]);
    expect((await studio.listConnections(t.b.access)).every((c) => c.clientId === t.b.clientId)).toBe(true);

    // The right customer approves; the run points at the job that resumes it, and finishes.
    const approved = await studio.decideApproval(t.a.access, t.a.userId, ea.id, 'APPROVE', 'Credit issued');
    const resume = await db.job.findUniqueOrThrow({ where: { id: approved.jobId! } });
    expect([resume.status, resume.idempotencyKey]).toEqual(['QUEUED', expect.stringMatching(/:approved:/)]);
    await drain();
    expect((await db.workflowExecution.findUniqueOrThrow({ where: { id: ea.id } })).status).toBe('SUCCEEDED');
  });

  it("runs each customer independently: one's failure and quota don't touch the other", async () => {
    // Northwind's daily limit is 2 and it has used 1; one more is allowed, then it stops.
    const bad = await studio.startExecution(t.a.access, t.a.userId, t.a.appId, 'claim_intake', { customer: 'X' });
    await expect(studio.startExecution(t.a.access, t.a.userId, t.a.appId, 'claim_intake', {})).rejects.toThrow(/Daily limit of 2/);
    const good = await studio.startExecution(t.b.access, t.b.userId, t.b.appId, 'claim_intake', { customer: 'Y', part_number: 'P', defect: 'D', quantity: 1, severity: 'low' });
    await drain();
    const failed = await db.workflowExecution.findUniqueOrThrow({ where: { id: bad.id } });
    expect(failed.status).toBe('FAILED');
    expect(failed.error).toMatch(/Part number is required/);
    expect((await db.workflowExecution.findUniqueOrThrow({ where: { id: good.id } })).status).toBe('SUCCEEDED');
  });

  it('rolls back, and upgrades the template while keeping the customer\'s settings', async () => {
    const before = (await db.clientApplication.findUniqueOrThrow({ where: { id: t.b.appId } })).activeConfigVersionId;
    const v2 = await studio.saveConfig(staff, null, t.b.appId, { branding: { displayName: 'Contoso Quality v2' }, rules: { escalation_quantity: 150 } }, 'rebrand');
    for (const wf of ['claim_intake', 'weekly_report']) await studio.startExecution(staff, null, t.b.appId, wf, { ...((wf === 'claim_intake') ? { customer: 'S', part_number: 'S', defect: 'S', quantity: 1, severity: 'low' } : {}) }, { test: true, configVersionId: v2.id });
    await drain();
    await studio.deployConfig(staff, null, t.b.appId, v2.id, 'PRODUCTION');
    expect((await db.clientApplication.findUniqueOrThrow({ where: { id: t.b.appId } })).activeConfigVersionId).toBe(v2.id);
    await studio.rollback(staff, null, t.b.appId);
    expect((await db.clientApplication.findUniqueOrThrow({ where: { id: t.b.appId } })).activeConfigVersionId).toBe(before);
    expect((await db.appDeployment.findFirstOrThrow({ where: { applicationId: t.b.appId }, orderBy: { createdAt: 'desc' } })).kind).toBe('ROLLBACK');

    // A minor template release adds a field; upgrading keeps Contoso's overrides.
    const tpl = await db.appTemplate.findFirstOrThrow({ where: { organizationId: null, slug: 'manufacturing-quality-claims' } });
    const base = (await db.appTemplateVersion.findUniqueOrThrow({ where: { id: templateVersionId } })).manifest as { collections: Array<{ key: string; fields: object[] }> };
    const minor = { ...base, collections: base.collections.map((c) => ({ ...c, fields: [...c.fields, { key: 'lot_number', label: 'Lot number', type: 'text', required: false }] })) };
    const minorVersion = await db.appTemplateVersion.upsert({
      where: { templateId_version: { templateId: tpl.id, version: '1.1.0' } },
      create: { templateId: tpl.id, version: '1.1.0', manifest: minor as never, status: 'PUBLISHED', publishedAt: new Date() },
      update: {},
    });
    const up = await studio.upgradeApplication(staff, null, t.b.appId, minorVersion.id);
    expect(up.breaking).toEqual([]);
    const m = up.config.manifest as { rules: Record<string, number>; branding: { displayName: string }; collections: Array<{ fields: Array<{ key: string }> }> };
    expect(m.rules.escalation_quantity).toBe(150);
    expect(m.collections[0]!.fields.map((f) => f.key)).toContain('lot_number');
    // Upgrading never deploys by itself.
    expect((await db.clientApplication.findUniqueOrThrow({ where: { id: t.b.appId } })).activeConfigVersionId).toBe(before);
    await db.appTemplateVersion.delete({ where: { id: minorVersion.id } });
  });
});
