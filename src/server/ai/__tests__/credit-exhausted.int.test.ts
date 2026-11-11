import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * When the Anthropic account runs out of prepaid credit, work must wait, not
 * fail for good: the provider is paused, the job keeps its attempts, and
 * automatic analysis stops piling up behind it. No live model is called.
 */

Object.assign(process.env, {
  APP_URL: 'http://localhost:3000', CLERK_SECRET_KEY: 'sk_test_clerk_placeholder', CLERK_WEBHOOK_SECRET: 'whsec_placeholder',
  ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'), UNSUBSCRIBE_SIGNING_KEY: 'unit-test-unsubscribe-signing-key-0123456789', CRON_SECRET: 'unit-test-cron-secret',
  ANTHROPIC_API_KEY: 'synthetic-key-not-real',
});
delete process.env.OPENAI_API_KEY;

const creditError = Object.assign(new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}'), { status: 400 });
const create = vi.fn(async () => { throw creditError; });
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create }; } }));

const { dbTestsAllowed } = await import('@/test/db');
const { db } = await import('@/lib/db');
const reachable = dbTestsAllowed() && await db.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
const { complete, isCreditExhausted } = await import('../provider');
const { ProviderUnavailableError, setProviderThrottle } = await import('@/server/queues/throttle');
const { queueAnalysis } = await import('@/server/services/pipeline/gates');

describe('credit exhaustion detection', () => {
  it('recognises the API\'s out-of-credit answer and nothing else', () => {
    expect(isCreditExhausted(creditError)).toBe(true);
    expect(isCreditExhausted(Object.assign(new Error('400 max_tokens must be positive'), { status: 400 }))).toBe(false);
    expect(isCreditExhausted(Object.assign(new Error('credit balance is too low'), { status: 500 }))).toBe(false);
    expect(isCreditExhausted(new Error('network down'))).toBe(false);
  });
});

describe.skipIf(!reachable)('out of AI credit (Postgres, scripted provider)', () => {
  const orgId = randomUUID();
  let accountId = '';
  beforeAll(async () => {
    await setProviderThrottle('anthropic', { reset: true });
    await db.organization.create({ data: { id: orgId, clerkOrgId: `credit-${orgId}`, name: 'Synthetic', slug: `credit-${orgId}` } });
    const client = await db.client.create({ data: { organizationId: orgId, name: 'Synthetic client', slug: `c-${orgId}` } });
    accountId = (await db.account.create({ data: { organizationId: orgId, clientId: client.id, name: 'Synthetic Co', websiteUrl: 'https://synthetic.test' } })).id;
  });
  afterAll(async () => {
    await setProviderThrottle('anthropic', { reset: true });
    await db.organization.delete({ where: { id: orgId } });
    await db.$disconnect();
  });

  it('pauses the provider for an hour, asks once, and reports a wait instead of a failure', async () => {
    const call = () => complete({ organizationId: orgId, kind: 'research', promptVersion: 'test', system: 's', user: 'u' });
    const err = await call().catch((e) => e);
    expect(err).toBeInstanceOf(ProviderUnavailableError);
    expect(err.reason).toBe('BILLING');
    expect(err.message).toContain('credit');
    expect(create).toHaveBeenCalledTimes(1); // no retry storm against an empty balance

    const throttle = await db.providerThrottle.findUniqueOrThrow({ where: { provider: 'anthropic' } });
    const minutes = (throttle.circuitOpenUntil!.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(55);
    expect(minutes).toBeLessThanOrEqual(60);
    expect(throttle.lastError).toContain('Add credit');

    // While paused, nothing reaches the API at all.
    await expect(call()).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('does not queue automatic analysis behind a paused provider, but a person still can', async () => {
    await expect(queueAnalysis(orgId, accountId, 'AUTO')).rejects.toThrow('paused');
    const job = await queueAnalysis(orgId, accountId, 'MANUAL');
    expect(job?.type).toBe('RESEARCH');
  });
});
