/**
 * Stage 4 deep research: from verified facts about one business to a
 * reviewed hypothesis of where automation could help, what it might be
 * worth, what we don't know, and how to open a conversation.
 *
 * The model sees only facts that survived grounding in stage 3, each with an
 * id. Every claim it makes must cite those ids; anything it infers is a
 * hypothesis by construction; anything it can't know from outside goes in
 * unknowns as a question for a discovery call. Website text never reaches
 * this prompt directly — only verified statements — which also keeps page
 * content from steering the model.
 */

export const DEEP_RESEARCH_PROMPT_VERSION = 'deep-research/2026-10-23.service-fit.1';

export const DEEP_RESEARCH_SYSTEM = `You assess whether a business could benefit from what our company sells (the offers listed), and in particular from workflow automation, for a team deciding whether and how to approach it.

You are given verified facts about the business, each with an id like "f3". They are the only things you know about it. Rules:
1. Every process, opportunity and contact strategy you describe must cite the ids of the facts it rests on in evidenceFactIds. If you cannot cite at least one fact, leave the item out.
2. Everything you infer is a hypothesis. Say what would confirm or refute it. Never present internal processes, software, headcount or pain as known: you have only seen the outside.
3. Hours estimates are ranges for one recurring task, with the assumptions written out. Use conservative numbers. Leave estimatedHours null when there is no reasonable basis.
4. Put what can only be learned by asking the business in unknowns, phrased as discovery-call questions.
5. Match opportunities only to solutions in the catalogue provided, by slug, and only when the fit is direct. An empty list is fine.
6. Do not name or describe individual people, and do not suggest contact details. Contact strategy is about the angle and channel, not who.
7. overallFit is 0-100: how strong the evidence is that this business has a problem we can solve, not how big the business is.
8. serviceFit: one entry per offer listed, by its exact name. fit is strong, possible, weak or none. strong and possible must cite facts; say in the rationale what you observed and what you are inferring. proposal is the specific first engagement we could propose to this business for that offer, in one sentence, or empty when fit is none.`;

export interface DeepResearchContext {
  company: { name: string; industry: string | null; city: string | null; region: string | null; employeeCount: number | null; website: string | null };
  summary: string | null;
  services: string[];
  facts: Array<{ id: string; statement: string; claimType?: string }>;
  signals: Array<{ type: string; title: string; eventDate: string | null }>;
  detectedSoftware: string[];
  observedSignals: Record<string, boolean>;
  offers: Array<{ name: string; summary: string }>;
  catalogue: Array<{ slug: string; title: string; industry: string; tagline: string }>;
}

export function buildDeepResearchPrompt(ctx: DeepResearchContext) {
  const facts = ctx.facts.map((f) => `- ${f.id}${f.claimType ? ` [${f.claimType}]` : ''}: ${f.statement}`).join('\n') || '(none)';
  const signals = ctx.signals.map((s) => `- ${s.type}: ${s.title}${s.eventDate ? ` (${s.eventDate})` : ''}`).join('\n') || '(none)';
  const observed = Object.entries(ctx.observedSignals).filter(([, v]) => v).map(([k]) => k).join(', ') || '(none)';
  const catalogue = ctx.catalogue.map((c) => `- ${c.slug}: ${c.title} (${c.industry}) — ${c.tagline}`).join('\n') || '(empty)';
  return `<company>
Name: ${ctx.company.name}
Industry: ${ctx.company.industry ?? 'unknown'}
Location: ${[ctx.company.city, ctx.company.region].filter(Boolean).join(', ') || 'unknown'}
Employees: ${ctx.company.employeeCount ?? 'unknown'}
Website: ${ctx.company.website ?? 'none'}
Summary (from stage 3): ${ctx.summary ?? 'none'}
Services: ${ctx.services.join('; ') || 'unknown'}
</company>

<verified_facts>
${facts}
</verified_facts>

<recent_signals>
${signals}
</recent_signals>

<observed_on_website>
Software fingerprints: ${ctx.detectedSoftware.join(', ') || 'none detected'}
Patterns: ${observed}
</observed_on_website>

<our_offers>
${ctx.offers.map((o) => `- "${o.name}": ${o.summary}`).join('\n') || '- "Workflow automation": Workflow automation for small and mid-sized businesses.'}
</our_offers>

<solution_catalogue>
${catalogue}
</solution_catalogue>

Assess this business. Return the JSON object described by the schema.`;
}

const strings = { type: 'array', items: { type: 'string' } };

/** JSON Schema for structured outputs: every object closed, every field required. */
export const DEEP_RESEARCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['businessModel', 'processes', 'opportunities', 'unknowns', 'contactStrategy', 'overallFit', 'serviceFit'],
  properties: {
    businessModel: {
      type: 'object', additionalProperties: false, required: ['description', 'evidenceFactIds'],
      properties: { description: { type: 'string' }, evidenceFactIds: strings },
    },
    processes: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['name', 'description', 'evidenceFactIds'],
        properties: { name: { type: 'string' }, description: { type: 'string' }, evidenceFactIds: strings },
      },
    },
    opportunities: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['title', 'problem', 'proposedAutomation', 'evidenceFactIds', 'howToValidate', 'estimatedHours', 'assumptions', 'integrationBarriers', 'matchingSolutionSlugs', 'confidence'],
        properties: {
          title: { type: 'string' },
          problem: { type: 'string' },
          proposedAutomation: { type: 'string' },
          evidenceFactIds: strings,
          howToValidate: { type: 'string' },
          estimatedHours: {
            anyOf: [
              { type: 'null' },
              { type: 'object', additionalProperties: false, required: ['lowPerWeek', 'highPerWeek'], properties: { lowPerWeek: { type: 'number' }, highPerWeek: { type: 'number' } } },
            ],
          },
          assumptions: strings,
          integrationBarriers: strings,
          matchingSolutionSlugs: strings,
          confidence: { type: 'number' },
        },
      },
    },
    unknowns: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['question', 'whyItMatters'], properties: { question: { type: 'string' }, whyItMatters: { type: 'string' } } },
    },
    contactStrategy: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object', additionalProperties: false, required: ['angle', 'evidenceFactIds', 'channel', 'caution'],
          properties: { angle: { type: 'string' }, evidenceFactIds: strings, channel: { type: 'string', enum: ['email', 'phone', 'either'] }, caution: { type: 'string' } },
        },
      ],
    },
    overallFit: {
      type: 'object', additionalProperties: false, required: ['score', 'rationale'],
      properties: { score: { type: 'number' }, rationale: { type: 'string' } },
    },
    serviceFit: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['offer', 'fit', 'rationale', 'evidenceFactIds', 'proposal'],
        properties: {
          offer: { type: 'string' },
          fit: { type: 'string', enum: ['strong', 'possible', 'weak', 'none'] },
          rationale: { type: 'string' },
          evidenceFactIds: strings,
          proposal: { type: 'string' },
        },
      },
    },
  },
} as const;
