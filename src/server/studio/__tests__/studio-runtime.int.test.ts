import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';

/**
 * Studio runtime against a real Postgres: built-in templates stay shared,
 * the inbound webhook (through the route handler itself), record-triggered
 * workflows without loops, and a retried run that doesn't write twice.
 */

vi.mock('node:dns/promises', () => ({ lookup: async () => [{ address: '93.184.216.34', family: 4 }] }));
process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');

const { dbTestsAllowed } = await import('@/test/db');
const { db } = await import('@/lib/db');
const reachable = dbTestsAllowed() && await db.$queryRaw`SELECT 1`.then(() => true).catch(() => false);

const studio = await import('../applications');
const { processQueues } = await import('@/server/services/job-runner');
const { systemAccess } = await import('@/server/access/scope');
const { POST } = await import('@/app/api/studio/hooks/[applicationId]/[workflowKey]/route');

let failNext = 0;
const calls: string[] = [];
vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
  calls.push(String(input instanceof Request ? input.url : input));
  if (failNext > 0) { failNext--; return new Response('busy', { status: 503 }); }
  return Response.json({ ok: true });
}));

async function drain() {
  for (let i = 0; i < 50; i++) {
    if (!(await processQueues('studio-test', ['customer-workflows'], 4, { deadline: Date.now() + 30_000 }))) return;
  }
}

const MANIFEST = {
  schemaVersion: 1,
  app: { name: 'Service tickets', description: 'Synthetic test application' },
  branding: { displayName: 'Tickets' },
  modules: [{ key: 'records', version: '1.0' }, { key: 'notifications', version: '1.0' }, { key: 'integrations', version: '1.0' }],
  roles: [{ key: 'agent', label: 'Agent', permissions: ['records:read', 'records:write', 'notifications:read'] }],
  collections: [{
    key: 'tickets', label: 'Tickets', fields: [
      { key: 'subject', label: 'Subject', type: 'text', required: true },
      { key: 'kind', label: 'Kind', type: 'select', required: true, options: ['request', 'follow_up'] },
    ],
  }],
  integrations: [{ key: 'crm', provider: 'rest_api', required: true, purpose: 'Push tickets to the CRM' }],
  workflows: [
    {
      key: 'intake', name: 'Intake', trigger: { type: 'webhook' },
      steps: [{ key: 'check', type: 'validate', config: { collection: 'tickets' } }, { key: 'save', type: 'create_record', config: { collection: 'tickets', data: { $input: '*' } } }],
      testInput: { subject: 'Synthetic ticket', kind: 'request' },
    },
    {
      // Writes to the collection that triggers it: must not loop.
      key: 'on_ticket', name: 'Follow up', trigger: { type: 'record_created', collection: 'tickets' },
      steps: [
        { key: 'note', type: 'notify', config: { toRoles: ['agent'], title: 'New ticket: {{input.subject}}' } },
        { key: 'follow', type: 'create_record', config: { collection: 'tickets', data: { subject: 'Follow-up', kind: 'follow_up' } } },
      ],
      testInput: { subject: 'Synthetic', kind: 'request' },
    },
    {
      key: 'sync', name: 'Sync', trigger: { type: 'manual' },
      steps: [
        { key: 'save', type: 'create_record', config: { collection: 'tickets', data: { subject: { $input: 'subject' }, kind: 'request' } } },
        { key: 'push', type: 'http_request', config: { integration: 'crm', method: 'POST', path: '/tickets', body: { subject: { $input: 'subject' } } } },
      ],
      testInput: { subject: 'Synthetic sync' },
    },
  ],
};

describe.skipIf(!reachable)('studio runtime (database)', () => {
  const orgId = randomUUID();
  const staff = systemAccess(orgId);
  let clientId = '';
  let appId = '';

  beforeAll(async () => {
    await db.organization.create({ data: { id: orgId, clerkOrgId: `test_${orgId}`, name: 'Studio runtime test', slug: `studio-rt-${orgId.slice(0, 8)}` } });
    clientId = (await db.client.create({ data: { organizationId: orgId, name: 'Synthetic Fabrikam Services', slug: `synthetic-fab-${orgId.slice(0, 6)}` } })).id;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (reachable) await db.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await db.$disconnect();
  });

  it('keeps built-in templates shared: a workspace copies one before releasing its own versions', async () => {
    await studio.ensureBuiltinTemplates();
    const builtin = await db.appTemplate.findFirstOrThrow({ where: { organizationId: null, slug: 'local-services-bookings' }, include: { versions: true } });
    const manifest = builtin.versions[0]!.manifest;
    await expect(studio.publishTemplateVersion(staff, null as never, builtin.id, { version: '9.0.0', manifest, changelog: 'x' })).rejects.toThrow(/not found/i);

    const fork = await studio.forkTemplate(staff, null as never, builtin.versions[0]!.id, { slug: `bookings-${orgId.slice(0, 6)}`, name: 'Our bookings' });
    expect(fork.organizationId).toBe(orgId);
    const v = await studio.publishTemplateVersion(staff, null as never, fork.id, { version: '1.1.0', manifest, changelog: 'Our tweaks' });
    expect(v.version).toBe('1.1.0');
    // The built-in is untouched.
    expect(await db.appTemplateVersion.count({ where: { templateId: builtin.id, version: { in: ['1.1.0', '9.0.0'] } } })).toBe(0);
  });

  it('runs record-triggered workflows once per record, without looping, and resumes a retried run without writing twice', async () => {
    const tpl = await studio.createTemplate(staff, { slug: `tickets-${orgId.slice(0, 6)}`, name: 'Tickets', industry: 'Services', description: 'Synthetic.' });
    const tv = await studio.publishTemplateVersion(staff, null as never, tpl.id, { version: '1.0.0', manifest: MANIFEST, changelog: 'First' });
    const conn = await studio.createConnection(staff, null, { clientId, provider: 'rest_api', label: 'Synthetic CRM', baseUrl: 'https://crm.test', isSandbox: true });
    const { app, config } = await studio.createApplication(staff, null, { clientId, templateVersionId: tv.id, name: 'Tickets', overrides: { bindings: { crm: conn.id } } });
    appId = app.id;
    expect(config.status).toBe('VALID');

    await studio.startExecution(staff, null, appId, 'intake', null, { test: true });
    failNext = 1; // the CRM is busy once
    const sync = await studio.startExecution(staff, null, appId, 'sync', null, { test: true });
    await drain();
    // The failed attempt waits out its backoff; let the clock "pass" and finish.
    await db.job.updateMany({ where: { entityId: sync.id, status: 'RETRYING' }, data: { runAt: new Date() } });
    await drain();

    const runs = await db.workflowExecution.findMany({ where: { applicationId: appId, isTest: true } });
    expect(runs.every((r) => r.status === 'SUCCEEDED')).toBe(true);
    // One follow-up run per original ticket (intake + sync), none for the follow-ups themselves.
    expect(runs.filter((r) => r.workflowKey === 'on_ticket').map((r) => r.trigger)).toEqual(['RECORD', 'RECORD']);
    const tickets = await db.appRecord.findMany({ where: { applicationId: appId, collection: 'tickets', isTest: true } });
    expect(tickets.map((t) => (t.data as { kind: string }).kind).sort()).toEqual(['follow_up', 'follow_up', 'request', 'request']);
    // The retried sync wrote its ticket once and called the CRM twice (busy, then ok).
    expect(tickets.filter((t) => t.createdByExecutionId === sync.id)).toHaveLength(1);
    expect(calls.filter((u) => u === 'https://crm.test/tickets')).toHaveLength(2);
    expect((await db.job.findFirstOrThrow({ where: { entityId: sync.id } })).attempts).toBe(2);

    // Every workflow passed (the follow-up through its triggered test runs), so production is allowed.
    await studio.deployConfig(staff, null, appId, config.id, 'PRODUCTION');
  });

  it('accepts webhooks only with the application token, once per idempotency key', async () => {
    const { token } = await studio.rotateWebhookToken(staff, appId);
    const call = (workflowKey: string, body: string, headers: Record<string, string> = {}) =>
      POST(new Request(`https://relay.test/api/studio/hooks/${appId}/${workflowKey}`, { method: 'POST', body, headers: { authorization: `Bearer ${token}`, ...headers } }), { params: Promise.resolve({ applicationId: appId, workflowKey }) });
    const ticket = JSON.stringify({ subject: 'Synthetic printer jam', kind: 'request' });

    expect((await call('intake', ticket, { authorization: 'Bearer relay_wh_wrong' })).status).toBe(401);
    expect((await call('sync', ticket)).status).toBe(404); // not a webhook workflow
    expect((await call('intake', '{not json')).status).toBe(400);
    expect((await call('intake', JSON.stringify({ pad: 'x'.repeat(70_000) }))).status).toBe(413);

    const first = await call('intake', ticket, { 'idempotency-key': 'evt_1' });
    const again = await call('intake', ticket, { 'idempotency-key': 'evt_1' });
    expect(first.status).toBe(202);
    const [a, b] = [await first.json(), await again.json()];
    expect(b.executionId).toBe(a.executionId);
    await drain();

    const prod = await db.workflowExecution.findMany({ where: { applicationId: appId, isTest: false } });
    expect(prod.map((r) => `${r.workflowKey}:${r.trigger}:${r.status}`).sort()).toEqual(['intake:WEBHOOK:SUCCEEDED', 'on_ticket:RECORD:SUCCEEDED']);
    const tickets = await db.appRecord.findMany({ where: { applicationId: appId, collection: 'tickets', isTest: false } });
    expect(tickets).toHaveLength(2);
    expect(tickets.every((t) => t.clientId === clientId)).toBe(true);

    // A rotated token replaces the old one.
    await studio.rotateWebhookToken(staff, appId);
    expect((await call('intake', ticket, { 'idempotency-key': 'evt_2' })).status).toBe(401);
  });
});
