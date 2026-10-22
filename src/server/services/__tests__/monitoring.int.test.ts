import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Health checks raise one alert per condition while it holds and resolve it
 * when it clears: a queue nobody serves, a paused provider, dead letters,
 * failed webhooks, and a customer application that keeps failing.
 */

const { dbTestsAllowed } = await import('@/test/db');
const { db } = await import('@/lib/db');
const reachable = dbTestsAllowed() && await db.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
const { checkPlatformHealth } = await import('../monitoring');

describe.skipIf(!reachable)('platform health checks (database)', () => {
  const orgId = randomUUID();
  const provider = `test-provider-${orgId.slice(0, 6)}`;
  const hookId = `evt_health_${orgId.slice(0, 8)}`;
  const now = new Date();
  const ago = (min: number) => new Date(now.getTime() - min * 60_000);
  let appId = '';

  const open = (key: string, org: string | null = null) => db.systemAlert.findFirst({ where: { dedupeKey: key, organizationId: org, resolvedAt: null } });

  beforeAll(async () => {
    // Only this test's heartbeats count.
    await db.workerHeartbeat.deleteMany({});
    await db.organization.create({ data: { id: orgId, clerkOrgId: `test_${orgId}`, name: 'Health test', slug: `health-${orgId.slice(0, 8)}` } });
    const client = await db.client.create({ data: { organizationId: orgId, name: 'Synthetic health', slug: `synthetic-health-${orgId.slice(0, 6)}` } });
    const { createApplication, ensureBuiltinTemplates } = await import('@/server/studio/applications');
    const { systemAccess } = await import('@/server/access/scope');
    await ensureBuiltinTemplates();
    const tv = await db.appTemplateVersion.findFirstOrThrow({ where: { template: { slug: 'manufacturing-quality-claims', organizationId: null } } });
    const { app, config } = await createApplication(systemAccess(orgId), null, { clientId: client.id, templateVersionId: tv.id, name: 'Claims' });
    appId = app.id;
    // A stuck customer workflow job, waiting 30 minutes.
    await db.job.create({ data: { type: 'WORKFLOW_EXECUTION', queue: 'customer-workflows', organizationId: orgId, status: 'QUEUED', runAt: ago(30), idempotencyKey: `health-${orgId}` } });
    // A job dead-lettered an hour ago.
    await db.job.create({ data: { type: 'SCREENING', queue: 'screening', organizationId: orgId, status: 'FAILED', deadLetteredAt: ago(60), idempotencyKey: `health-dead-${orgId}` } });
    // A paused provider.
    await db.providerThrottle.create({ data: { provider, circuitOpenUntil: new Date(now.getTime() + 10 * 60_000), lastError: 'HTTP 503' } });
    // A failed webhook.
    await db.webhookEvent.create({ data: { provider: 'stripe', externalId: hookId, type: 'invoice.paid', payload: {}, error: 'boom' } });
    // 12 production runs in the last day, 4 failed (33%).
    await db.workflowExecution.createMany({
      data: Array.from({ length: 12 }, (_, i) => ({ organizationId: orgId, clientId: client.id, applicationId: app.id, configVersionId: config.id, workflowKey: 'claim_intake', trigger: 'WEBHOOK', status: i < 4 ? 'FAILED' : 'SUCCEEDED', createdAt: ago(30) })),
    });
  });

  afterAll(async () => {
    if (reachable) {
      await db.job.deleteMany({ where: { organizationId: orgId } });
      await db.providerThrottle.deleteMany({ where: { provider } });
      await db.webhookEvent.deleteMany({ where: { externalId: hookId } });
      await db.systemAlert.deleteMany({ where: { OR: [{ organizationId: orgId }, { dedupeKey: { in: ['worker:customer-workflows', `provider:${provider}`, 'webhook:stripe'] } }] } });
      await db.organization.delete({ where: { id: orgId } }).catch(() => undefined);
      await db.workerHeartbeat.deleteMany({});
    }
    await db.$disconnect();
  });

  it('raises one alert per condition', async () => {
    await checkPlatformHealth(now);
    await checkPlatformHealth(now); // a second pass bumps, never duplicates
    const worker = await open('worker:customer-workflows');
    expect(worker?.severity).toBe('critical');
    expect(worker?.title).toMatch(/Customer workflows/);
    expect(worker?.occurrences).toBe(2);
    expect((await open(`provider:${provider}`))?.detail).toMatch(/HTTP 503/);
    expect((await open('jobs:dead-letters', orgId))?.title).toMatch(/1 job/);
    expect((await open('webhook:stripe'))?.title).toMatch(/1 stripe webhook/);
    expect((await open(`app-failures:${appId}`, orgId))?.title).toMatch(/4 of 12 runs failed/);
    expect(await db.systemAlert.count({ where: { dedupeKey: 'worker:customer-workflows' } })).toBe(1);
  });

  it('resolves each alert when its condition clears', async () => {
    await db.workerHeartbeat.create({ data: { workerId: 'health-studio', group: 'studio', lastSeenAt: now } });
    await db.providerThrottle.update({ where: { provider }, data: { circuitOpenUntil: null } });
    await db.webhookEvent.update({ where: { provider_externalId: { provider: 'stripe', externalId: hookId } }, data: { processedAt: now, error: null } });
    await db.job.updateMany({ where: { organizationId: orgId, deadLetteredAt: { not: null } }, data: { deadLetteredAt: ago(48 * 60) } });
    await db.workflowExecution.updateMany({ where: { applicationId: appId, status: 'FAILED' }, data: { status: 'SUCCEEDED' } });
    await checkPlatformHealth(now);
    for (const [key, org] of [['worker:customer-workflows', null], [`provider:${provider}`, null], ['webhook:stripe', null], ['jobs:dead-letters', orgId], [`app-failures:${appId}`, orgId]] as const) {
      expect(await open(key, org), key).toBeNull();
    }
  });
});
