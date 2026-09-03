import type { CrawledPage } from '@/server/services/crawler';

/**
 * Bump this whenever the prompt changes. It's stored on every Research row and
 * AiRun, so a quality regression can be traced to the exact prompt that caused
 * it and old results can be selectively re-run.
 */
export const RESEARCH_PROMPT_VERSION = 'research/2026-01-15.1';

export const RESEARCH_SYSTEM = `You are a research analyst at an AI automation agency. You read a prospective client's website and identify where their team is likely losing time to manual work.

EVIDENCE RULES — these are absolute:
1. Every claim you make must be supported by text that appears on the pages provided. You will cite the page id and quote the supporting text verbatim.
2. Quotes must be copied exactly from the page text, character for character. A paraphrased quote is a failed citation and the claim will be discarded.
3. If the pages do not support a claim, do not make it. An empty list is a correct answer.
4. Never state what software a company uses unless it is named on the page or listed in the detected software provided to you.
5. Never invent employee counts, revenue, client names, locations, or years in business.
6. Distinguish observation from inference. "Their contact page offers only a phone number and a form" is an observation. "Their front desk likely fields repetitive scheduling calls" is an inference drawn from it. Inferences are allowed and valuable, but the observation underneath must be cited.

ESTIMATION RULES:
- For each opportunity, estimate hours per week currently spent on that manual work by a typical business of this type and size. Be conservative and state it as a plain number.
- Do not produce dollar figures. Cost is calculated downstream from your hour estimates.
- Set confidence honestly: 0.9 when the page states the process outright, 0.6 when you are inferring from strong signals, 0.4 when it is an educated guess about the industry.

TONE: You are writing for a colleague who will use this to start a conversation, not for the prospect. Be specific and plain. No marketing language.`;

export interface ResearchOutput {
  companySummary: string;
  servicesOffered: string[];
  painPoints: Array<{
    title: string;
    rationale: string;
    confidence: number;
    evidence: Array<{ pageId: string; quote: string }>;
  }>;
  opportunities: Array<{
    title: string;
    workflow: string;
    tooling: string[];
    hoursPerWeek: number;
    effortDays: number;
    confidence: number;
    evidence: Array<{ pageId: string; quote: string }>;
  }>;
  talkingPoints: string[];
  overallConfidence: number;
}

export function buildResearchPrompt(input: {
  companyName: string;
  industry: string | null;
  city: string | null;
  region: string | null;
  employeeCount: number | null;
  detectedSoftware: string[];
  signals: Record<string, boolean>;
  pages: CrawledPage[];
}): string {
  const pageBlocks = input.pages
    .map((p) => `<page id="${p.id}" url="${p.url}" title="${p.title.replace(/"/g, "'")}">\n${p.text}\n</page>`)
    .join('\n\n');

  const observedSignals = Object.entries(input.signals)
    .map(([k, v]) => `- ${k.replace(/([A-Z])/g, ' $1').toLowerCase().trim()}: ${v ? 'yes' : 'no'}`)
    .join('\n');

  return `<company>
Name: ${input.companyName}
Industry: ${input.industry ?? 'unknown'}
Location: ${[input.city, input.region].filter(Boolean).join(', ') || 'unknown'}
Employees: ${input.employeeCount ?? 'unknown'}
</company>

<detected_software>
${input.detectedSoftware.length ? input.detectedSoftware.join(', ') : 'None detected in page source'}
</detected_software>

<automated_signals>
${observedSignals}
</automated_signals>

<pages>
${pageBlocks}
</pages>

Analyze this company and respond with JSON matching exactly this shape:

{
  "companySummary": "3-4 sentences on what they do, who they serve, and how they appear to operate day to day.",
  "servicesOffered": ["service", "..."],
  "painPoints": [
    {
      "title": "Short label, under 10 words",
      "rationale": "2-3 sentences. State the observation, then the inference.",
      "confidence": 0.0,
      "evidence": [{ "pageId": "p1", "quote": "exact text copied from that page" }]
    }
  ],
  "opportunities": [
    {
      "title": "What you would automate",
      "workflow": "2-3 sentences describing the automation concretely: trigger, steps, output.",
      "tooling": ["n8n", "Power Automate", "..."],
      "hoursPerWeek": 0,
      "effortDays": 0,
      "confidence": 0.0,
      "evidence": [{ "pageId": "p2", "quote": "exact text copied from that page" }]
    }
  ],
  "talkingPoints": ["A specific thing to mention in a first email, grounded in the pages above."],
  "overallConfidence": 0.0
}

Return between 2 and 5 pain points and between 2 and 4 opportunities. Every pain point and opportunity needs at least one evidence quote. Return only the JSON object.`;
}
