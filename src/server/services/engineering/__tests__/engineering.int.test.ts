import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

Object.assign(process.env, {
  APP_URL: 'http://localhost:3000', CLERK_SECRET_KEY: 'sk_test_clerk_placeholder', CLERK_WEBHOOK_SECRET: 'whsec_placeholder',
  ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'), UNSUBSCRIBE_SIGNING_KEY: 'unit-test-unsubscribe-signing-key-0123456789', CRON_SECRET: 'unit-test-cron-secret',
});

const { dbTestsAllowed } = await import('@/test/db');
const { db } = await import('@/lib/db');
const reachable = dbTestsAllowed() && await db.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
const { accessFrom } = await import('@/server/access/scope');
const P = await import('../projects');
const A = await import('../approvals');
const { orchestrateProjects } = await import('../orchestrator');

describe.skipIf(!reachable)('engineering projects (Postgres)', () => {
  const orgId = randomUUID();
  let clientA = ''; let clientB = '';
  const founder = randomUUID(); const operator = randomUUID(); const caller = randomUUID();
  const as = (userId: string, role: 'SUPER_ADMIN' | 'OPERATOR' | 'CALLER', clientIds: string[] = []) => accessFrom({ organizationId: orgId, userId, role, clientId: null, clientIds });
  let projectId = '';

  beforeAll(async () => {
    await db.organization.create({ data: { id: orgId, clerkOrgId: `eng-${orgId}`, name: 'Eng', slug: `eng-${orgId}` } });
    clientA = (await db.client.create({ data: { organizationId: orgId, name: 'Acme', slug: `acme-${orgId}` } })).id;
    clientB = (await db.client.create({ data: { organizationId: orgId, name: 'Other', slug: `other-${orgId}` } })).id;
  });
  afterAll(async () => {
    await db.approval.deleteMany({ where: { organizationId: orgId } });
    await db.engineeringProject.deleteMany({ where: { organizationId: orgId } });
    await db.organization.delete({ where: { id: orgId } });
    await db.$disconnect();
  });

  it('creates a project in intake and keeps it inside the client scope', async () => {
    const p = await P.createProject(as(founder, 'SUPER_ADMIN'), founder, { clientId: clientA, name: 'Invoice automation', problem: 'We re-key 300 supplier invoices a week into our accounting system by hand.', repository: 'acme/invoice-automation' });
    projectId = p.id;
    expect(p.stage).toBe('INTAKE');
    await expect(P.createProject(as(operator, 'OPERATOR', [clientB]), operator, { clientId: clientA, name: 'Other client work', problem: 'a problem long enough to pass' })).rejects.toThrow('Client');
    await expect(P.loadProject(as(operator, 'OPERATOR', [clientB]), projectId)).rejects.toThrow('Client');
    await expect(P.createProject(as(founder, 'SUPER_ADMIN'), founder, { clientId: clientA, name: 'Bad repo', problem: 'a problem long enough to pass', repository: 'not a repo' })).rejects.toThrow();
  });

  it('advances only when evidence is there, one recorded stage at a time', async () => {
    const r1 = await P.advance(projectId, 'orchestrator');
    expect(r1).toMatchObject({ moved: true, from: 'INTAKE', to: 'REQUIREMENTS' });
    const r2 = await P.advance(projectId, 'orchestrator');
    expect(r2.moved).toBe(false);
    expect(r2.gate?.checks[0]).toMatchObject({ ok: false });
    const runs = await db.projectStageRun.findMany({ where: { projectId }, orderBy: { enteredAt: 'asc' } });
    expect(runs.map((r) => r.stage)).toEqual(['INTAKE', 'REQUIREMENTS']);
    expect(runs[0]!.completedBy).toBe('orchestrator');
  });

  it('never lets an author accept their own document', async () => {
    const draft = await P.addArtifact(as(operator, 'OPERATOR'), `user:${operator}`, { projectId, kind: 'REQUIREMENTS', title: 'Requirements v1', content: '# Requirements' });
    expect(draft.status).toBe('DRAFT');
    await expect(P.acceptArtifact(as(operator, 'OPERATOR'), draft.id)).rejects.toThrow('other than the author');
    const v2 = await P.addArtifact(as(operator, 'OPERATOR'), 'agent:analyst:run1', { projectId, kind: 'REQUIREMENTS', title: 'Requirements v2', content: '# Requirements, revised' });
    await expect(P.acceptArtifact(as(founder, 'SUPER_ADMIN'), draft.id)).rejects.toThrow('newer version');
    expect((await P.acceptArtifact(as(founder, 'SUPER_ADMIN'), v2.id)).status).toBe('ACCEPTED');
  });

  it('lets the orchestrator move through every satisfied gate and stop at the first open one', async () => {
    for (const kind of ['ANALYSIS', 'ARCHITECTURE', 'ESTIMATE'] as const) {
      const a = await P.addArtifact(as(operator, 'OPERATOR'), `user:${operator}`, { projectId, kind, title: kind, content: kind });
      await P.acceptArtifact(as(founder, 'SUPER_ADMIN'), a.id);
    }
    const summary = await orchestrateProjects();
    expect(summary.advanced).toBeGreaterThanOrEqual(4);
    expect((await db.engineeringProject.findUniqueOrThrow({ where: { id: projectId } })).stage).toBe('SCOPE_APPROVAL');
  });

  it('routes approvals to someone with the permission who did not ask', async () => {
    const req = await A.requestApproval(as(operator, 'OPERATOR'), `user:${operator}`, { kind: 'SCOPE', projectId, title: 'Approve scope', summary: 'Build the invoice extraction and approval flow for $4,000 plus $300/month.' });
    expect(req.clientId).toBe(clientA);
    await expect(A.decideApproval(as(operator, 'OPERATOR'), req.id, 'APPROVED', null)).rejects.toThrow('other than the person who asked');
    await expect(A.decideApproval(as(caller, 'CALLER'), req.id, 'APPROVED', null)).rejects.toThrow('Missing permission');
    await expect(A.decideApproval(as(founder, 'SUPER_ADMIN'), req.id, 'REJECTED', '  ')).rejects.toThrow('Say why');
    // Staff limited to another client don't see it at all.
    expect(await A.listApprovals(as(operator, 'OPERATOR', [clientB]))).toEqual([]);
    expect((await A.decideApproval(as(founder, 'SUPER_ADMIN'), req.id, 'APPROVED', null)).status).toBe('APPROVED');
    await expect(A.decideApproval(as(founder, 'SUPER_ADMIN'), req.id, 'REJECTED', 'changed my mind')).rejects.toThrow('already approved');
    expect((await P.advance(projectId, `user:${founder}`)).to).toBe('TASKS');
  });

  it('plans tasks with their own branches and releases them as dependencies finish', async () => {
    const access = as(operator, 'OPERATOR');
    await expect(P.addTask(access, { projectId, title: 'No criteria', description: 'x', role: 'developer', acceptanceCriteria: [] })).rejects.toThrow();
    const t1 = await P.addTask(access, { projectId, title: 'Extract invoice fields', description: 'Parse PDFs', role: 'developer', acceptanceCriteria: ['Fields match 20 sample invoices'] });
    const t2 = await P.addTask(access, { projectId, title: 'Post to accounting', description: 'Sync approved invoices', role: 'developer', acceptanceCriteria: ['Posted totals match'], dependsOn: [t1.id] });
    expect(t1.status).toBe('READY');
    expect(t2.status).toBe('PENDING');
    expect(t1.branch).toMatch(/^relay\/extract-invoice-fields-/);
    expect(t1.branch).not.toBe(t2.branch);
    await expect(P.updateTask(access, { id: t2.id, status: 'READY' })).rejects.toThrow('dependencies');
    await expect(P.updateTask(access, { id: t1.id, status: 'DONE', evidence: { pullRequest: 'https://github.com/acme/invoice-automation/pull/1' } })).rejects.toThrow('review');
    await P.updateTask(access, { id: t1.id, status: 'REVIEW', evidence: { pullRequest: 'https://github.com/acme/invoice-automation/pull/1' } });
    expect((await P.updateTask(as(founder, 'SUPER_ADMIN'), { id: t1.id, status: 'DONE' })).verifiedBy).toBe(`user:${founder}`);
    await orchestrateProjects();
    expect((await db.engineeringTask.findUniqueOrThrow({ where: { id: t2.id } })).status).toBe('READY');
  });

  it('blocks a project that reaches its budget and raises an alert', async () => {
    await db.engineeringProject.update({ where: { id: projectId }, data: { budgetCents: 100 } });
    await db.agentRun.create({ data: { projectId, role: 'developer', model: 'claude-sonnet-5-5', status: 'SUCCEEDED', costMillicents: 150_000 } });
    await orchestrateProjects();
    const p = await db.engineeringProject.findUniqueOrThrow({ where: { id: projectId } });
    expect(p.status).toBe('BLOCKED');
    expect(p.blockedReason).toContain('Budget reached');
    expect(await db.systemAlert.count({ where: { organizationId: orgId, dedupeKey: `engineering:${projectId}:budget`, resolvedAt: null } })).toBe(1);
    expect((await P.advance(projectId, 'orchestrator')).moved).toBe(false);
  });
});
