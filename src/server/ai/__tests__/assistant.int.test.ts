import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * The assistant's tool loop against a real Postgres with a scripted model:
 * tools offered by role, results limited to the caller's access, a refused
 * tool call, the round limit, refusals, and the call logged and costed.
 * No live model is called.
 */

const ORIGINAL = { ...process.env };
Object.assign(process.env, {
  APP_URL: 'http://localhost:3000', CLERK_SECRET_KEY: 'sk_test_clerk_placeholder', CLERK_WEBHOOK_SECRET: 'whsec_placeholder',
  ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'), UNSUBSCRIBE_SIGNING_KEY: 'unit-test-unsubscribe-signing-key-0123456789', CRON_SECRET: 'unit-test-cron-secret',
});

const { dbTestsAllowed } = await import('@/test/db');
const { db } = await import('@/lib/db');
const reachable = dbTestsAllowed() && await db.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
const { ask, toolsFor } = await import('../assistant');

type Block = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown };
function scripted(replies: Array<{ content: Block[]; stop: string }>) {
  const requests: Array<{ tools: Array<{ name: string }>; messages: Array<{ role: string; content: unknown }> }> = [];
  let i = 0;
  const client = {
    messages: {
      create: async (params: (typeof requests)[number]) => {
        requests.push(JSON.parse(JSON.stringify(params)));
        const r = replies[Math.min(i++, replies.length - 1)]!;
        return { id: `msg_${i}`, type: 'message', role: 'assistant', model: 'claude-sonnet-5', content: r.content, stop_reason: r.stop, usage: { input_tokens: 1000, output_tokens: 100 } };
      },
    },
  };
  return { client: client as never, requests };
}

describe.skipIf(!reachable)('assistant (database, scripted model)', () => {
  const orgId = randomUUID();
  let clientA = '';

  beforeAll(async () => {
    process.env.DIRECT_DATABASE_URL ||= process.env.DATABASE_URL;
    await db.organization.create({ data: { id: orgId, clerkOrgId: `test_${orgId}`, name: 'Assistant test', slug: `assistant-${orgId.slice(0, 8)}` } });
    clientA = (await db.client.create({ data: { organizationId: orgId, name: 'Client A', slug: `a-${orgId.slice(0, 6)}` } })).id;
    const clientB = (await db.client.create({ data: { organizationId: orgId, name: 'Client B', slug: `b-${orgId.slice(0, 6)}` } })).id;
    await db.account.create({ data: { organizationId: orgId, clientId: clientA, name: 'Synthetic Alpha Tooling', domain: `alpha-${orgId.slice(0, 6)}.test`, score: 80 } });
    await db.account.create({ data: { organizationId: orgId, clientId: clientB, name: 'Synthetic Beta Metals', domain: `beta-${orgId.slice(0, 6)}.test`, score: 90 } });
  });

  afterAll(async () => {
    if (reachable) await db.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await db.$disconnect();
    process.env = ORIGINAL;
  });

  it('offers tools by role', () => {
    expect(toolsFor('ANALYST').map((t) => t.name)).not.toContain('billing_summary');
    expect(toolsFor('SUPER_ADMIN').map((t) => t.name)).toContain('billing_summary');
    expect(toolsFor('CALLER').map((t) => t.name)).not.toContain('queue_health');
  });

  it("answers from tools limited to the caller's access, refusing tools the role lacks", async () => {
    const access = { organizationId: orgId, userId: randomUUID(), role: 'ANALYST' as const, clients: { kind: 'clients' as const, ids: [clientA] } };
    const { client, requests } = scripted([
      { stop: 'tool_use', content: [{ type: 'tool_use', id: 'tu_1', name: 'search_accounts', input: { query: 'Synthetic' } }, { type: 'tool_use', id: 'tu_2', name: 'billing_summary', input: { month: '2026-10' } }] },
      { stop: 'end_turn', content: [{ type: 'text', text: 'Synthetic Alpha Tooling is your top account.' }] },
    ]);
    const answer = await ask(access, 'ANALYST', 'Top accounts?', [], { client });
    expect(answer.text).toBe('Synthetic Alpha Tooling is your top account.');
    expect(answer.toolsUsed).toEqual([{ name: 'search_accounts', ok: true }, { name: 'billing_summary', ok: false }]);
    expect(requests[0]!.tools.map((t) => t.name)).not.toContain('billing_summary');
    const results = requests[1]!.messages.at(-1)!.content as Array<{ tool_use_id: string; content: string; is_error?: boolean }>;
    expect(results[0]!.content).toContain('Synthetic Alpha Tooling');
    expect(results[0]!.content).not.toContain('Beta'); // another client's account, outside this access
    expect(results[1]).toMatchObject({ is_error: true, content: expect.stringMatching(/permission/) });

    const run = await db.aiRun.findFirstOrThrow({ where: { organizationId: orgId, kind: 'assistant' }, orderBy: { createdAt: 'desc' } });
    expect([run.status, run.tokensIn, run.tokensOut]).toEqual(['COMPLETED', 2000, 200]);
    expect(await db.usageRecord.count({ where: { organizationId: orgId, operation: 'assistant.ask' } })).toBe(1);
  });

  it('stops after the round limit, and records a refusal as a failure', async () => {
    const access = { organizationId: orgId, userId: randomUUID(), role: 'SUPER_ADMIN' as const, clients: { kind: 'all' as const } };
    const loop = scripted([{ stop: 'tool_use', content: [{ type: 'tool_use', id: 'tu', name: 'research_funnel', input: {} }] }]);
    const answer = await ask(access, 'SUPER_ADMIN', 'Loop?', [], { client: loop.client });
    expect(loop.requests).toHaveLength(6);
    expect(answer.text).toMatch(/more lookups than I allow/);

    const refusal = scripted([{ stop: 'refusal', content: [] }]);
    await expect(ask(access, 'SUPER_ADMIN', 'Something', [], { client: refusal.client })).rejects.toThrow(/declined/);
    expect((await db.aiRun.findFirstOrThrow({ where: { organizationId: orgId, kind: 'assistant' }, orderBy: { createdAt: 'desc' } })).status).toBe('FAILED');
  });
});
