import { db } from '@/lib/db';
import { crawlSite, type CrawledPage } from '@/server/services/crawler';
import { estimateRoi } from '@/server/services/roi';
import { rescoreLead } from '@/server/services/leads';
import { logActivity } from '@/server/services/crm';
import { complete, parseJson } from './provider';
import { MODELS } from './pricing';
import { groundClaims, type GroundingReport } from './grounding';
import {
  buildResearchPrompt, RESEARCH_SYSTEM, RESEARCH_PROMPT_VERSION, type ResearchOutput,
} from './prompts/research';

export class ResearchError extends Error {
  constructor(message: string, public code: 'NO_WEBSITE' | 'CRAWL_FAILED' | 'BLOCKED' | 'MODEL_FAILED' | 'UNGROUNDED') {
    super(message);
    this.name = 'ResearchError';
  }
}

/**
 * The research pipeline: crawl → generate → verify → cost → persist.
 *
 * The verify step is not optional and not advisory. Claims whose quotes cannot
 * be located in the crawled text are removed before anything is written to the
 * database, so downstream personalization can only ever reference material that
 * survived verification. If nothing survives, the run fails loudly rather than
 * storing a confident-sounding empty report.
 */
export async function runResearch(organizationId: string, leadId: string) {
  const lead = await db.lead.findFirstOrThrow({
    where: { id: leadId, organizationId, deletedAt: null },
  });

  if (!lead.websiteUrl) {
    throw new ResearchError('This lead has no website to research.', 'NO_WEBSITE');
  }

  await db.research.upsert({
    where: { leadId },
    create: { leadId, organizationId, status: 'RUNNING' },
    update: { status: 'RUNNING', error: null },
  });
  await db.lead.update({ where: { id: leadId }, data: { status: 'RESEARCHING' } });

  try {
    // 1. Crawl
    const crawl = await crawlSite(lead.websiteUrl);
    if (crawl.blockedByRobots) {
      throw new ResearchError('Their robots.txt asks crawlers not to read the site.', 'BLOCKED');
    }
    if (crawl.pages.length === 0) {
      throw new ResearchError('Could not read any pages from their website.', 'CRAWL_FAILED');
    }

    // 2. Generate
    const completion = await complete({
      organizationId,
      kind: 'research',
      entityId: leadId,
      promptVersion: RESEARCH_PROMPT_VERSION,
      model: MODELS.research,
      system: RESEARCH_SYSTEM,
      user: buildResearchPrompt({
        companyName: lead.companyName,
        industry: lead.industry,
        city: lead.city,
        region: lead.region,
        employeeCount: lead.employeeCount,
        detectedSoftware: crawl.detectedSoftware,
        signals: crawl.signals,
        pages: crawl.pages,
      }),
      maxTokens: 4096,
      temperature: 0.3,
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

    // 3. Verify every claim against the pages we actually fetched.
    const painResult = groundClaims(output.painPoints ?? [], crawl.pages);
    const oppResult = groundClaims(output.opportunities ?? [], crawl.pages);

    const report: GroundingReport = {
      totalClaims: painResult.report.totalClaims + oppResult.report.totalClaims,
      groundedClaims: painResult.report.groundedClaims + oppResult.report.groundedClaims,
      rejectedClaims: [...painResult.report.rejectedClaims, ...oppResult.report.rejectedClaims],
      groundingRate: 0,
    };
    report.groundingRate = report.totalClaims ? report.groundedClaims / report.totalClaims : 0;

    if (oppResult.grounded.length === 0) {
      throw new ResearchError(
        'Nothing on their site supported a specific automation opportunity. Try researching again, or work this lead manually.',
        'UNGROUNDED',
      );
    }

    // 4. ROI is arithmetic on the model's hour estimates, never generated.
    const roi = estimateRoi(
      oppResult.grounded.map((o) => ({
        title: o.title,
        hoursPerWeek: Math.max(0, Math.min(40, o.hoursPerWeek ?? 0)),
        confidence: clamp(o.confidence),
      })),
    );

    // A run that lost claims to verification is a less trustworthy run, and the
    // stored confidence should say so.
    const confidence = clamp(output.overallConfidence ?? 0.5) * (0.5 + 0.5 * report.groundingRate);

    const allCitations = [...painResult.grounded, ...oppResult.grounded].flatMap((c) => c.citations);

    const research = await db.research.update({
      where: { leadId },
      data: {
        status: 'SUCCEEDED',
        pagesCrawled: crawl.pages.map(pageMeta) as never,
        rawExtract: crawl.pages.map((p) => `[${p.id}] ${p.url}\n${p.text}`).join('\n\n---\n\n'),
        companySummary: output.companySummary ?? null,
        servicesOffered: output.servicesOffered ?? [],
        detectedSoftware: crawl.detectedSoftware,
        observedSignals: crawl.signals as never,
        painPoints: painResult.grounded as never,
        opportunities: oppResult.grounded as never,
        talkingPoints: output.talkingPoints ?? [],
        citations: { verified: allCitations, report } as never,
        estimatedHoursSavedPerMonth: roi.hoursSavedPerMonth,
        estimatedAnnualSavingsCents: roi.annualSavingsCents,
        roiAssumptions: { ...roi.assumptions, perOpportunity: roi.perOpportunity } as never,
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

    await db.lead.update({ where: { id: leadId }, data: { status: 'RESEARCHED' } });
    await rescoreLead(leadId);
    await logActivity({
      organizationId,
      leadId,
      type: 'RESEARCH_COMPLETED',
      title: 'Research completed',
      body: `${oppResult.grounded.length} automation opportunities found across ${crawl.pages.length} pages.`
        + (report.rejectedClaims.length
          ? ` ${report.rejectedClaims.length} unsupported claims were discarded.`
          : ''),
      metadata: { groundingRate: report.groundingRate, costCents: completion.costCents },
    });

    return { research, report, pagesCrawled: crawl.pages.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Research failed';
    await db.research.update({
      where: { leadId },
      data: { status: 'FAILED', error: message.slice(0, 500) },
    });
    await db.lead.update({ where: { id: leadId }, data: { status: 'DISCOVERED' } });
    throw err;
  }
}

function pageMeta(p: CrawledPage) {
  return { id: p.id, url: p.url, title: p.title, chars: p.chars, fetchedAt: p.fetchedAt };
}

function clamp(n: number) {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0.5));
}
