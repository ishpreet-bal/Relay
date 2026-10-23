import type { ClaimType, MessageStatus, PersonalizationTier, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { complete, parseJson } from './provider';
import { MODELS } from './pricing';
import { lintDraft, hasBlockers, type LintFinding } from './lint';
import { PERSONALIZE_PROMPT_VERSION, PERSONALIZE_SYSTEM, buildPersonalizePrompt, type PersonalizeOutput } from './prompts/personalize';
import { findSuppression } from '@/server/services/suppression';
import { logActivity } from '@/server/services/activity';
import { advanceAccountStatus } from '@/server/services/accounts';
import { buildLedger } from '@/server/verification/ledger';
import { verifyClaims } from '@/server/verification/claims';
import { decideApproval } from '@/server/verification/policy';
import type { LedgerFact, ReportedClaim, VerificationResult } from '@/server/verification/types';

export class PersonalizeError extends Error {
  constructor(
    message: string,
    public code: 'NO_CONTACT' | 'NO_EMAIL' | 'SUPPRESSED' | 'CONTEXTUAL_DISABLED' | 'NO_OFFER' | 'MODEL_FAILED',
  ) {
    super(message);
    this.name = 'PersonalizeError';
  }
}

export interface DraftOptions {
  organizationId: string;
  contactId: string;
  campaignId?: string;
  campaignStepId?: string;
  /** For drafts outside a campaign. Campaign settings win when present. */
  offerSummary?: string;
  toneGuidelines?: string | null;
  bannedPhrases?: string[];
  stepPurpose?: string;
  stepInstructions?: string;
  allowContextual?: boolean;
  userId?: string | null;
}

/** Statuses a draft can land in. Approval by policy is the only automatic path past review. */
function statusFor(blockers: boolean, verification: VerificationResult, autoApproved: boolean): MessageStatus {
  if (blockers || verification.status === 'BLOCKED' || verification.status === 'UNSUPPORTED') return 'NEEDS_EDIT';
  return autoApproved ? 'APPROVED' : 'DRAFT';
}

/**
 * Generates, verifies and files one draft.
 *
 * The model may only use the fact ledger and must report each specific
 * sentence with the fact behind it. Every draft then passes the linter and
 * claim-level verification. In a campaign that allows it, a draft that is
 * fully verified above the threshold is approved by policy; everything else
 * waits in the review queue. Nothing here sends — the send gate does that.
 */
export async function draftMessage(opts: DraftOptions) {
  const contact = await db.contact.findFirst({
    where: { id: opts.contactId, organizationId: opts.organizationId, deletedAt: null },
    include: {
      account: true,
      client: { include: { offers: { where: { isActive: true }, orderBy: { createdAt: 'asc' }, take: 1 } } },
      organization: { select: { brandName: true, name: true, allowContextual: true, contextualPauseReason: true } },
    },
  });
  if (!contact) throw new PersonalizeError('Contact not found.', 'NO_CONTACT');
  if (!contact.email) throw new PersonalizeError('This contact has no email address.', 'NO_EMAIL');
  if (contact.doNotEmail || contact.account.doNotContact) {
    throw new PersonalizeError('This contact may not be emailed.', 'SUPPRESSED');
  }
  const block = await findSuppression({
    organizationId: opts.organizationId, clientId: contact.clientId, channel: 'EMAIL', email: contact.email,
  });
  if (block) throw new PersonalizeError('This address is on the do-not-contact list.', 'SUPPRESSED');

  const campaign = opts.campaignId
    ? await db.campaign.findFirst({
        where: { id: opts.campaignId, organizationId: opts.organizationId },
        include: { offer: true, playbook: true, mailbox: true, steps: true },
      })
    : null;
  const step = campaign?.steps.find((s) => s.id === opts.campaignStepId) ?? null;

  const offer = campaign?.offer ?? contact.client.offers[0] ?? null;
  const offerSummary = offer?.summary ?? campaign?.offerBrief ?? opts.offerSummary;
  if (!offerSummary) {
    throw new PersonalizeError('No offer is configured for this client. Add one before drafting.', 'NO_OFFER');
  }

  const ledger = await buildLedger({ accountId: contact.accountId, contactId: contact.id, clientId: contact.clientId });
  // The offer itself is a statement the client approved about itself.
  const offerFact: LedgerFact = {
    id: 's0', kind: 'sender', claimType: null,
    statement: [offerSummary, offer?.valueProposition].filter(Boolean).join('. '),
    sourceUrl: null, sourceQuote: null, evidenceStatus: 'VERIFIED',
    eventDate: null, detectedAt: null, firmographic: false,
  };
  const facts = [offerFact, ...ledger.facts];

  const tier: PersonalizationTier = ledger.hasResearch ? 'VERIFIED' : 'CONTEXTUAL';
  if (tier === 'CONTEXTUAL') {
    if (!contact.organization.allowContextual) {
      throw new PersonalizeError(
        contact.organization.contextualPauseReason ?? 'Industry-only drafts are turned off for this workspace.',
        'CONTEXTUAL_DISABLED',
      );
    }
    if (opts.allowContextual === false || campaign?.allowContextual === false) {
      throw new PersonalizeError(
        'Nothing specific is known about this company yet, and drafts without research are off for this campaign.',
        'CONTEXTUAL_DISABLED',
      );
    }
  }

  const previous = await db.message.findMany({
    where: { contactId: contact.id, direction: 'OUTBOUND', sentAt: { not: null } },
    orderBy: { sentAt: 'asc' },
    select: { subject: true, bodyText: true, sentAt: true },
    take: 4,
  });

  const senderName = campaign?.mailbox?.fromName ?? contact.client.senderName ?? contact.organization.brandName ?? contact.organization.name;
  const angles = Array.isArray(campaign?.playbook?.messagingAngles)
    ? (campaign!.playbook!.messagingAngles as Array<{ name?: string; description?: string }>)
        .filter((a) => a?.name).map((a) => ({ name: a.name!, description: a.description ?? '' }))
    : [];
  const bannedPhrases = campaign?.bannedPhrases ?? opts.bannedPhrases ?? [];

  const completion = await complete({
    organizationId: opts.organizationId,
    kind: 'personalize',
    entityId: contact.accountId,
    attribution: { clientId: contact.clientId, accountId: contact.accountId, contactId: contact.id, campaignId: campaign?.id },
    promptVersion: PERSONALIZE_PROMPT_VERSION,
    model: MODELS.personalize,
    // Slightly warm: identical phrasing across a batch is what we avoid.
    temperature: 0.6,
    maxTokens: 1500,
    json: true,
    system: PERSONALIZE_SYSTEM,
    user: buildPersonalizePrompt({
      recipient: { firstName: contact.firstName, title: contact.title, company: contact.account.name },
      sender: { name: senderName, title: contact.client.senderTitle, company: contact.client.name },
      offer: { summary: offerSummary, valueProposition: offer?.valueProposition ?? null, callToAction: offer?.callToAction ?? 'A short call' },
      facts,
      contextual: tier === 'CONTEXTUAL',
      step: {
        order: step?.order ?? 0,
        purpose: step?.purpose ?? opts.stepPurpose ?? 'opener',
        instructions: step?.instructions ?? opts.stepInstructions ?? 'First contact. Earn a reply, nothing more.',
      },
      angles,
      toneGuidelines: campaign?.toneGuidelines ?? opts.toneGuidelines,
      bannedPhrases,
      previousMessages: previous.map((m) => ({ subject: m.subject ?? '', body: m.bodyText ?? '', sentAt: m.sentAt!.toDateString() })),
    }),
  });

  let output: PersonalizeOutput;
  try {
    output = parseJson<PersonalizeOutput>(completion.text);
  } catch (err) {
    throw new PersonalizeError(`Model returned malformed output: ${err instanceof Error ? err.message : 'unknown'}`, 'MODEL_FAILED');
  }

  const subject = (output.subject ?? '').trim();
  const bodyText = (output.body ?? '').trim();
  const approvedClaimTypes: ClaimType[] = campaign?.approvedClaimTypes?.length
    ? campaign.approvedClaimTypes
    : campaign?.playbook?.approvedClaimTypes ?? [];

  const checked = checkDraft({
    subject, body: bodyText, tier, facts, reported: output.claims ?? [], approvedClaimTypes, bannedPhrases,
    knownEntities: [contact.firstName, contact.lastName, contact.account.name, contact.client.name, senderName, senderName.split(' ')[0]]
      .filter((x): x is string => !!x),
  });

  const decision = decideApproval({
    mode: campaign?.approvalMode ?? 'REVIEW_ALL',
    threshold: campaign?.autoApproveThreshold ?? 0.92,
    approvedClaimTypes,
    verification: checked.verification,
    hasLintBlockers: hasBlockers(checked.findings),
    tier,
    campaignActive: campaign?.status === 'ACTIVE',
  });
  const status = statusFor(hasBlockers(checked.findings), checked.verification, decision.autoApprove);

  const message = await db.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        organizationId: opts.organizationId,
        clientId: contact.clientId,
        accountId: contact.accountId,
        contactId: contact.id,
        campaignId: campaign?.id ?? null,
        campaignStepId: step?.id ?? null,
        mailboxId: campaign?.mailboxId ?? null,
        direction: 'OUTBOUND',
        status,
        subject,
        bodyText,
        bodyHtml: renderHtml(bodyText),
        personalizationTier: tier,
        contextualReason: tier === 'CONTEXTUAL' ? 'No verified research or signals for this company yet.' : null,
        personalizationFacts: facts as unknown as Prisma.InputJsonValue,
        lintFindings: checked.findings as unknown as Prisma.InputJsonValue,
        verificationStatus: checked.verification.status,
        verificationScore: checked.verification.score,
        verificationSummary: { ...checked.verification.summary, policyReasons: decision.reasons } as Prisma.InputJsonValue,
        verifiedAt: new Date(),
        approvalSource: decision.autoApprove ? 'POLICY' : null,
        approvalPolicy: decision.snapshot as unknown as Prisma.InputJsonValue,
        approvedAt: decision.autoApprove ? new Date() : null,
        model: completion.model,
        promptVersion: PERSONALIZE_PROMPT_VERSION,
        generationCostCents: completion.costCents,
        stepOrder: step?.order ?? null,
        angle: output.angle?.slice(0, 120) ?? null,
        ctaType: output.ctaType ?? null,
        signalIds: [...new Set(checked.verification.claims.map((c) => c.signalId).filter((x): x is string => !!x))],
        accountScoreAtSend: contact.account.score,
        contactScoreAtSend: contact.score,
      },
    });
    await saveClaims(tx, opts.organizationId, created.id, checked.verification);
    return created;
  });

  await advanceAccountStatus(contact.accountId, 'QUALIFIED');
  if (decision.autoApprove) {
    await db.auditLog.create({
      data: {
        organizationId: opts.organizationId, userId: null, action: 'message.auto_approve', entityType: 'Message',
        entityId: message.id, after: decision.snapshot as unknown as Prisma.InputJsonValue,
      },
    });
  }
  logger.info('draft.created', {
    messageId: message.id, tier, status, verification: checked.verification.status, score: checked.verification.score,
  });

  return { message, tier, findings: checked.findings, verification: checked.verification, decision, selfCritique: output.selfCritique };
}

/** Lint and claim verification, shared by drafting and human edits. */
export function checkDraft(params: {
  subject: string;
  body: string;
  tier: PersonalizationTier;
  facts: LedgerFact[];
  reported: ReportedClaim[];
  approvedClaimTypes: readonly ClaimType[];
  bannedPhrases: string[];
  knownEntities: string[];
}) {
  const findings: LintFinding[] = lintDraft({
    subject: params.subject,
    body: params.body,
    tier: params.tier,
    allowedFacts: params.facts.map((f) => f.statement),
    bannedPhrases: params.bannedPhrases,
  });
  const verification = verifyClaims({
    subject: params.subject,
    body: params.body,
    reported: params.reported,
    ledger: params.facts,
    approvedClaimTypes: params.approvedClaimTypes,
    knownEntities: params.knownEntities,
  });
  return { findings, verification };
}

export async function saveClaims(tx: Prisma.TransactionClient, organizationId: string, messageId: string, v: VerificationResult) {
  await tx.messageClaim.deleteMany({ where: { messageId } });
  if (!v.claims.length) return;
  await tx.messageClaim.createMany({
    data: v.claims.map((c) => ({
      organizationId, messageId,
      text: c.text, kind: c.kind, claimType: c.claimType, status: c.status, supportScore: c.supportScore,
      approvedType: c.approvedType, factId: c.factId, signalId: c.signalId, proofPointId: c.proofPointId,
      sourceUrl: c.sourceUrl, sourceQuote: c.sourceQuote, evidenceDate: c.evidenceDate,
      freshnessDays: c.freshnessDays, reason: c.reason,
    })),
  });
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
{{sender_identification}}<br>
<a href="{{unsubscribe_url}}" style="color:#8a8a8a;">Unsubscribe</a>
</p>
</div>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export async function regenerate(messageId: string, organizationId: string, userId: string | null) {
  const original = await db.message.findFirstOrThrow({ where: { id: messageId, organizationId } });
  if (!original.contactId) throw new PersonalizeError('This draft has no contact.', 'NO_CONTACT');
  const result = await draftMessage({
    organizationId,
    contactId: original.contactId,
    campaignId: original.campaignId ?? undefined,
    campaignStepId: original.campaignStepId ?? undefined,
    userId,
  });
  await db.$transaction([
    db.message.update({ where: { id: result.message.id }, data: { revisionOf: original.id } }),
    db.message.update({ where: { id: messageId }, data: { status: 'CANCELLED', failureReason: 'Replaced by a regenerated draft' } }),
  ]);
  await logActivity({
    organizationId, clientId: original.clientId, accountId: original.accountId, contactId: original.contactId,
    userId, type: 'SYSTEM', title: 'Draft regenerated', body: 'The previous draft was replaced.',
  });
  return result;
}
