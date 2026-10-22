import { randomBytes } from 'node:crypto';
import { addDays } from 'date-fns';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { assertClientAccess, clientFilter, systemAccess, type AccessContext } from '@/server/access/scope';
import { DomainError, NotFoundError } from '@/server/errors';
import { logActivity } from '@/server/services/activity';
import { nextProposalNumber, PHASE_SHAPE, type LineItem, type ScopePhase } from '@/server/services/proposal';
import { createApplication, ensureBuiltinTemplates, startExecution } from '@/server/studio/applications';
import type { Manifest } from '@/server/studio/manifest';
import { assessmentSchema, projectValue, type Projection } from './assessment';
import { bestMatch, classify, estimateEffort, type Calibration, type CatalogueTemplate, type Reusability } from './matching';

/**
 * From a researched company to a running customer application, with a
 * person deciding at every consequential step:
 *
 *   deep research → opportunities (PROPOSED)
 *     → matched to a template, classified for reuse, effort estimated
 *     → assessed (inputs with sources) → projected value (a scenario)
 *     → reviewed by a person (QUALIFIED or REJECTED)
 *     → personalised demo on synthetic data (DEMO)
 *     → proposal drafted from the rate card, approved internally, sent (PROPOSAL)
 *     → customer authorisation recorded (share-link signature or evidence)
 *     → customer, delivery project and draft application created (WON)
 *     → the application reaches production only through Studio's own gate.
 */

// ---------------------------------------------------------------------------
// Catalogue and calibration
// ---------------------------------------------------------------------------

export async function catalogue(organizationId: string): Promise<CatalogueTemplate[]> {
  await ensureBuiltinTemplates();
  const rows = await db.appTemplate.findMany({
    where: { OR: [{ organizationId: null }, { organizationId }], archivedAt: null },
    include: { versions: { where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, manifest: true } } },
  });
  return rows.map((t) => ({
    id: t.id, slug: t.slug, name: t.name, industry: t.industry, description: t.description, useCases: t.useCases,
    buildHoursEstimate: t.buildHoursEstimate, latestVersionId: t.versions[0]?.id ?? null,
    integrations: ((t.versions[0]?.manifest as unknown as Manifest | undefined)?.integrations ?? []).length,
  }));
}

/** How finished projects on a template compared with their estimates. */
export async function calibrationFor(organizationId: string, templateId: string): Promise<Calibration | null> {
  const projects = await db.deliveryProject.findMany({
    where: { organizationId, templateId, status: 'CLOSED', estimatedHours: { gt: 0 } },
    select: { estimatedHours: true, timeEntries: { select: { minutes: true } } },
    take: 50, orderBy: { closedAt: 'desc' },
  });
  if (!projects.length) return null;
  const ratios = projects.map((p) => p.timeEntries.reduce((n, t) => n + t.minutes, 0) / 60 / p.estimatedHours);
  return { projects: projects.length, ratio: Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100) / 100 };
}

// ---------------------------------------------------------------------------
// Creating opportunities
// ---------------------------------------------------------------------------

async function loadAccount(access: AccessContext, accountId: string) {
  const account = await db.account.findFirst({ where: { id: accountId, ...clientFilter(access), deletedAt: null } });
  if (!account) throw new NotFoundError('Account');
  return account;
}

async function loadOpportunity(access: AccessContext, id: string) {
  const opp = await db.opportunity.findFirst({ where: { id, ...clientFilter(access) } });
  if (!opp) throw new NotFoundError('Opportunity');
  return opp;
}

interface DeepOpportunity {
  title: string; problem: string; proposedAutomation: string; evidenceFactIds: string[]; howToValidate: string;
  integrationBarriers: string[]; confidence: number;
  estimatedHours: { lowPerWeek: number; highPerWeek: number } | null;
}

/** Turns the latest deep research's opportunities into reviewable records. Idempotent per research version. */
export async function syncFromResearch(access: AccessContext, accountId: string) {
  const account = await loadAccount(access, accountId);
  const version = await db.researchVersion.findFirst({ where: { accountId, stage: 'DEEP' }, orderBy: { version: 'desc' } });
  if (!version) throw new DomainError('This account has no deep research yet.');
  const found = ((version.hypotheses as { opportunities?: DeepOpportunity[] } | null)?.opportunities ?? []).filter((o) => o.title && o.evidenceFactIds?.length);
  let created = 0;
  for (const o of found) {
    const res = await db.opportunity.createMany({
      data: [{
        organizationId: account.organizationId, clientId: account.clientId, accountId, source: 'DEEP_RESEARCH', researchVersionId: version.id,
        title: o.title.slice(0, 200), problem: o.problem, proposedAutomation: o.proposedAutomation, evidenceFactIds: o.evidenceFactIds,
        howToValidate: o.howToValidate || null, integrationBarriers: o.integrationBarriers ?? [], confidence: o.confidence,
        // The research's hours are an estimate; they seed the assessment and are labelled as such.
        assessment: o.estimatedHours ? seededAssessment(o.estimatedHours) as unknown as Prisma.InputJsonValue : undefined,
      }],
      skipDuplicates: true,
    });
    created += res.count;
  }
  const opps = await db.opportunity.findMany({ where: { accountId, researchVersionId: version.id } });
  for (const o of opps) if (!o.templateId && !o.matchOverridden) await autoMatch(o.id);
  return { created, total: opps.length, researchVersion: version.version };
}

/** Research gives hours per week; express them as an assessment whose every input is marked unconfirmed. */
function seededAssessment(h: { lowPerWeek: number; highPerWeek: number }) {
  const high = Math.max(h.highPerWeek, h.lowPerWeek, 0.5);
  return {
    tasksPerWeek: { value: 60, source: 'our_assumption' },
    minutesPerTask: { value: Math.round((high * 60) / 60), source: 'research_estimate' },
    automatableShare: { value: { low: Math.min(1, h.lowPerWeek / high) * 0.7, high: 0.7 }, source: 'our_assumption' },
    hourlyCostCents: { value: 4375, source: 'our_assumption' },
    risks: [],
    notes: `Seeded from research: ${h.lowPerWeek}–${h.highPerWeek} hours a week. Confirm with the prospect.`,
  };
}

export const manualOpportunitySchema = z.object({
  accountId: z.string().uuid(),
  title: z.string().trim().min(3).max(200),
  problem: z.string().trim().min(3).max(4000),
  proposedAutomation: z.string().trim().min(3).max(4000),
  integrationBarriers: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
});

export async function createOpportunity(access: AccessContext, userId: string | null, raw: z.input<typeof manualOpportunitySchema>) {
  const input = manualOpportunitySchema.parse(raw);
  const account = await loadAccount(access, input.accountId);
  const opp = await db.opportunity.create({
    data: { organizationId: account.organizationId, clientId: account.clientId, accountId: account.id, source: 'MANUAL', title: input.title, problem: input.problem, proposedAutomation: input.proposedAutomation, integrationBarriers: input.integrationBarriers },
  });
  await logActivity({ organizationId: account.organizationId, accountId: account.id, userId, type: 'SYSTEM', title: `Opportunity added: ${opp.title}` });
  return autoMatch(opp.id);
}

// ---------------------------------------------------------------------------
// Matching, assessment, review
// ---------------------------------------------------------------------------

/** Re-runs matching unless a person has overridden it. */
export async function autoMatch(opportunityId: string) {
  const opp = await db.opportunity.findUniqueOrThrow({ where: { id: opportunityId }, include: { account: { select: { industry: true } } } });
  if (opp.matchOverridden) return opp;
  const cat = await catalogue(opp.organizationId);
  const match = bestMatch({ ...opp, industry: opp.account.industry }, cat);
  const { reusability, reasons } = classify(match, opp.integrationBarriers);
  const template = reusability === 'CUSTOM' ? null : match?.template ?? null;
  const effort = estimateEffort(reusability, template, template ? await calibrationFor(opp.organizationId, template.id) : null);
  return db.opportunity.update({
    where: { id: opp.id },
    data: {
      templateId: template?.id ?? null, templateVersionId: template?.latestVersionId ?? null, matchScore: match?.score ?? 0,
      reusability, reusabilityReasons: { reasons, matchedTerms: match?.matchedTerms ?? [], automatic: true } as Prisma.InputJsonValue,
      estimatedBuildHours: effort.estimatedBuildHours, fromScratchHours: effort.fromScratchHours,
      estimateBasis: { basis: effort.basis, hoursSaved: effort.hoursSaved, isEstimate: true } as Prisma.InputJsonValue,
    },
  });
}

export const overrideSchema = z.object({
  templateId: z.string().uuid().nullable(),
  reusability: z.enum(['EXACT', 'CONFIGURATION', 'MODERATE', 'CUSTOM', 'NOT_FEASIBLE']),
  note: z.string().trim().min(3).max(1000),
});

/** A person's call on the match and reuse class; kept until they clear it. */
export async function overrideMatch(access: AccessContext, userId: string, id: string, raw: z.input<typeof overrideSchema>) {
  const input = overrideSchema.parse(raw);
  const opp = await loadOpportunity(access, id);
  const cat = await catalogue(opp.organizationId);
  const template = input.templateId ? cat.find((t) => t.id === input.templateId) : null;
  if (input.templateId && !template) throw new NotFoundError('Template');
  if (['EXACT', 'CONFIGURATION', 'MODERATE'].includes(input.reusability) && !template) throw new DomainError('Reusing a template needs a template.');
  const effort = input.reusability === 'NOT_FEASIBLE' ? null : estimateEffort(input.reusability, template ?? null, template ? await calibrationFor(opp.organizationId, template.id) : null);
  return db.opportunity.update({
    where: { id: opp.id },
    data: {
      matchOverridden: true, templateId: template?.id ?? null, templateVersionId: template?.latestVersionId ?? null, reusability: input.reusability,
      reusabilityReasons: { reasons: [`Set by a person: ${input.note}`], automatic: false, by: userId } as Prisma.InputJsonValue,
      estimatedBuildHours: effort?.estimatedBuildHours ?? null, fromScratchHours: effort?.fromScratchHours ?? null,
      estimateBasis: effort ? { basis: effort.basis, hoursSaved: effort.hoursSaved, isEstimate: true } as Prisma.InputJsonValue : Prisma.DbNull,
      ...(input.reusability === 'NOT_FEASIBLE' && ['PROPOSED', 'QUALIFIED'].includes(opp.status) ? { status: 'REJECTED', reviewNote: input.note, reviewedById: userId, reviewedAt: new Date() } : {}),
    },
  });
}

export async function clearOverride(access: AccessContext, id: string) {
  const opp = await loadOpportunity(access, id);
  await db.opportunity.update({ where: { id: opp.id }, data: { matchOverridden: false } });
  return autoMatch(opp.id);
}

async function priceFor(organizationId: string, opp: { estimatedBuildHours: number | null; templateId: string | null }) {
  const [org, template] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    opp.templateId ? db.appTemplate.findUnique({ where: { id: opp.templateId } }) : null,
  ]);
  const hourly = Math.round(org.dayRateCents / 8);
  return {
    org, template, hourlyCents: hourly,
    setupCents: (opp.estimatedBuildHours ?? 0) * hourly + org.discoveryFeeCents,
    monthlyCents: template?.recommendedMonthlyCents ?? org.supportMonthlyCents,
  };
}

/** Records the assessment inputs and recomputes the projection against the current price. */
export async function assess(access: AccessContext, id: string, raw: unknown) {
  const opp = await loadOpportunity(access, id);
  const assessment = assessmentSchema.parse(raw);
  const price = await priceFor(opp.organizationId, opp);
  const projection = projectValue(assessment, { setupCents: price.setupCents, monthlyCents: price.monthlyCents });
  return db.opportunity.update({ where: { id: opp.id }, data: { assessment: assessment as unknown as Prisma.InputJsonValue, projection: projection as unknown as Prisma.InputJsonValue } });
}

export async function review(access: AccessContext, userId: string, id: string, decision: 'QUALIFIED' | 'REJECTED', note: string | null) {
  const opp = await loadOpportunity(access, id);
  if (!['PROPOSED', 'QUALIFIED', 'REJECTED'].includes(opp.status)) throw new DomainError(`This opportunity is already at ${opp.status.toLowerCase()}.`);
  if (decision === 'QUALIFIED') {
    if (opp.reusability === 'NOT_FEASIBLE') throw new DomainError('It is marked not feasible; change that first.');
    if (!opp.projection) throw new DomainError('Assess it first: qualifying needs the value inputs and their sources.');
  }
  const updated = await db.opportunity.update({ where: { id: opp.id }, data: { status: decision, reviewedById: userId, reviewedAt: new Date(), reviewNote: note } });
  await logActivity({ organizationId: opp.organizationId, accountId: opp.accountId, userId, type: 'SYSTEM', title: `Opportunity ${decision === 'QUALIFIED' ? 'qualified' : 'rejected'}: ${opp.title}`, body: note });
  return updated;
}

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

/** The workspace's sandbox for demos: a client of kind DEMO holding only synthetic data. */
export async function ensureDemoClient(organizationId: string) {
  const existing = await db.client.findFirst({ where: { organizationId, kind: 'DEMO', archivedAt: null } });
  if (existing) return existing;
  return db.client.create({
    data: { organizationId, name: 'Demo sandbox (synthetic data)', slug: `demo-sandbox-${randomBytes(3).toString('hex')}`, kind: 'DEMO', notes: 'Holds personalised demo applications. Synthetic records only; never prospected or billed.' },
  });
}

/** Synthetic variations of a workflow's test input; text stays obviously synthetic. */
export function syntheticInputs(base: Record<string, unknown>, count: number): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_, k) => Object.fromEntries(Object.entries(base).map(([key, v]) => {
    if (typeof v === 'number') return [key, Math.max(1, Math.round(v * (0.4 + 0.35 * k)))];
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return [key, new Date(new Date(v).getTime() + k * 86_400_000).toISOString().slice(0, 10)];
    if (typeof v === 'string' && /synthetic/i.test(v)) return [key, k ? `${v} ${k + 1}` : v];
    return [key, v];
  })));
}

const DEMO_RUNS_PER_WORKFLOW = 4;

/**
 * A personalised demo for a qualified opportunity: the matched template as a
 * sandbox application on the demo client, branded with the prospect's public
 * business name, and test runs on synthetic records. Production connections
 * don't exist there, so nothing reaches a real system.
 */
export async function buildDemo(access: AccessContext, userId: string | null, id: string) {
  const opp = await loadOpportunity(access, id);
  if (!['QUALIFIED', 'DEMO'].includes(opp.status)) throw new DomainError('Only a qualified opportunity gets a demo.');
  if (!opp.templateVersionId || !opp.reusability || ['CUSTOM', 'NOT_FEASIBLE'].includes(opp.reusability)) throw new DomainError('A demo needs a matching template; this one would be a custom build.');
  const account = await db.account.findUniqueOrThrow({ where: { id: opp.accountId } });
  const demoClient = await ensureDemoClient(opp.organizationId);
  const staff = systemAccess(opp.organizationId);
  const { app, config } = await createApplication(staff, userId, {
    clientId: demoClient.id, templateVersionId: opp.templateVersionId,
    name: `${account.name}: ${opp.title}`.slice(0, 120),
    overrides: { branding: { displayName: `${account.name} (demo)`.slice(0, 120) } },
  });
  if (config.status !== 'VALID') throw new DomainError('The template did not produce a valid demo configuration.');
  const manifest = config.manifest as unknown as Manifest;
  let runs = 0;
  for (const wf of manifest.workflows) {
    if (wf.trigger.type === 'record_created') continue; // started by the records the others create
    const inputs = wf.trigger.type === 'schedule' ? [wf.testInput ?? {}] : syntheticInputs((wf.testInput ?? {}) as Record<string, unknown>, DEMO_RUNS_PER_WORKFLOW);
    for (const input of inputs) {
      await startExecution(staff, userId, app.id, wf.key, input, { test: true, configVersionId: config.id });
      runs++;
    }
  }
  const demo = await db.opportunityDemo.create({ data: { organizationId: opp.organizationId, opportunityId: opp.id, applicationId: app.id, configVersionId: config.id, sampleRuns: runs, createdById: userId } });
  await db.opportunity.update({ where: { id: opp.id }, data: { status: 'DEMO' } });
  await logActivity({ organizationId: opp.organizationId, accountId: opp.accountId, userId, type: 'SYSTEM', title: `Demo built: ${opp.title}`, body: `${runs} synthetic runs on ${manifest.app.name}.` });
  return { demo, applicationId: app.id };
}

// ---------------------------------------------------------------------------
// Proposal and authorisation
// ---------------------------------------------------------------------------

/** A proposal priced from the rate card and the effort estimate; a draft until approved. */
export async function draftProposal(access: AccessContext, userId: string | null, id: string) {
  const opp = await loadOpportunity(access, id);
  if (!['QUALIFIED', 'DEMO', 'PROPOSAL'].includes(opp.status)) throw new DomainError('Qualify the opportunity before proposing it.');
  if (!opp.estimatedBuildHours) throw new DomainError('There is no effort estimate to price.');
  if (!opp.assessment) throw new DomainError('Assess it first; the proposal shows the projected value and its inputs.');
  const account = await db.account.findUniqueOrThrow({ where: { id: opp.accountId } });
  const p = await priceFor(opp.organizationId, opp);
  const projection = projectValue(assessmentSchema.parse(opp.assessment), { setupCents: p.setupCents, monthlyCents: p.monthlyCents });
  const days = opp.estimatedBuildHours / 8;
  const scope: ScopePhase[] = PHASE_SHAPE.map((ph) => {
    const d = Math.max(1, Math.round(days * ph.share));
    return { phase: ph.phase, deliverables: ph.deliverables, days: d, weeks: Math.max(1, Math.ceil(d / 4)) };
  });
  const lineItems: LineItem[] = [
    ...(p.org.discoveryFeeCents > 0 ? [{ label: 'Discovery', detail: 'Process mapping and scoping', qty: 1, unitCents: p.org.discoveryFeeCents, recurring: false }] : []),
    {
      label: p.template ? `${p.template.name}, configured for ${account.name}` : `Custom automation: ${opp.title}`,
      detail: `${opp.reusability?.toLowerCase()} reuse · ${opp.estimatedBuildHours} hours (estimate)`,
      qty: opp.estimatedBuildHours, unitCents: p.hourlyCents, recurring: false,
    },
    ...(p.monthlyCents > 0 ? [{ label: 'Hosting, monitoring and support', detail: 'Monthly, cancel with 30 days notice', qty: 1, unitCents: p.monthlyCents, recurring: true }] : []),
  ];
  const subtotal = lineItems.filter((i) => !i.recurring).reduce((s, i) => s + i.qty * i.unitCents, 0);
  const monthly = lineItems.filter((i) => i.recurring).reduce((s, i) => s + i.qty * i.unitCents, 0);
  const proposal = await db.proposal.create({
    data: {
      organizationId: opp.organizationId, accountId: opp.accountId, opportunityId: opp.id, number: await nextProposalNumber(opp.organizationId),
      title: `${opp.title}: proposal for ${account.name}`.slice(0, 200), status: 'DRAFT',
      scope: scope as unknown as Prisma.InputJsonValue, lineItems: lineItems as unknown as Prisma.InputJsonValue,
      subtotalCents: subtotal, totalCents: subtotal, recurringMonthlyCents: monthly, currency: p.org.currency,
      timeline: { totalDays: scope.reduce((s, x) => s + x.days, 0), totalWeeks: scope.reduce((s, x) => s + x.weeks, 0) } as Prisma.InputJsonValue,
      // Shown as a projection with its inputs and their sources, never as a result.
      roiSummary: { ...projection, label: 'Projected value (scenario)' } as unknown as Prisma.InputJsonValue,
      terms: p.org.proposalTerms, shareToken: randomBytes(24).toString('base64url'), expiresAt: addDays(new Date(), p.org.proposalValidDays),
    },
  });
  await db.opportunity.update({ where: { id: opp.id }, data: { status: 'PROPOSAL', proposalId: proposal.id, projection: projection as unknown as Prisma.InputJsonValue } });
  await logActivity({ organizationId: opp.organizationId, accountId: opp.accountId, userId, type: 'SYSTEM', title: `Proposal ${proposal.number} drafted for ${opp.title}` });
  return proposal;
}

async function loadProposal(access: AccessContext, proposalId: string) {
  const proposal = await db.proposal.findFirst({ where: { id: proposalId, organizationId: access.organizationId }, include: { account: { select: { clientId: true } } } });
  if (!proposal) throw new NotFoundError('Proposal');
  assertClientAccess(access, proposal.account.clientId);
  return proposal;
}

/** Internal sign-off. Required before an opportunity's proposal is sent or accepted. */
export async function approveProposal(access: AccessContext, userId: string, proposalId: string) {
  const proposal = await loadProposal(access, proposalId);
  if (proposal.status !== 'DRAFT') throw new DomainError('Only a draft is approved.');
  return db.proposal.update({ where: { id: proposal.id }, data: { approvedAt: new Date(), approvedById: userId } });
}

export const acceptanceSchema = z.object({
  signedBy: z.string().trim().min(2).max(120),
  evidence: z.string().trim().min(5).max(1000),
});

/** Records the customer's authorisation received outside the share link (a signed SOW, a PO). */
export async function recordAcceptance(access: AccessContext, userId: string, proposalId: string, raw: z.input<typeof acceptanceSchema>) {
  const input = acceptanceSchema.parse(raw);
  const proposal = await loadProposal(access, proposalId);
  if (!proposal.approvedAt) throw new DomainError('Approve the proposal internally before recording the customer\'s acceptance.');
  if (proposal.status === 'ACCEPTED') return proposal;
  if (['DECLINED', 'EXPIRED'].includes(proposal.status)) throw new DomainError(`This proposal is ${proposal.status.toLowerCase()}.`);
  const updated = await db.proposal.update({ where: { id: proposal.id }, data: { status: 'ACCEPTED', acceptedAt: new Date(), signatureName: input.signedBy, acceptanceEvidence: input.evidence } });
  await logActivity({ organizationId: proposal.organizationId, accountId: proposal.accountId, userId, type: 'SYSTEM', title: `Proposal ${proposal.number} accepted`, body: `${input.signedBy}: ${input.evidence}` });
  return updated;
}

// ---------------------------------------------------------------------------
// Conversion to a customer
// ---------------------------------------------------------------------------

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'customer';

/**
 * After the customer has authorised the proposal: their own client
 * (tenant), a delivery project with the estimate, and a draft application
 * from the matched template. Nothing is deployed; Studio's tests and an
 * admin's production deploy still decide that.
 */
export async function convertToCustomer(access: AccessContext, userId: string | null, id: string) {
  const opp = await loadOpportunity(access, id);
  if (!opp.proposalId) throw new DomainError('There is no proposal for this opportunity.');
  const proposal = await db.proposal.findUniqueOrThrow({ where: { id: opp.proposalId } });
  if (proposal.status !== 'ACCEPTED' || !proposal.approvedAt) throw new DomainError('The customer has not accepted an approved proposal yet.');
  if (opp.customerClientId) {
    const project = await db.deliveryProject.findFirst({ where: { opportunityId: opp.id } });
    return { clientId: opp.customerClientId, projectId: project?.id ?? null, applicationId: project?.applicationId ?? null, alreadyConverted: true };
  }
  const account = await db.account.findUniqueOrThrow({ where: { id: opp.accountId } });
  const org = await db.organization.findUniqueOrThrow({ where: { id: opp.organizationId } });
  // Reuse a customer client already made for this company (a second opportunity).
  let client = await db.client.findFirst({ where: { organizationId: opp.organizationId, kind: 'CUSTOMER', archivedAt: null, OR: [{ domain: account.domain ?? '__none__' }, { name: account.name }] } });
  client ??= await db.client.create({
    data: {
      organizationId: opp.organizationId, name: account.name, slug: `${slugify(account.name)}-${randomBytes(2).toString('hex')}`, kind: 'CUSTOMER',
      websiteUrl: account.websiteUrl, domain: account.domain, description: account.description, status: 'ONBOARDING',
      notes: `Customer since proposal ${proposal.number}.`,
    },
  });
  const staff = systemAccess(opp.organizationId);
  let applicationId: string | null = null;
  if (opp.templateVersionId && opp.reusability && !['CUSTOM', 'NOT_FEASIBLE'].includes(opp.reusability)) {
    const { app } = await createApplication(staff, userId, { clientId: client.id, templateVersionId: opp.templateVersionId, name: opp.title.slice(0, 120), overrides: { branding: { displayName: account.name.slice(0, 120) } } });
    applicationId = app.id;
  }
  const hours = opp.estimatedBuildHours ?? 0;
  const project = await db.deliveryProject.create({
    data: {
      organizationId: opp.organizationId, clientId: client.id, opportunityId: opp.id, proposalId: proposal.id, applicationId, templateId: opp.templateId,
      name: `${account.name}: ${opp.title}`.slice(0, 200), reusability: opp.reusability, estimatedHours: hours,
      estimatedCostCents: hours * org.internalHourlyCostCents, priceSetupCents: proposal.totalCents, priceMonthlyCents: proposal.recurringMonthlyCents,
    },
  });
  await db.opportunity.update({ where: { id: opp.id }, data: { status: 'WON', customerClientId: client.id } });
  await logActivity({ organizationId: opp.organizationId, accountId: opp.accountId, userId, type: 'SYSTEM', title: `Won: ${opp.title}`, body: `Customer ${client.name} created with a delivery project${applicationId ? ' and a draft application' : ''}.` });
  return { clientId: client.id, projectId: project.id, applicationId, alreadyConverted: false };
}

export async function markLost(access: AccessContext, userId: string, id: string, note: string) {
  const opp = await loadOpportunity(access, id);
  if (opp.status === 'WON') throw new DomainError('It is already won.');
  return db.opportunity.update({ where: { id: opp.id }, data: { status: 'LOST', reviewNote: note, reviewedById: userId, reviewedAt: new Date() } });
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export const OPPORTUNITY_STATUSES = ['PROPOSED', 'QUALIFIED', 'REJECTED', 'DEMO', 'PROPOSAL', 'WON', 'LOST'] as const;

export async function listOpportunities(access: AccessContext, opts: { clientId?: string | null; status?: string | null; accountId?: string | null; reusability?: Reusability | null; limit?: number; cursor?: string | null } = {}) {
  const rows = await db.opportunity.findMany({
    where: {
      ...clientFilter(access, opts.clientId), ...(opts.status ? { status: opts.status } : {}), ...(opts.accountId ? { accountId: opts.accountId } : {}),
      ...(opts.reusability ? { reusability: opts.reusability } : {}),
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: (opts.limit ?? 50) + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: { account: { select: { id: true, name: true, industry: true, city: true } } },
  });
  const limit = opts.limit ?? 50;
  const counts = await db.opportunity.groupBy({ by: ['status'], where: clientFilter(access, opts.clientId), _count: true });
  return {
    items: rows.slice(0, limit).map((o) => ({ ...o, projection: o.projection as unknown as Projection | null })),
    nextCursor: rows.length > limit ? rows[limit - 1]!.id : null,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) as Record<string, number>,
  };
}

export async function getOpportunity(access: AccessContext, id: string) {
  const opp = await loadOpportunity(access, id);
  const [account, template, demos, proposal, projects, version] = await Promise.all([
    db.account.findUnique({ where: { id: opp.accountId }, select: { id: true, name: true, industry: true, city: true, websiteUrl: true, domain: true } }),
    opp.templateId ? db.appTemplate.findUnique({ where: { id: opp.templateId }, select: { id: true, name: true, industry: true, recommendedMonthlyCents: true, recommendedSetupCents: true, buildHoursEstimate: true } }) : null,
    db.opportunityDemo.findMany({ where: { opportunityId: opp.id }, orderBy: { createdAt: 'desc' } }),
    opp.proposalId ? db.proposal.findUnique({ where: { id: opp.proposalId } }) : null,
    db.deliveryProject.findMany({ where: { opportunityId: opp.id } }),
    opp.researchVersionId ? db.researchVersion.findUnique({ where: { id: opp.researchVersionId }, select: { version: true, facts: true, createdAt: true } }) : null,
  ]);
  // Only the facts this opportunity cites, so a reviewer can check them.
  const basis = ((version?.facts as { basis?: Array<{ id: string; statement: string }> } | null)?.basis ?? []).filter((f) => opp.evidenceFactIds.includes(f.id));
  const price = await priceFor(opp.organizationId, opp);
  return {
    opportunity: { ...opp, projection: opp.projection as unknown as Projection | null },
    account, template, demos, proposal, projects, evidence: basis, researchVersion: version ? { version: version.version, createdAt: version.createdAt } : null,
    price: { hourlyCents: price.hourlyCents, setupCents: price.setupCents, monthlyCents: price.monthlyCents, currency: price.org.currency },
  };
}
