import type { ClaimType, SignalType } from '@prisma/client';
import type { CrawledPage } from '@/server/services/crawler';
import type { Evidence } from '../grounding';
import { CLAIM_TYPES, SIGNAL_TYPES } from '@/lib/domain';

/**
 * Bump this whenever the prompt changes. It's stored on every Research row and
 * AiRun, so a quality regression can be traced to the exact prompt that caused
 * it and old results can be selectively re-run.
 */
export const RESEARCH_PROMPT_VERSION = 'research/2026-10-23.multi-offer.1';

export { CLAIM_TYPES, SIGNAL_TYPES };

export const RESEARCH_SYSTEM = `You are a research analyst preparing a salesperson to contact a company. You read the company's own website and report what it says — nothing else.

The salesperson works for a business that sells one or more specific offers (described below). Your job is to answer: what is true about this company, what has happened recently that might make them care, and which of our client's offers might they need, and why?

EVIDENCE RULES — these are absolute:
1. Every fact, signal, attribute and relevance angle must be supported by text on the pages provided. Cite the page id and quote the supporting text verbatim.
2. Quotes must be copied exactly from the page text. A paraphrased quote fails verification and the item is discarded.
3. If the pages do not support something, leave it out. Empty lists are correct answers.
4. Never invent employee counts, revenue, customer names, locations, dates or numbers.
5. A FACT states only what the quote states. "They have a facility in Milton, Ontario" is a fact if a page says so. "They are growing fast" is not a fact unless a page says it.
6. A RELEVANCE angle is an inference, and must be labelled as one: name the observation (quoted) and explain why it might connect to the client's offer. Never present an inference as a fact.
7. Dates: give eventDate only if the page states when the event happened (YYYY-MM-DD or YYYY-MM). Otherwise null. Do not assume something is recent because it is on the website.

SIGNALS are events that make outreach timely: hiring, expansion, a new location, a new contract, a new product, funding, a leadership change, a regulatory event, a technology change. Undated "about us" history is rarely a signal.

TONE: plain and specific, for a colleague. No marketing language.`;

export interface ResearchFact {
  claimType: ClaimType;
  statement: string;
  evidence: Evidence[];
}

export interface ResearchSignal {
  type: SignalType;
  title: string;
  summary: string;
  eventDate: string | null;
  confidence: number;
  evidence: Evidence[];
}

export interface ResearchAttribute {
  attribute: string;
  assessment: 'MET' | 'NOT_MET' | 'UNKNOWN';
  note: string;
  evidence?: Evidence[];
}

export interface ResearchRelevance {
  /** The name of the offer this angle is about, exactly as listed. */
  offer?: string;
  angle: string;
  reasoning: string;
  confidence: number;
  evidence: Evidence[];
}

export interface ResearchOutput {
  companySummary: string;
  servicesOffered: string[];
  facts: ResearchFact[];
  signals: ResearchSignal[];
  icpAttributes: ResearchAttribute[];
  relevance: ResearchRelevance[];
  talkingPoints: string[];
  overallConfidence: number;
}

export interface ResearchContext {
  account: {
    name: string;
    industry: string | null;
    city: string | null;
    region: string | null;
    employeeCount: number | null;
  };
  client: {
    name: string;
    description: string | null;
    productsServices: string[];
    serviceAreas: string[];
  };
  offers: Array<{ name: string; summary: string; valueProposition: string | null }>;
  icp: { name: string; requiredAttributes: string[]; signalKeywords: string[] } | null;
  detectedSoftware: string[];
  pages: CrawledPage[];
  today: string;
}

export function buildResearchPrompt(ctx: ResearchContext): string {
  const pageBlocks = ctx.pages
    .map((p) => `<page id="${p.id}" url="${p.url}" title="${p.title.replace(/"/g, "'")}">\n${p.text}\n</page>`)
    .join('\n\n');

  const offer = ctx.offers.length
    ? `Offers:\n${ctx.offers.map((o) => `- "${o.name}": ${o.summary}${o.valueProposition ? ` Why it matters: ${o.valueProposition}` : ''}`).join('\n')}`
    : 'Offer: not specified — research the company itself and leave relevance empty unless the pages make a need obvious.';

  return `<today>${ctx.today}</today>

<our_client>
Company: ${ctx.client.name}
${ctx.client.description ? `About: ${ctx.client.description}\n` : ''}What they sell: ${ctx.client.productsServices.join('; ') || 'not specified'}
Where they serve: ${ctx.client.serviceAreas.join('; ') || 'not specified'}
${offer}
</our_client>

<target_company>
Name: ${ctx.account.name}
Industry (from our records, may be wrong): ${ctx.account.industry ?? 'unknown'}
Location (from our records): ${[ctx.account.city, ctx.account.region].filter(Boolean).join(', ') || 'unknown'}
Employees (from our records): ${ctx.account.employeeCount ?? 'unknown'}
</target_company>
${ctx.icp ? `
<ideal_customer_profile name="${ctx.icp.name}">
Check each attribute against the pages: ${ctx.icp.requiredAttributes.length ? ctx.icp.requiredAttributes.map((a) => `"${a}"`).join(', ') : '(none)'}
Signals worth watching for: ${ctx.icp.signalKeywords.join(', ') || '(none specified)'}
</ideal_customer_profile>
` : ''}
<detected_software>
${ctx.detectedSoftware.length ? ctx.detectedSoftware.join(', ') : 'None detected in page source'}
</detected_software>

<pages>
${pageBlocks}
</pages>

Respond with JSON matching exactly this shape:

{
  "companySummary": "3-4 plain sentences: what they do, who they serve, where they operate.",
  "servicesOffered": ["what the target company sells or does"],
  "facts": [
    { "claimType": "one of ${CLAIM_TYPES.join(' | ')}", "statement": "One sentence stating only what the quote states.", "evidence": [{ "pageId": "p1", "quote": "exact text" }] }
  ],
  "signals": [
    { "type": "one of ${SIGNAL_TYPES.join(' | ')}", "title": "Under 10 words", "summary": "One or two sentences.", "eventDate": "YYYY-MM-DD or YYYY-MM or null", "confidence": 0.0, "evidence": [{ "pageId": "p2", "quote": "exact text" }] }
  ],
  "icpAttributes": [
    { "attribute": "the attribute text from the ICP", "assessment": "MET | NOT_MET | UNKNOWN", "note": "one sentence", "evidence": [{ "pageId": "p1", "quote": "exact text" }] }
  ],
  "relevance": [
    { "offer": "the offer's name, exactly as listed", "angle": "Short label", "reasoning": "Observation (quoted below) → why it might connect to that offer. Phrase as a possibility, not a fact.", "confidence": 0.0, "evidence": [{ "pageId": "p3", "quote": "exact text" }] }
  ],
  "talkingPoints": ["Something specific a caller could mention, grounded in the facts above."],
  "overallConfidence": 0.0
}

Return up to 8 facts, up to 5 signals, one entry per ICP attribute (UNKNOWN needs no evidence), and up to 2 relevance angles per offer (none for an offer the pages give no reason for). Return only the JSON object.`;
}
