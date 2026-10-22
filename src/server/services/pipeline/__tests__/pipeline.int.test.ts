import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Phase C acceptance: company records through the whole research funnel on
 * a real Postgres. Only the outside world is stubbed — the businesses'
 * websites at fetch(), and the model at complete() — so screening, gates,
 * caps, budgets, grounding, versions, deep-research validation and refresh
 * are the real code. It shows why each record does or doesn't advance.
 */

vi.mock('node:dns/promises', () => ({ lookup: async () => [{ address: '93.184.216.34', family: 4 }] }));

const modelCalls: string[] = [];
vi.mock('@/server/ai/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/ai/provider')>();
  return {
    ...actual,
    complete: vi.fn(async (req: { kind: string }) => {
      modelCalls.push(req.kind);
      const text = req.kind === 'deep_research' ? JSON.stringify(DEEP_OUTPUT) : JSON.stringify(RESEARCH_OUTPUT);
      return { text, provider: 'anthropic', model: req.kind === 'deep_research' ? 'claude-opus-5-5' : 'claude-sonnet-5', tokensIn: 1000, tokensOut: 500, costCents: req.kind === 'deep_research' ? 20 : 7, latencyMs: 1 };
    }),
  };
});

const { dbTestsAllowed } = await import('@/test/db');
const { db } = await import('@/lib/db');
const reachable = dbTestsAllowed() && await db.$queryRaw`SELECT 1`.then(() => true).catch(() => false);

const { createAccount } = await import('@/server/services/accounts');
const { systemAccess } = await import('@/server/access/scope');
const { processQueues } = await import('@/server/services/job-runner');
const { enqueuePendingScreening, queueAnalysis, setStage } = await import('../gates');
const { refreshAccount } = await import('../refresh');
const { funnelMetrics } = await import('../funnel');
const { updatePipelineSettings } = await import('../settings');

const HOME = (phone: string) => `<!doctype html><html><head><title>Acme Machining</title>
<script type="application/ld+json">${JSON.stringify({ '@type': 'LocalBusiness', name: 'Acme Machining', telephone: phone, address: { streetAddress: '12 Dundas St E', addressLocality: 'Mississauga', addressRegion: 'ON', postalCode: 'L5A 1W2' } })}</script>
</head><body><main><h1>Acme Machining</h1>
<p>Acme Machining is a family-owned CNC machine shop in Mississauga, Ontario, serving automotive and aerospace customers since 1987.</p>
<p>We are hiring a production scheduler to manage our job board and coordinate deliveries with customers every week.</p>
<p>Request a quote by email and we will reply within two business days with pricing and lead times for your parts.</p>
</main></body></html>`;
let phoneOnSite = '(905) 555-0101';

const RESEARCH_OUTPUT = {
  companySummary: 'A family-owned CNC machine shop in Mississauga serving automotive and aerospace customers.',
  servicesOffered: ['CNC machining'],
  facts: [
    { claimType: 'COMPANY_INDUSTRY', statement: 'Acme is a CNC machine shop in Mississauga, Ontario.', evidence: [{ pageId: 'p1', quote: 'family-owned CNC machine shop in Mississauga, Ontario' }] },
    { claimType: 'PRODUCTS_SERVICES', statement: 'Customers request quotes by email.', evidence: [{ pageId: 'p1', quote: 'Request a quote by email and we will reply within two business days' }] },
    // Not on the page: grounding must drop it.
    { claimType: 'COMPANY_SIZE', statement: 'They have 300 employees.', evidence: [{ pageId: 'p1', quote: 'we employ 300 people' }] },
  ],
  signals: [{ type: 'HIRING', title: 'Hiring a production scheduler', summary: 'Scheduling role.', eventDate: null, confidence: 0.8, evidence: [{ pageId: 'p1', quote: 'We are hiring a production scheduler' }] }],
  icpAttributes: [{ attribute: 'Uses an ERP system', assessment: 'UNKNOWN', note: 'Not stated on the site.' }],
  relevance: [{ angle: 'Email quote intake', reasoning: 'Quotes requested by email suggest manual intake (an inference).', confidence: 0.6, evidence: [{ pageId: 'p1', quote: 'Request a quote by email and we will reply within two business days' }] }],
  talkingPoints: [],
  overallConfidence: 0.8,
};

const DEEP_OUTPUT = {
  businessModel: { description: 'Contract CNC machining for automotive and aerospace.', evidenceFactIds: ['r1'] },
  processes: [{ name: 'Quoting', description: 'Quotes arrive by email.', evidenceFactIds: ['r2'] }],
  opportunities: [
    { title: 'Quote intake to job board', problem: 'Email quotes are retyped', proposedAutomation: 'Form that creates a job card', evidenceFactIds: ['r2'], howToValidate: 'Ask how many quotes a week and who enters them', estimatedHours: { lowPerWeek: 2, highPerWeek: 5 }, assumptions: ['10–20 quotes a week'], integrationBarriers: ['Unknown job board software'], matchingSolutionSlugs: [], confidence: 0.6 },
    { title: 'Payroll automation', problem: 'Unknown', proposedAutomation: 'Payroll sync', evidenceFactIds: ['f42'], howToValidate: 'n/a', estimatedHours: null, assumptions: [], integrationBarriers: [], matchingSolutionSlugs: [], confidence: 0.9 },
  ],
  unknowns: [{ question: 'Which job-board or ERP software do you use?', whyItMatters: 'Decides the integration.' }],
  contactStrategy: { angle: 'Their open scheduler role', evidenceFactIds: ['r1'], channel: 'email', caution: 'Hiring is not intent to buy.' },
  overallFit: { score: 72, rationale: 'Clear manual intake step.' },
};

const fetchStub = vi.fn(async (input: string | URL | Request) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
  if (url.startsWith('https://acme-pipeline.test')) return new Response(HOME(phoneOnSite), { status: 200, headers: { 'content-type': 'text/html' } });
  if (url.startsWith('https://other-shop.test')) return new Response(HOME(phoneOnSite).replace(/Acme Machining/g, 'Other Shop'), { status: 200, headers: { 'content-type': 'text/html' } });
  return new Response('not found', { status: 404 });
});

async function drain() {
  for (let i = 0; i < 40; i++) {
    const ran = await processQueues('pipeline-test', ['screening', 'research', 'deep-research', 'refresh'], 4, { deadline: Date.now() + 60_000 });
    if (!ran) return;
  }
}

describe.skipIf(!reachable)('research funnel (database)', () => {
  const orgId = randomUUID();
  let clientId = '';
  let userId = '';
  const ids: Record<'fit' | 'poor' | 'capped', string> = { fit: '', poor: '', capped: '' };

  beforeAll(async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.stubGlobal('fetch', fetchStub);
    await db.organization.create({ data: { id: orgId, clerkOrgId: `test_${orgId}`, name: 'Funnel test', slug: `funnel-test-${orgId.slice(0, 8)}` } });
    const client = await db.client.create({ data: { organizationId: orgId, name: 'House', slug: 'house' } });
    clientId = client.id;
    const user = await db.user.create({ data: { clerkUserId: `test_${orgId}`, email: `funnel-${orgId.slice(0, 8)}@example.test` } });
    userId = user.id;
    await db.idealCustomerProfile.create({
      data: { organizationId: orgId, clientId, name: 'GTA manufacturers', industries: ['Machine shop'], industryKeywords: ['cnc', 'machining'], employeeMin: 10, employeeMax: 200, locations: ['Ontario'], preferredSignals: ['HIRING'] },
    });
    await updatePipelineSettings(orgId, null as never, { autoAnalyze: true, autoDeep: true, maxAnalysesPerDay: 1, deepThreshold: 50 });
    const access = systemAccess(orgId);
    const make = async (name: string, extra: Record<string, unknown>) => {
      const r = await createAccount(access, null, { clientId, name, source: 'MANUAL', ...extra } as never);
      if (r.status !== 'created') throw new Error('expected created');
      return r.accountId;
    };
    ids.fit = await make('Acme Machining', { industry: 'Machine shop', city: 'Mississauga', region: 'ON', employeeCount: 40, websiteUrl: 'https://acme-pipeline.test', phone: '(905) 555-0199' });
    ids.capped = await make('Other Shop', { industry: 'Machine shop', city: 'Brampton', region: 'ON', employeeCount: 35, websiteUrl: 'https://other-shop.test', phone: '(905) 555-0123' });
    ids.poor = await make('Corner Diner', { industry: 'Restaurant', city: 'Ottawa', region: 'ON' });
    for (const id of [ids.fit, ids.capped]) {
      await db.signal.create({ data: { organizationId: orgId, clientId, accountId: id, type: 'HIRING', title: 'Hiring a scheduler', source: 'MANUAL', evidenceStatus: 'UNVERIFIED' } });
    }
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (reachable) {
      await db.organization.delete({ where: { id: orgId } }).catch(() => undefined);
      await db.user.deleteMany({ where: { clerkUserId: `test_${orgId}` } });
    }
    await db.$disconnect();
  });

  it('screens every record cheaply and advances only the promising ones, within the daily cap', async () => {
    expect(await enqueuePendingScreening(orgId)).toBe(1); // one batch for all three
    await drain();

    const load = (id: string) => db.account.findUniqueOrThrow({ where: { id } });
    const fit = await load(ids.fit);
    const capped = await load(ids.capped);
    const poor = await load(ids.poor);
    // The poor fit is kept, not deleted, with its reasons.
    expect(poor.pipelineStage).toBe('SCREENED_OUT');
    expect(poor.deletedAt).toBeNull();
    const poorReasons = (poor.screeningReasons as { reasons: Array<{ label: string }> }).reasons.map((r) => r.label);
    expect(poorReasons).toContain('No website: little to research');
    expect(poor.screeningScore!).toBeLessThan(55);

    // Both machine shops qualify; the daily cap of one lets only one go on to paid analysis.
    expect(fit.screeningScore!).toBeGreaterThanOrEqual(55);
    expect(capped.screeningScore!).toBeGreaterThanOrEqual(55);
    const analysed = [fit, capped].filter((a) => a.researchVersion > 0);
    expect(analysed).toHaveLength(1);
    expect([fit, capped].filter((a) => a.pipelineStage === 'QUALIFIED')).toHaveLength(1);
    expect(await db.job.count({ where: { organizationId: orgId, type: 'RESEARCH' } })).toBe(1);
    expect(await db.job.count({ where: { organizationId: orgId, type: 'RESEARCH', entityId: ids.poor } })).toBe(0);
  });

  it('keeps verified facts, hypotheses and unknowns apart, and deep research cites only real facts', async () => {
    const analysedId = (await db.account.findFirstOrThrow({ where: { clientId, researchVersion: { gt: 0 } } })).id;
    const account = await db.account.findUniqueOrThrow({ where: { id: analysedId } });
    expect(account.pipelineStage).toBe('DEEP_RESEARCHED');
    expect(modelCalls).toEqual(['research', 'deep_research']);

    const analysis = await db.researchVersion.findFirstOrThrow({ where: { accountId: analysedId, stage: 'ANALYSIS' } });
    const facts = analysis.facts as Array<{ id: string; statement: string; citations: Array<{ url: string; quote: string }> }>;
    // The fact whose quote isn't on the page was dropped by grounding; the rest cite the page.
    expect(facts.map((f) => f.id)).toEqual(['r1', 'r2']);
    expect(facts.every((f) => f.citations.length && f.citations[0]!.url.startsWith('https://'))).toBe(true);
    expect((analysis.hypotheses as Array<{ kind: string }>).every((h) => h.kind === 'AI_HYPOTHESIS')).toBe(true);
    expect(analysis.unknowns).toEqual([{ question: 'Uses an ERP system', why: 'Not stated on the site.' }]);
    expect(analysis.trigger).toBe('AUTO');

    const deep = await db.researchVersion.findFirstOrThrow({ where: { accountId: analysedId, stage: 'DEEP' } });
    const h = deep.hypotheses as { opportunities: Array<{ title: string; evidenceFactIds: string[] }>; rejected: string[]; roi: { kind: string } | null; contactStrategy: unknown };
    expect(h.opportunities.map((o) => o.title)).toEqual(['Quote intake to job board']);
    expect(h.rejected).toEqual(['opportunity: Payroll automation']);
    expect(h.roi?.kind).toBe('SCENARIO');
    expect(h.contactStrategy).not.toBeNull();
    expect(deep.model).toBe('claude-opus-5-5');

    // Research spend is tracked per company.
    expect(account.researchCostMillicents).toBe((7 + 20) * 1000);
  });

  it('lets a person promote past the cap, but never past the budget', async () => {
    const waiting = await db.account.findFirstOrThrow({ where: { clientId, pipelineStage: 'QUALIFIED' } });
    await setStage(systemAccess(orgId), userId, waiting.id, 'QUALIFIED', 'Strong referral');
    const job = await queueAnalysis(orgId, waiting.id, 'MANUAL');
    expect(job).not.toBeNull();
    expect((await db.account.findUniqueOrThrow({ where: { id: waiting.id } })).stagePinned).toBe(true);
    await db.job.update({ where: { id: job!.id }, data: { status: 'CANCELLED' } });

    // Over the analysis budget: refused up front, with an alert for administrators.
    await updatePipelineSettings(orgId, userId, { analysisBudgetCents: 1 });
    await db.usageRecord.create({ data: { organizationId: orgId, provider: 'anthropic', type: 'AI_RESEARCH', costMillicents: 5_000 } });
    await expect(queueAnalysis(orgId, ids.poor, 'MANUAL')).rejects.toThrow(/website|budget/);
    await db.account.update({ where: { id: ids.poor }, data: { websiteUrl: 'https://other-shop.test' } });
    await expect(queueAnalysis(orgId, ids.poor, 'MANUAL')).rejects.toThrow(/budget is used up/);
    const { assertCategoryBudget } = await import('../budgets');
    await expect(assertCategoryBudget(orgId, 'analysis')).rejects.toThrow(/AI analysis budget reached/);
    expect(await db.systemAlert.count({ where: { organizationId: orgId, kind: 'BUDGET', severity: 'critical' } })).toBe(1);
    await db.account.update({ where: { id: ids.poor }, data: { websiteUrl: null } });
  });

  it('refreshes by fingerprint and only overwrites what came from the website', async () => {
    // First read of the site records a fingerprint and fills empty fields from it.
    const first = await refreshAccount(orgId, ids.fit);
    expect(first.status).toBe('UPDATED');
    let acme = await db.account.findUniqueOrThrow({ where: { id: ids.fit } });
    expect(acme.postalCode).toBe('L5A 1W2');
    // The phone a person entered differs from the site's and is kept.
    expect(acme.phone).toBe('(905) 555-0199');
    expect(first.conflicts).toContain('phone');

    // Nothing changed: no update beyond the observation.
    expect((await refreshAccount(orgId, ids.fit)).status).toBe('UNCHANGED');

    // The site changes its postal code (a website-sourced field): updated, history kept.
    phoneOnSite = '(905) 555-0777';
    const changedHome = HOME(phoneOnSite).replace('L5A 1W2', 'L5A 9Z9');
    fetchStub.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
      return new Response(changedHome, { status: 200, headers: { 'content-type': 'text/html' } });
    });
    const second = await refreshAccount(orgId, ids.fit);
    expect(second.changed).toContain('postalCode');
    acme = await db.account.findUniqueOrThrow({ where: { id: ids.fit } });
    expect(acme.postalCode).toBe('L5A 9Z9');
    expect(acme.phone).toBe('(905) 555-0199');
    const history = await db.dataProvenance.findMany({ where: { accountId: ids.fit, field: 'postalCode' }, orderBy: { retrievedAt: 'asc' } });
    expect(history.map((h) => [h.value, h.isCurrent])).toEqual([['L5A 1W2', false], ['L5A 9Z9', true]]);
    // A postal-code change is not material: no new paid analysis.
    expect(second.reanalysis).toBe(false);
  });

  it('reports stored, active and deeply researched records separately', async () => {
    const m = await funnelMetrics(systemAccess(orgId));
    expect(m.stored).toBe(3);
    expect(m.thisMonth).toMatchObject({ discovered: 3, analysed: 1, deep: 1 });
    expect(m.stages.SCREENED_OUT + m.stages.QUALIFIED + m.stages.DEEP_RESEARCHED).toBe(3);
    expect(m.researchCost.perAnalysisMillicents).toBe(7_000);
  });
});
