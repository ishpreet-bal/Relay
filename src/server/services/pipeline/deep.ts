import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { systemAccess } from '@/server/access/scope';
import { DomainError, NotFoundError } from '@/server/errors';
import { complete, parseJson } from '@/server/ai/provider';
import { MODELS } from '@/server/ai/pricing';
import { buildDeepResearchPrompt, DEEP_RESEARCH_PROMPT_VERSION, DEEP_RESEARCH_SCHEMA, DEEP_RESEARCH_SYSTEM } from '@/server/ai/prompts/deep-research';
import { isCapabilityAvailable } from '@/server/connectors/registry';
import { discoverContacts } from '@/server/services/enrichment';
import { estimateRoi } from '@/server/services/roi';
import { logActivity } from '@/server/services/activity';
import { assertCategoryBudget } from './budgets';

/**
 * Stage 4. Only for accounts that cleared every earlier gate (or that a
 * person promoted): an assessment built strictly on stage 3's verified
 * facts, an ROI scenario computed from stated assumptions, and contact
 * discovery through a permitted provider when one is connected. The result
 * is a version, like any analysis, with facts, hypotheses and unknowns kept
 * apart.
 */

const ids = z.array(z.string()).default([]);
const outputSchema = z.object({
  businessModel: z.object({ description: z.string(), evidenceFactIds: ids }),
  processes: z.array(z.object({ name: z.string(), description: z.string(), evidenceFactIds: ids })).default([]),
  opportunities: z.array(z.object({
    title: z.string(),
    problem: z.string(),
    proposedAutomation: z.string(),
    evidenceFactIds: ids,
    howToValidate: z.string(),
    estimatedHours: z.object({ lowPerWeek: z.number(), highPerWeek: z.number() }).nullable(),
    assumptions: z.array(z.string()).default([]),
    integrationBarriers: z.array(z.string()).default([]),
    matchingSolutionSlugs: z.array(z.string()).default([]),
    confidence: z.number(),
  })).default([]),
  unknowns: z.array(z.object({ question: z.string(), whyItMatters: z.string() })).default([]),
  contactStrategy: z.object({ angle: z.string(), evidenceFactIds: ids, channel: z.enum(['email', 'phone', 'either']), caution: z.string() }).nullable(),
  overallFit: z.object({ score: z.number(), rationale: z.string() }),
});
export type DeepResearchOutput = z.infer<typeof outputSchema>;

interface Fact { id: string; statement: string; claimType?: string }

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Keeps only claims that cite at least one real fact, strips invented ids
 * and unknown catalogue slugs, and bounds the numbers. Pure, so it can be
 * tested without a model.
 */
export function validateDeepOutput(raw: unknown, factIds: Set<string>, slugs: Set<string>) {
  const parsed = outputSchema.parse(raw);
  const keep = (refs: string[]) => refs.filter((r) => factIds.has(r));
  const rejected: string[] = [];

  const processes = parsed.processes
    .map((p) => ({ ...p, evidenceFactIds: keep(p.evidenceFactIds) }))
    .filter((p) => (p.evidenceFactIds.length ? true : (rejected.push(`process: ${p.name}`), false)));

  const opportunities = parsed.opportunities
    .map((o) => ({
      ...o,
      kind: 'AI_HYPOTHESIS' as const,
      evidenceFactIds: keep(o.evidenceFactIds),
      matchingSolutionSlugs: o.matchingSolutionSlugs.filter((s) => slugs.has(s)),
      confidence: clamp(o.confidence, 0, 1),
      estimatedHours: o.estimatedHours && o.estimatedHours.highPerWeek > 0
        ? { lowPerWeek: clamp(Math.min(o.estimatedHours.lowPerWeek, o.estimatedHours.highPerWeek), 0, 40), highPerWeek: clamp(o.estimatedHours.highPerWeek, 0, 40) }
        : null,
    }))
    .filter((o) => (o.evidenceFactIds.length ? true : (rejected.push(`opportunity: ${o.title}`), false)));

  const strategyRefs = parsed.contactStrategy ? keep(parsed.contactStrategy.evidenceFactIds) : [];
  const contactStrategy = parsed.contactStrategy && strategyRefs.length ? { ...parsed.contactStrategy, evidenceFactIds: strategyRefs } : null;
  if (parsed.contactStrategy && !contactStrategy) rejected.push('contact strategy');

  return {
    businessModel: { ...parsed.businessModel, evidenceFactIds: keep(parsed.businessModel.evidenceFactIds) },
    processes,
    opportunities,
    unknowns: parsed.unknowns,
    contactStrategy,
    overallFit: { score: Math.round(clamp(parsed.overallFit.score, 0, 100)), rationale: parsed.overallFit.rationale },
    rejected,
  };
}

/** ROI scenarios at both ends of each estimate, from stated assumptions, never generated. */
export function roiScenarios(opportunities: Array<{ title: string; confidence: number; estimatedHours: { lowPerWeek: number; highPerWeek: number } | null }>) {
  const sized = opportunities.filter((o) => o.estimatedHours);
  if (!sized.length) return null;
  const low = estimateRoi(sized.map((o) => ({ title: o.title, hoursPerWeek: o.estimatedHours!.lowPerWeek, confidence: o.confidence })));
  const high = estimateRoi(sized.map((o) => ({ title: o.title, hoursPerWeek: o.estimatedHours!.highPerWeek, confidence: o.confidence })));
  return {
    kind: 'SCENARIO' as const,
    low: { hoursPerMonth: low.hoursSavedPerMonth, annualSavingsCents: low.annualSavingsCents },
    high: { hoursPerMonth: high.hoursSavedPerMonth, annualSavingsCents: high.annualSavingsCents },
    assumptions: low.assumptions,
    note: 'A scenario from public information and stated assumptions, not a measured result. Validate the hours in a discovery call.',
  };
}

export async function runDeepResearch(organizationId: string, accountId: string, trigger: string) {
  const account = await db.account.findFirst({
    where: { id: accountId, organizationId, deletedAt: null },
    include: {
      research: true,
      signals: { where: { dismissedAt: null }, orderBy: { detectedAt: 'desc' }, take: 15 },
      client: { include: { offers: { where: { isActive: true }, take: 1 } } },
    },
  });
  if (!account) throw new NotFoundError('Account');
  const research = account.research;
  if (!research || research.status !== 'COMPLETED') throw new DomainError('Deep research needs a completed analysis first.');
  const facts = ((research.facts ?? []) as unknown as Fact[]).filter((f) => f.id && f.statement);
  if (!facts.length) throw new DomainError('The analysis found no verified facts to build on.');
  await assertCategoryBudget(organizationId, 'deep');

  // Studio templates are the solution catalogue; the older demo-site library fills in.
  const [studio, legacy] = await Promise.all([
    db.appTemplate.findMany({
      where: { OR: [{ organizationId: null }, { organizationId }], archivedAt: null, versions: { some: { status: 'PUBLISHED' } } },
      select: { slug: true, name: true, industry: true, description: true, useCases: true },
      take: 40,
    }),
    db.solutionTemplate.findMany({
      where: { OR: [{ organizationId: null }, { organizationId }], isPublished: true },
      select: { slug: true, title: true, industry: true, tagline: true },
      take: 40,
    }),
  ]);
  const catalogue = [
    ...studio.map((t) => ({ slug: t.slug, title: t.name, industry: t.industry, tagline: `${t.description} Covers: ${t.useCases.join(', ')}.` })),
    ...legacy.filter((l) => !studio.some((t) => t.slug === l.slug)),
  ].slice(0, 40);

  const completion = await complete({
    organizationId,
    kind: 'deep_research',
    entityId: accountId,
    attribution: { clientId: account.clientId, accountId },
    promptVersion: DEEP_RESEARCH_PROMPT_VERSION,
    model: MODELS.deepResearch,
    system: DEEP_RESEARCH_SYSTEM,
    user: buildDeepResearchPrompt({
      company: { name: account.name, industry: account.industry, city: account.city, region: account.region, employeeCount: account.employeeCount, website: account.websiteUrl },
      summary: research.companySummary,
      services: research.servicesOffered,
      facts,
      signals: account.signals.map((s) => ({ type: s.type, title: s.title, eventDate: s.eventDate?.toISOString().slice(0, 10) ?? null })),
      detectedSoftware: research.detectedSoftware,
      observedSignals: (research.observedSignals ?? {}) as Record<string, boolean>,
      offer: account.client.offers[0]?.summary ?? null,
      catalogue,
    }),
    json: true,
    jsonSchema: DEEP_RESEARCH_SCHEMA as unknown as Record<string, unknown>,
    effort: 'high',
    maxTokens: 16_000,
  });

  const result = validateDeepOutput(parseJson(completion.text), new Set(facts.map((f) => f.id)), new Set(catalogue.map((c) => c.slug)));
  const roi = roiScenarios(result.opportunities);

  // Decision-makers only through a permitted, connected provider.
  let contacts: { status: string; added?: number; error?: string | null } = { status: 'NOT_CONFIGURED' };
  if (await isCapabilityAvailable(organizationId, 'CONTACT_DATA') && account.domain) {
    try {
      await assertCategoryBudget(organizationId, 'enrichment');
      const r = await discoverContacts(systemAccess(organizationId), accountId, 3);
      contacts = { status: r.status, added: 'added' in r ? r.added : 0, error: 'error' in r ? r.error ?? null : null };
    } catch (err) {
      contacts = { status: 'SKIPPED', error: err instanceof Error ? err.message : String(err) };
      logger.info('deep_research.contacts_skipped', { accountId, error: contacts.error });
    }
  }

  const costMillicents = completion.costCents * 1000;
  // Deep results have their own version sequence; each run is kept.
  const previous = await db.researchVersion.findFirst({ where: { accountId, stage: 'DEEP' }, orderBy: { version: 'desc' }, select: { version: true } });
  const version = await db.researchVersion.create({
    data: {
      organizationId, clientId: account.clientId, accountId,
      version: (previous?.version ?? 0) + 1,
      stage: 'DEEP',
      trigger,
      summary: result.businessModel.description,
      facts: { businessModel: result.businessModel, processes: result.processes, basis: facts } as unknown as Prisma.InputJsonValue,
      hypotheses: { opportunities: result.opportunities, roi, contactStrategy: result.contactStrategy, overallFit: result.overallFit, rejected: result.rejected } as unknown as Prisma.InputJsonValue,
      unknowns: result.unknowns as unknown as Prisma.InputJsonValue,
      sources: { contacts, analysisVersion: account.researchVersion } as unknown as Prisma.InputJsonValue,
      model: completion.model,
      promptVersion: DEEP_RESEARCH_PROMPT_VERSION,
      costMillicents,
    },
  });

  await db.account.update({
    where: { id: accountId },
    data: {
      ...(account.stagePinned ? {} : { pipelineStage: 'DEEP_RESEARCHED' as const }),
      researchCostMillicents: { increment: costMillicents },
    },
  });
  await logActivity({
    organizationId, clientId: account.clientId, accountId, type: 'RESEARCH_COMPLETED',
    title: 'Deep research completed',
    body: `${result.opportunities.length} evidence-backed opportunit${result.opportunities.length === 1 ? 'y' : 'ies'}, ${result.unknowns.length} open questions, fit ${result.overallFit.score}/100.`
      + (result.rejected.length ? ` ${result.rejected.length} unsupported items were discarded.` : ''),
    metadata: { versionId: version.id, costMillicents },
  });
  return { versionId: version.id, opportunities: result.opportunities.length, fit: result.overallFit.score, rejected: result.rejected.length, contacts };
}
