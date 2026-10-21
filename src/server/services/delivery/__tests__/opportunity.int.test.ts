import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';

/**
 * Phase E acceptance on a real Postgres: a researched company → reviewed
 * opportunity → personalised demo on synthetic data → approved proposal →
 * customer authorisation → a customer application deployed through
 * Studio's gate. Deep research itself is represented by its stored result.
 */

vi.mock('node:dns/promises', () => ({ lookup: async () => [{ address: '93.184.216.34', family: 4 }] }));
process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');

const { dbTestsAllowed } = await import('@/test/db');
const { db } = await import('@/lib/db');
const reachable = dbTestsAllowed() && await db.$queryRaw`SELECT 1`.then(() => true).catch(() => false);

const opps = await import('../opportunities');
const projects = await import('../projects');
const studio = await import('@/server/studio/applications');
const { acceptProposal } = await import('@/server/services/proposal');
const { processQueues } = await import('@/server/services/job-runner');
const { systemAccess } = await import('@/server/access/scope');

async function drain() {
  for (let i = 0; i < 50; i++) {
    if (!(await processQueues('delivery-test', ['customer-workflows'], 4, { deadline: Date.now() + 30_000 }))) return;
  }
}

const ASSESSMENT = {
  tasksPerWeek: { value: 25, source: 'stated_by_prospect' },
  minutesPerTask: { value: 20, source: 'stated_by_prospect' },
  automatableShare: { value: { low: 0.4, high: 0.7 }, source: 'our_assumption' },
  hourlyCostCents: { value: 4500, source: 'stated_by_prospect' },
  errorRatePct: { value: 4, source: 'stated_by_prospect' },
  costPerErrorCents: { value: 15000, source: 'stated_by_prospect' },
  dataAvailability: 'digital_unstructured',
  integrationComplexity: 'low',
  risks: ['Claims arrive by email in free text'],
};

describe.skipIf(!reachable)('opportunity to application (database)', () => {
  const orgId = randomUUID();
  const staff = systemAccess(orgId);
  let userId = '';
  let accountId = '';
  let claimsOpp = '';
  let customOpp = '';
  let proposalId = '';

  beforeAll(async () => {
    await db.organization.create({ data: { id: orgId, clerkOrgId: `test_${orgId}`, name: 'Delivery test', slug: `delivery-${orgId.slice(0, 8)}`, dayRateCents: 120000, discoveryFeeCents: 0, supportMonthlyCents: 30000 } });
    userId = (await db.user.create({ data: { clerkUserId: `test_${orgId}_u`, email: `u-${orgId.slice(0, 8)}@example.test` } })).id;
    const agency = await db.client.create({ data: { organizationId: orgId, name: 'Own pipeline', slug: `own-${orgId.slice(0, 6)}` } });
    const account = await db.account.create({ data: { organizationId: orgId, clientId: agency.id, name: 'Synthetic Hamilton Fabricators', domain: `synthetic-fab-${orgId.slice(0, 6)}.test`, industry: 'Manufacturing', city: 'Hamilton' } });
    accountId = account.id;
    // What deep research stored: two opportunities citing verified facts.
    await db.researchVersion.create({
      data: {
        organizationId: orgId, clientId: agency.id, accountId, version: 1, stage: 'DEEP', trigger: 'MANUAL',
        facts: { basis: [{ id: 'f1', statement: 'The company lists a warranty and quality claims email address on its contact page.' }, { id: 'f2', statement: 'The company is hiring a quality coordinator.' }] },
        hypotheses: {
          opportunities: [
            {
              title: 'Quality claims tracking and escalation', problem: 'Customer quality claims arrive by email and are tracked by hand, so large claims reach the quality manager late.',
              proposedAutomation: 'Log each claim, escalate large or severe ones to the quality manager for a credit decision, and report weekly claim totals for warranty analysis.',
              evidenceFactIds: ['f1', 'f2'], howToValidate: 'Ask how many claims arrive each week and who decides credits.', integrationBarriers: [], confidence: 0.7,
              estimatedHours: { lowPerWeek: 3, highPerWeek: 8 },
            },
            {
              title: 'Steel price forecasting model', problem: 'Purchasing guesses steel prices.', proposedAutomation: 'Train a neural forecasting model on commodity markets.',
              evidenceFactIds: ['f2'], howToValidate: 'Ask about purchasing volumes.', integrationBarriers: ['No market data feed', 'ERP has no API'], confidence: 0.3, estimatedHours: null,
            },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    if (reachable) {
      await db.organization.delete({ where: { id: orgId } }).catch(() => undefined);
      await db.user.deleteMany({ where: { clerkUserId: { startsWith: `test_${orgId}` } } });
    }
    await db.$disconnect();
  });

  it('turns research into opportunities, matched and classified with reasons and estimates', async () => {
    const res = await opps.syncFromResearch(staff, accountId);
    expect(res).toMatchObject({ created: 2, total: 2 });
    expect((await opps.syncFromResearch(staff, accountId)).created).toBe(0); // idempotent
    const list = await opps.listOpportunities(staff, { accountId });
    const claims = list.items.find((o) => o.title.startsWith('Quality claims'))!;
    const custom = list.items.find((o) => o.title.startsWith('Steel'))!;
    claimsOpp = claims.id;
    customOpp = custom.id;
    const tpl = await db.appTemplate.findFirstOrThrow({ where: { organizationId: null, slug: 'manufacturing-quality-claims' } });
    expect(claims.templateId).toBe(tpl.id);
    expect(['EXACT', 'CONFIGURATION']).toContain(claims.reusability);
    expect(claims.estimatedBuildHours).toBeLessThan(claims.fromScratchHours!);
    const reasons = (claims.reusabilityReasons as { reasons: string[] }).reasons;
    expect(reasons[0]).toMatch(/^Best match "Quality claims tracker" scores/);
    expect(custom.reusability).toBe('CUSTOM');
    expect(custom.templateId).toBeNull();
    // Research's hours seeded the assessment, every input marked unconfirmed.
    expect(JSON.stringify(claims.assessment)).toMatch(/research_estimate|our_assumption/);
  });

  it('needs an assessment before qualifying, and projects value as a labelled scenario', async () => {
    await db.opportunity.update({ where: { id: claimsOpp }, data: { projection: undefined } });
    await expect(opps.review(staff, userId, claimsOpp, 'QUALIFIED', null)).rejects.toThrow(/Assess it first/);
    const assessed = await opps.assess(staff, claimsOpp, ASSESSMENT);
    const p = assessed.projection as { kind: string; low: { monthlyValueCents: number; paybackMonths: number | null }; high: { monthlyValueCents: number }; note: string };
    expect(p.kind).toBe('PROJECTED');
    expect(p.low.monthlyValueCents).toBeLessThan(p.high.monthlyValueCents);
    expect(p.note).toMatch(/automatableShare/); // the unconfirmed input is named
    await opps.review(staff, userId, claimsOpp, 'QUALIFIED', 'Fits: claims volume confirmed on the call.');
    // A custom build can't get a template demo.
    await opps.assess(staff, customOpp, ASSESSMENT);
    await opps.review(staff, userId, customOpp, 'QUALIFIED', 'Keep for later');
    await expect(opps.buildDemo(staff, userId, customOpp)).rejects.toThrow(/custom build/);
  });

  it('builds a personalised demo in the demo sandbox, on synthetic records only', async () => {
    const { applicationId } = await opps.buildDemo(staff, userId, claimsOpp);
    await drain();
    const app = await db.clientApplication.findUniqueOrThrow({ where: { id: applicationId }, include: { client: true } });
    expect(app.client.kind).toBe('DEMO');
    const config = await db.appConfigVersion.findFirstOrThrow({ where: { applicationId } });
    expect((config.manifest as { branding: { displayName: string } }).branding.displayName).toBe('Synthetic Hamilton Fabricators (demo)');
    const runs = await db.workflowExecution.findMany({ where: { applicationId } });
    expect(runs.length).toBeGreaterThanOrEqual(5);
    expect(runs.every((r) => r.isTest)).toBe(true);
    const records = await db.appRecord.findMany({ where: { applicationId, collection: 'claims' } });
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((r) => r.isTest && /Synthetic/.test(String((r.data as { customer: string }).customer)))).toBe(true);
    expect((await db.opportunity.findUniqueOrThrow({ where: { id: claimsOpp } })).status).toBe('DEMO');
  });

  it('drafts a priced proposal that needs internal approval before the customer can accept', async () => {
    const proposal = await opps.draftProposal(staff, userId, claimsOpp);
    proposalId = proposal.id;
    const opp = await db.opportunity.findUniqueOrThrow({ where: { id: claimsOpp } });
    expect(proposal.status).toBe('DRAFT');
    // Pricing is arithmetic: hours × (day rate ÷ 8), plus the template's monthly price.
    expect(proposal.totalCents).toBe(opp.estimatedBuildHours! * 15000);
    expect(proposal.recurringMonthlyCents).toBe(45000);
    expect((proposal.roiSummary as { kind: string; label: string })).toMatchObject({ kind: 'PROJECTED', label: 'Projected value (scenario)' });

    await expect(opps.recordAcceptance(staff, userId, proposalId, { signedBy: 'Synthetic Buyer', evidence: 'Signed SOW received' })).rejects.toThrow(/Approve the proposal internally/);
    expect(await acceptProposal({ shareToken: proposal.shareToken, signatureName: 'Synthetic Buyer', ipAddress: null })).toEqual({ notApproved: true });
    await expect(opps.convertToCustomer(staff, userId, claimsOpp)).rejects.toThrow(/not accepted an approved proposal/);

    await opps.approveProposal(staff, userId, proposalId);
    const accepted = await opps.recordAcceptance(staff, userId, proposalId, { signedBy: 'Synthetic Buyer', evidence: 'Signed SOW received by email (synthetic)' });
    expect(accepted.status).toBe('ACCEPTED');
  });

  it('creates the customer, project and draft application, and deploys only through Studio\'s gate', async () => {
    const res = await opps.convertToCustomer(staff, userId, claimsOpp);
    expect(res.alreadyConverted).toBe(false);
    expect((await opps.convertToCustomer(staff, userId, claimsOpp)).alreadyConverted).toBe(true);
    const client = await db.client.findUniqueOrThrow({ where: { id: res.clientId } });
    expect([client.kind, client.name]).toEqual(['CUSTOMER', 'Synthetic Hamilton Fabricators']);
    const project = await db.deliveryProject.findUniqueOrThrow({ where: { id: res.projectId! } });
    expect(project.estimatedHours).toBe((await db.opportunity.findUniqueOrThrow({ where: { id: claimsOpp } })).estimatedBuildHours);
    const appId = res.applicationId!;
    const app = await db.clientApplication.findUniqueOrThrow({ where: { id: appId } });
    expect([app.status, app.clientId, app.activeConfigVersionId]).toEqual(['DRAFT', client.id, null]);

    // Not deployable until every workflow passes; then an admin deploys it.
    const config = await db.appConfigVersion.findFirstOrThrow({ where: { applicationId: appId } });
    await expect(studio.deployConfig(staff, userId, appId, config.id, 'PRODUCTION')).rejects.toThrow(/passing test/);
    for (const wf of ['claim_intake', 'weekly_report']) await studio.startExecution(staff, userId, appId, wf, null, { test: true });
    await drain();
    for (const e of await db.workflowExecution.findMany({ where: { applicationId: appId, status: 'WAITING_APPROVAL' } })) await studio.decideApproval(staff, userId, e.id, 'APPROVE', null);
    await drain();
    await studio.deployConfig(staff, userId, appId, config.id, 'PRODUCTION');
    expect((await db.clientApplication.findUniqueOrThrow({ where: { id: appId } })).status).toBe('ACTIVE');

    // The customer's first production run lands in their own client, not the demo sandbox.
    await studio.startExecution(staff, userId, appId, 'claim_intake', { customer: 'Synthetic Auto Buyer', part_number: 'P-1', defect: 'Burr', quantity: 2, severity: 'low' });
    await drain();
    const live = await db.appRecord.findMany({ where: { applicationId: appId, isTest: false } });
    expect(live).toHaveLength(1);
    expect(live[0]!.clientId).toBe(client.id);
    expect((await db.opportunity.findUniqueOrThrow({ where: { id: claimsOpp } })).status).toBe('WON');
  });

  it('tracks estimate against actual, and calibrates later estimates from closed projects', async () => {
    const project = (await projects.listProjects(staff))[0]!;
    await projects.logTime(staff, userId, { projectId: project.id, category: 'configuration', minutes: 600, workDate: '2026-10-20' });
    await projects.logTime(staff, userId, { projectId: project.id, category: 'testing', minutes: 300, workDate: '2026-10-21' });
    const detail = await projects.getProject(staff, project.id);
    expect(detail.actualHours).toBe(15);
    expect(detail.varianceHours).toBe(15 - project.estimatedHours);
    expect(detail.actualCostCents).toBe(15 * 6000);
    await projects.setProjectStatus(staff, project.id, 'CLOSED');
    await expect(projects.logTime(staff, userId, { projectId: project.id, category: 'build', minutes: 60, workDate: '2026-10-22' })).rejects.toThrow(/closed/);

    // Two more finished projects on the same template, each taking twice the estimate.
    for (let i = 0; i < 2; i++) {
      const p = await db.deliveryProject.create({ data: { organizationId: orgId, clientId: project.clientId, templateId: project.templateId, name: `Past ${i}`, estimatedHours: 10, status: 'CLOSED', closedAt: new Date() } });
      await db.projectTimeEntry.create({ data: { projectId: p.id, category: 'build', minutes: 1200, workDate: new Date('2026-09-01') } });
    }
    const fresh = await opps.createOpportunity(staff, userId, { accountId, title: 'Warranty claims reporting', problem: 'Quality claims and warranty analysis are compiled by hand each week.', proposedAutomation: 'Track quality claims and produce automated warranty analysis reports.' });
    expect(JSON.stringify(fresh.estimateBasis)).toMatch(/Scaled by .* over 3 finished projects/);
  });
});
