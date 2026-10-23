import type { ClaimType, Prisma, SignalType } from '@prisma/client';
import { db } from '@/lib/db';
import { crawlSite, type CrawledPage } from '@/server/services/crawler';
import { rescoreAccount } from '@/server/services/scoring';
import { logActivity } from '@/server/services/activity';
import { saveSignals } from '@/server/services/signals';
import { advanceAccountStatus } from '@/server/services/accounts';
import { recordProviderCall } from '@/server/connectors/records';
import { afterAnalysis, type Trigger } from '@/server/services/pipeline/gates';
import { assertCategoryBudget } from '@/server/services/pipeline/budgets';
import { complete, parseJson } from './provider';
import { MODELS } from './pricing';
import { groundItems, mergeReports, parseEventDate, type GroundingReport, type VerifiedCitation } from './grounding';
import {
  buildResearchPrompt, CLAIM_TYPES, RESEARCH_PROMPT_VERSION, RESEARCH_SYSTEM, SIGNAL_TYPES, type ResearchOutput,
} from './prompts/research';

export class ResearchError extends Error {
  constructor(message: string, public code: 'NO_WEBSITE' | 'CRAWL_FAILED' | 'BLOCKED' | 'MODEL_FAILED' | 'UNGROUNDED') {
    super(message);
    this.name = 'ResearchError';
  }
}

/** A fact that survived verification — the only thing a draft may state about a prospect. */
export interface VerifiedFact {
  id: string;
  claimType: ClaimType;
  statement: string;
  citations: VerifiedCitation[];
}

export interface VerifiedRelevance {
  /** Which of the client's offers the angle is about; null when the model named none we sell. */
  offer: string | null;
  angle: string;
  reasoning: string;
  confidence: number;
  citations: VerifiedCitation[];
}

export interface VerifiedAttribute {
  attribute: string;
  assessment: 'MET' | 'NOT_MET' | 'UNKNOWN';
  note: string;
  citations: VerifiedCitation[];
}

const clamp = (n: unknown, fallback = 0.5) => {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  return Math.max(0, Math.min(1, v));
};

/**
 * The research pipeline: crawl → generate → verify → persist.
 *
 * Research is framed by the client's offer: the question is not "what does
 * this company do" but "why might this company care about what our client
 * sells". The verify step is not optional and not advisory. Facts, signals,
 * attribute checks and relevance angles whose quotes cannot be located in the
 * crawled text are removed before anything is written, so downstream drafting
 * can only ever reference material that survived verification.
 */
export async function runResearch(organizationId: string, accountId: string, opts: { trigger?: Trigger } = {}) {
  const account = await db.account.findFirstOrThrow({
    where: { id: accountId, organizationId, deletedAt: null },
    include: {
      client: {
        include: {
          offers: { where: { isActive: true }, orderBy: { createdAt: 'asc' }, take: 4 },
          icps: { where: { isActive: true }, orderBy: { createdAt: 'asc' } },
        },
      },
    },
  });

  if (!account.websiteUrl) {
    throw new ResearchError('This account has no website to research.', 'NO_WEBSITE');
  }
  await assertCategoryBudget(organizationId, 'analysis');

  const offers = account.client.offers;
  const offer = offers[0] ?? null;
  const icp = account.client.icps.find((i) => i.id === account.icpId) ?? account.client.icps[0] ?? null;

  await db.research.upsert({
    where: { accountId },
    create: { accountId, organizationId, clientId: account.clientId, offerId: offer?.id ?? null, status: 'RUNNING' },
    update: { status: 'RUNNING', error: null, offerId: offer?.id ?? null },
  });

  try {
    // 1. Crawl the company's own site — first-party, robots-respecting, small.
    const crawl = await crawlSite(account.websiteUrl);
    await recordProviderCall({
      organizationId, clientId: account.clientId, accountId,
      provider: 'company_website', operation: 'website.crawl', lookupKey: account.domain ?? account.websiteUrl,
      status: crawl.pages.length ? 'SUCCESS' : 'NOT_FOUND',
      normalized: { pages: crawl.pages.map(pageMeta), errors: crawl.errors, blockedByRobots: crawl.blockedByRobots } as Prisma.InputJsonValue,
    });
    if (crawl.blockedByRobots) {
      throw new ResearchError('Their robots.txt asks crawlers not to read the site.', 'BLOCKED');
    }
    if (crawl.pages.length === 0) {
      throw new ResearchError('Could not read any pages from their website.', 'CRAWL_FAILED');
    }

    // 2. Generate, framed by the client's offer and ICP.
    const completion = await complete({
      organizationId,
      kind: 'research',
      entityId: accountId,
      attribution: { clientId: account.clientId, accountId },
      promptVersion: RESEARCH_PROMPT_VERSION,
      model: MODELS.research,
      system: RESEARCH_SYSTEM,
      user: buildResearchPrompt({
        account,
        client: account.client,
        offers: offers.map((o) => ({ name: o.name, summary: o.summary, valueProposition: o.valueProposition })),
        icp: icp ? { name: icp.name, requiredAttributes: icp.requiredAttributes, signalKeywords: icp.signalKeywords } : null,
        detectedSoftware: crawl.detectedSoftware,
        pages: crawl.pages,
        today: new Date().toISOString().slice(0, 10),
      }),
      maxTokens: 4096,
      temperature: 0.2,
      json: true,
    });

    let output: ResearchOutput;
    try {
      output = parseJson<ResearchOutput>(completion.text);
    } catch (err) {
      throw new ResearchError(
        `Model returned malformed output: ${err instanceof Error ? err.message : 'unknown'}`,
        'MODEL_FAILED',
      );
    }

    // 3. Verify every item against the pages we actually fetched.
    const facts = groundItems(
      (output.facts ?? []).filter((f) => CLAIM_TYPES.includes(f.claimType)),
      crawl.pages, (f) => f.statement,
    );
    const signals = groundItems(
      (output.signals ?? []).filter((s) => SIGNAL_TYPES.includes(s.type)),
      crawl.pages, (s) => s.title,
    );
    const relevance = groundItems(output.relevance ?? [], crawl.pages, (r) => r.angle);
    // UNKNOWN assessments carry no evidence by design; MET / NOT_MET must be proven.
    const attributesToCheck = (output.icpAttributes ?? []).filter((a) => a.assessment !== 'UNKNOWN');
    const attributes = groundItems(attributesToCheck, crawl.pages, (a) => a.attribute);
    const unknownAttributes: VerifiedAttribute[] = (output.icpAttributes ?? [])
      .filter((a) => a.assessment === 'UNKNOWN')
      .map((a) => ({ attribute: a.attribute, assessment: 'UNKNOWN', note: a.note ?? '', citations: [] }));

    const report: GroundingReport = mergeReports(facts.report, signals.report, relevance.report, attributes.report);

    if (facts.grounded.length === 0 && signals.grounded.length === 0) {
      throw new ResearchError(
        'Nothing on their site could be verified. Research again later, or work this account from other sources.',
        'UNGROUNDED',
      );
    }

    const verifiedFacts: VerifiedFact[] = facts.grounded.map((f, i) => ({
      id: `r${i + 1}`, claimType: f.claimType, statement: f.statement, citations: f.citations,
    }));
    const offerNames = new Map(offers.map((o) => [o.name.trim().toLowerCase(), o.name]));
    const verifiedRelevance: VerifiedRelevance[] = relevance.grounded.map((r) => ({
      offer: offerNames.get(String(r.offer ?? '').trim().toLowerCase()) ?? (offers.length === 1 ? offers[0]!.name : null),
      angle: r.angle, reasoning: r.reasoning, confidence: clamp(r.confidence), citations: r.citations,
    }));
    const verifiedAttributes: VerifiedAttribute[] = [
      ...attributes.grounded.map((a) => ({ attribute: a.attribute, assessment: a.assessment, note: a.note ?? '', citations: a.citations })),
      ...unknownAttributes,
    ];

    // A run that lost items to verification is a less trustworthy run.
    const confidence = clamp(output.overallConfidence) * (0.5 + 0.5 * report.groundingRate);

    const research = await db.research.update({
      where: { accountId },
      data: {
        status: 'COMPLETED',
        pagesCrawled: crawl.pages.map(pageMeta) as Prisma.InputJsonValue,
        rawExtract: crawl.pages.map((p) => `[${p.id}] ${p.url}\n${p.text}`).join('\n\n---\n\n'),
        companySummary: output.companySummary ?? null,
        servicesOffered: (output.servicesOffered ?? []).slice(0, 20),
        detectedSoftware: crawl.detectedSoftware,
        observedSignals: crawl.signals as Prisma.InputJsonValue,
        facts: verifiedFacts as unknown as Prisma.InputJsonValue,
        relevance: { angles: verifiedRelevance, attributes: verifiedAttributes } as unknown as Prisma.InputJsonValue,
        talkingPoints: (output.talkingPoints ?? []).slice(0, 8),
        citations: { report } as unknown as Prisma.InputJsonValue,
        confidence,
        model: completion.model,
        promptVersion: RESEARCH_PROMPT_VERSION,
        tokensIn: completion.tokensIn,
        tokensOut: completion.tokensOut,
        costCents: completion.costCents,
        refreshedAt: new Date(),
        error: null,
      },
    });

    await db.account.update({
      where: { id: accountId },
      data: {
        researchSummary: output.companySummary ?? null,
        enrichmentStatus: account.enrichmentStatus === 'NOT_STARTED' ? 'PARTIAL' : account.enrichmentStatus,
        techStack: [...new Set([...account.techStack, ...crawl.detectedSoftware])],
      },
    });

    const createdSignals = await saveSignals(
      account,
      signals.grounded.map((s) => {
        const citation = s.citations[0]!;
        return {
          type: s.type as SignalType,
          title: s.title,
          summary: s.summary,
          sourceUrl: citation.url,
          sourceTitle: citation.pageTitle,
          sourceQuote: citation.quote,
          eventDate: parseEventDate(s.eventDate),
          confidence: clamp(s.confidence) * citation.similarity,
          source: 'RESEARCH',
          provider: 'company_website',
          evidenceStatus: 'VERIFIED',
          metadata: { matchType: citation.matchType, eventDateReported: s.eventDate ?? null, researchId: research.id },
        };
      }),
      { rescore: false },
    );

    await advanceAccountStatus(accountId, 'ENRICHED');
    await rescoreAccount(accountId);
    await logActivity({
      organizationId, clientId: account.clientId, accountId,
      type: 'RESEARCH_COMPLETED',
      title: 'Research completed',
      body: `${verifiedFacts.length} verified facts and ${createdSignals.length} new signals from ${crawl.pages.length} pages.`
        + (report.rejectedClaims.length ? ` ${report.rejectedClaims.length} unsupported items were discarded.` : ''),
      metadata: { groundingRate: report.groundingRate, costCents: completion.costCents },
    });

    // Keep this run as a version and let the funnel decide what comes next.
    await afterAnalysis(organizationId, accountId, opts.trigger ?? 'MANUAL');

    return { research, report, pagesCrawled: crawl.pages.length, signalsCreated: createdSignals.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Research failed';
    await db.research.update({
      where: { accountId },
      data: { status: 'FAILED', error: message.slice(0, 500) },
    });
    throw err;
  }
}

function pageMeta(p: CrawledPage) {
  return { id: p.id, url: p.url, title: p.title, chars: p.chars, fetchedAt: p.fetchedAt };
}
