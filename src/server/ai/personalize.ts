import { db } from '@/lib/db';
import { complete, parseJson } from './provider';
import { MODELS } from './pricing';
import { lintDraft, hasBlockers, type LintFinding } from './lint';
import {
  PERSONALIZE_SYSTEM_VERIFIED, PERSONALIZE_PROMPT_VERSION, buildPersonalizePrompt,
  PERSONALIZE_SYSTEM_CONTEXTUAL, buildContextualPrompt, type PersonalizeOutput, type Fact,
} from './prompts/personalize';
import { isSuppressed } from '@/server/services/suppression';
import { logActivity } from '@/server/services/crm';
import type { PersonalizationTier } from '@prisma/client';

export class PersonalizeError extends Error {
  constructor(message: string, public code: 'NO_CONTACT' | 'SUPPRESSED' | 'CONTEXTUAL_DISABLED' | 'MODEL_FAILED') {
    super(message);
    this.name = 'PersonalizeError';
  }
}

/**
 * Builds the fact ledger from research that survived grounding. This is the
 * only bridge between research and drafting, and it is deliberately narrow:
 * if a claim didn't survive verification in Phase 3, it does not exist here,
 * so the personalization model cannot reach it even if it wanted to.
 */
function buildFactLedger(research: {
  painPoints: unknown; opportunities: unknown; servicesOffered: string[]; detectedSoftware: string[];
}): Fact[] {
  const facts: Fact[] = [];
  let n = 1;

  type Grounded = { title: string; rationale?: string; workflow?: string; citations: Array<{ url: string; quote: string }> };

  const pains = (research.painPoints ?? []) as Grounded[];
  for (const p of pains) {
    const citation = p.citations?.[0];
    if (!citation) continue;
    facts.push({
      id: `f${n++}`,
      statement: `${p.title}. ${p.rationale ?? ''} Their own page says: "${citation.quote}"`.trim(),
      sourceUrl: citation.url,
    });
  }

  const opps = (research.opportunities ?? []) as Grounded[];
  for (const o of opps) {
    const citation = o.citations?.[0];
    if (!citation) continue;
    facts.push({
      id: `f${n++}`,
      statement: `Opportunity: ${o.title}. ${o.workflow ?? ''}`.trim(),
      sourceUrl: citation.url,
    });
  }

  if (research.servicesOffered?.length) {
    facts.push({
      id: `f${n++}`,
      statement: `They list these services: ${research.servicesOffered.slice(0, 8).join(', ')}.`,
      sourceUrl: 'research:services',
    });
  }
  if (research.detectedSoftware?.length) {
    facts.push({
      id: `f${n++}`,
      statement: `Software detected on their site: ${research.detectedSoftware.join(', ')}.`,
      sourceUrl: 'research:software',
    });
  }

  return facts;
}

/** Fallback context when there are no verified facts — industry-level only. */
const INDUSTRY_EXAMPLES: Record<string, string[]> = {
  dental: ['Recall and appointment reminders that stop no-shows', 'Insurance verification without the phone tag'],
  medical: ['Intake forms that land in the chart automatically', 'Referral tracking without a spreadsheet'],
  law: ['Client intake and conflict checks', 'Document assembly from matter data'],
  accounting: ['Client document chasing during season', 'Automated engagement letters and reminders'],
  hvac: ['Dispatch and job scheduling', 'Quote follow-up that happens on its own'],
  electrical: ['Job costing pulled from field data', 'Automatic permit and inspection tracking'],
  plumbing: ['After-hours call intake and triage', 'Invoice chasing without the awkward phone call'],
  construction: ['Daily site reports without paperwork', 'Subcontractor document and insurance tracking'],
  manufacturing: ['Production reporting off the floor data you already collect', 'Quote-to-order handoff'],
  logistics: ['Proof-of-delivery capture and filing', 'Carrier status updates pushed to customers'],
  warehouse: ['Inventory counts that reconcile themselves', 'Pick-list generation from orders'],
  'auto repair': ['Service reminders based on last visit', 'Estimate approvals by text'],
  'car dealership': ['Lead routing from every listing site into one place', 'Service booking confirmations'],
  'property management': ['Maintenance request intake and routing', 'Lease renewal reminders'],
  insurance: ['Renewal and policy review reminders', 'Claim document collection'],
  engineering: ['Drawing revision tracking', 'Timesheet and project cost rollups'],
};

function industryExamplesFor(industry: string | null): string[] {
  if (!industry) return [];
  const key = Object.keys(INDUSTRY_EXAMPLES).find((k) => industry.toLowerCase().includes(k));
  return key ? INDUSTRY_EXAMPLES[key]! : [];
}

export interface DraftOptions {
  organizationId: string;
  leadId: string;
  contactId?: string;
  campaignId?: string;
  campaignStepId?: string;
  senderName: string;
  offerBrief: string;
  toneGuidelines?: string | null;
  bannedPhrases?: string[];
  stepPurpose?: string;
  stepInstructions?: string;
  /** Set false to refuse contextual drafts entirely for this run. */
  allowContextual?: boolean;
}

/**
 * Generates one draft. Never sends. The output always lands in DRAFT or
 * NEEDS_EDIT — reaching APPROVED requires a human action in the review queue.
 */
export async function draftMessage(opts: DraftOptions) {
  const lead = await db.lead.findFirstOrThrow({
    where: { id: opts.leadId, organizationId: opts.organizationId, deletedAt: null },
    include: {
      research: true,
      contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
      organization: { select: { brandName: true, name: true, allowContextual: true, contextualPauseReason: true } },
    },
  });

  const contact = opts.contactId
    ? lead.contacts.find((c) => c.id === opts.contactId)
    : lead.contacts.find((c) => c.email) ?? lead.contacts[0];

  if (!contact?.email) {
    throw new PersonalizeError('This lead has no contact with an email address.', 'NO_CONTACT');
  }
  if (await isSuppressed(opts.organizationId, contact.email)) {
    throw new PersonalizeError('This address is on the do-not-contact list.', 'SUPPRESSED');
  }

  const facts = lead.research?.status === 'SUCCEEDED' ? buildFactLedger(lead.research) : [];
  const tier: PersonalizationTier = facts.length > 0 ? 'VERIFIED' : 'CONTEXTUAL';

  // Two switches, either of which blocks: the campaign's own setting, and the
  // org-level one that the performance guardrail can flip on its own.
  if (tier === 'CONTEXTUAL') {
    if (!lead.organization.allowContextual) {
      throw new PersonalizeError(
        lead.organization.contextualPauseReason
          ?? 'Industry-only drafts are turned off for this workspace.',
        'CONTEXTUAL_DISABLED',
      );
    }
    if (opts.allowContextual === false) {
      throw new PersonalizeError(
        'Research found nothing usable and industry-only drafts are off for this campaign.',
        'CONTEXTUAL_DISABLED',
      );
    }
  }

  const agencyName = lead.organization.brandName ?? lead.organization.name;
  const previous = await db.message.findMany({
    where: { leadId: lead.id, direction: 'OUTBOUND', status: { in: ['SENT', 'DELIVERED', 'OPENED', 'CLICKED'] } },
    orderBy: { sentAt: 'asc' },
    select: { subject: true, bodyText: true, sentAt: true },
    take: 3,
  });

  const completion = await complete({
    organizationId: opts.organizationId,
    kind: 'personalize',
    entityId: lead.id,
    promptVersion: PERSONALIZE_PROMPT_VERSION,
    model: MODELS.personalize,
    // Slightly warmer than research: this is prose, and identical phrasing
    // across a batch is exactly the thing we're trying to avoid.
    temperature: 0.7,
    maxTokens: 1500,
    json: true,
    system: tier === 'VERIFIED' ? PERSONALIZE_SYSTEM_VERIFIED : PERSONALIZE_SYSTEM_CONTEXTUAL,
    user: tier === 'VERIFIED'
      ? buildPersonalizePrompt({
          companyName: lead.companyName,
          contactFirstName: contact.firstName,
          contactTitle: contact.title,
          city: lead.city,
          industry: lead.industry,
          facts,
          senderName: opts.senderName,
          agencyName,
          offerBrief: opts.offerBrief,
          toneGuidelines: opts.toneGuidelines,
          bannedPhrases: opts.bannedPhrases ?? [],
          stepPurpose: opts.stepPurpose ?? 'opener',
          stepInstructions: opts.stepInstructions ?? 'First contact. Earn a reply, nothing more.',
          previousMessages: previous.map((m) => ({
            subject: m.subject ?? '', body: m.bodyText ?? '', sentAt: m.sentAt?.toDateString() ?? '',
          })),
        })
      : buildContextualPrompt({
          companyName: lead.companyName,
          contactFirstName: contact.firstName,
          city: lead.city,
          industry: lead.industry,
          senderName: opts.senderName,
          agencyName,
          offerBrief: opts.offerBrief,
          industryExamples: industryExamplesFor(lead.industry),
          toneGuidelines: opts.toneGuidelines,
          bannedPhrases: opts.bannedPhrases ?? [],
        }),
  });

  let output: PersonalizeOutput;
  try {
    output = parseJson<PersonalizeOutput>(completion.text);
  } catch (err) {
    throw new PersonalizeError(
      `Model returned malformed output: ${err instanceof Error ? err.message : 'unknown'}`,
      'MODEL_FAILED',
    );
  }

  // Verify the model's own fact mapping — a claimed fact id that isn't in the
  // ledger means it referenced something that doesn't exist.
  const ledgerIds = new Set(facts.map((f) => f.id));
  const personalizationFacts = (output.factsUsed ?? [])
    .filter((u) => ledgerIds.has(u.factId))
    .map((u) => {
      const fact = facts.find((f) => f.id === u.factId)!;
      return { claim: u.sentence, statement: fact.statement, sourceUrl: fact.sourceUrl, factId: fact.id };
    });

  const orphaned = (output.factsUsed ?? []).filter((u) => !ledgerIds.has(u.factId));

  const findings: LintFinding[] = lintDraft({
    subject: output.subject ?? '',
    body: output.body ?? '',
    tier,
    allowedFacts: facts.map((f) => f.statement),
    bannedPhrases: opts.bannedPhrases,
  });

  for (const o of orphaned) {
    findings.push({
      severity: 'block',
      rule: 'orphan-fact',
      message: `Cited fact ${o.factId}, which is not in the ledger.`,
      excerpt: o.sentence,
    });
  }

  const bodyText = (output.body ?? '').trim();
  const bodyHtml = renderHtml(bodyText);

  const message = await db.message.create({
    data: {
      organizationId: opts.organizationId,
      leadId: lead.id,
      contactId: contact.id,
      campaignId: opts.campaignId ?? null,
      campaignStepId: opts.campaignStepId ?? null,
      direction: 'OUTBOUND',
      // A draft with blockers cannot be approved in one click; it lands in
      // NEEDS_EDIT and the reviewer must engage with the findings.
      status: hasBlockers(findings) ? 'NEEDS_EDIT' : 'DRAFT',
      subject: output.subject ?? '',
      bodyText,
      bodyHtml,
      personalizationTier: tier,
      personalizationFacts: personalizationFacts as never,
      lintFindings: findings as never,
      model: completion.model,
      promptVersion: PERSONALIZE_PROMPT_VERSION,
      generationCostCents: completion.costCents,
    },
  });

  await db.lead.update({ where: { id: lead.id }, data: { status: 'DRAFTED' } });

  return { message, tier, findings, factsUsed: personalizationFacts, selfCritique: output.selfCritique };
}

/**
 * Wraps the plain-text body in minimal HTML. Deliberately spartan: image-heavy,
 * table-based templates are a spam signal on cold mail, and the goal is for
 * this to look like a message a person typed.
 */
export function renderHtml(bodyText: string) {
  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a;max-width:520px;">
${paragraphs}
<p style="margin:24px 0 0;font-size:12px;color:#8a8a8a;">
<a href="{{unsubscribe_url}}" style="color:#8a8a8a;">Unsubscribe</a>
</p>
</div>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export async function regenerate(messageId: string, organizationId: string, opts: Omit<DraftOptions, 'organizationId' | 'leadId'>) {
  const original = await db.message.findFirstOrThrow({ where: { id: messageId, organizationId } });
  const result = await draftMessage({ ...opts, organizationId, leadId: original.leadId, contactId: original.contactId ?? undefined });
  await db.message.update({
    where: { id: result.message.id },
    data: { revisionOf: original.id },
  });
  await db.message.update({ where: { id: messageId }, data: { status: 'CANCELLED' } });
  await logActivity({
    organizationId, leadId: original.leadId, type: 'SYSTEM',
    title: 'Draft regenerated', body: 'The previous draft was replaced.',
  });
  return result;
}
