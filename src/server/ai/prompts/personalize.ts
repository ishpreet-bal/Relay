import type { LedgerFact, ReportedClaim } from '@/server/verification/types';

export const PERSONALIZE_PROMPT_VERSION = 'personalize/2026-10-06.ledger-claims.1';

const RULES = `THE FACT LEDGER IS YOUR ONLY SOURCE OF TRUTH.
There are two kinds of facts:
- PROSPECT facts (ids starting with "f") are about the recipient and their company.
- SENDER facts (ids starting with "s") are approved statements about the company you write for.

You may state something specific about the recipient only if a PROSPECT fact says it, and something specific about the sender only if a SENDER fact says it. You may not:
- add detail the fact does not contain: no new places, numbers, names, dates, or words like "rapidly", "major", "across";
- call something recent, new or current unless the fact gives a date;
- claim you used their product, visited them, met them, or were referred;
- name competitors, customers or mutual connections unless a fact names them;
- cite statistics or promise outcomes, percentages, timelines or dollar figures.

General sales copy that asserts nothing checkable is fine ("We move freight between Ontario and the US every week" is NOT fine unless a SENDER fact says it; "Worth a quick call?" is fine).

You must report every sentence that states something specific about the recipient or the sender, with the fact id it relies on.

VOICE:
- One person writing to another. Plain sentences, no marketing language.
- 70 to 130 words of body. Shorter is better.
- No "I hope this finds you well", no "quick question", no "circling back", no flattery, no false urgency.
- Lead with what is relevant to them, not with who you are.
- One idea and one small ask.
- Use the recipient's first name at most once.

SUBJECT: 3-7 words, sentence case, no colons, no "Re:", no clickbait.
SIGN-OFF: the sender's first name only.`;

export const PERSONALIZE_SYSTEM = `You write short, specific outbound emails for a business-to-business company. The recipient is a busy manager at another company who did not ask to hear from you. The goal is a reply or a short call, nothing more.

${RULES}`;

export interface PersonalizeOutput {
  subject: string;
  body: string;
  claims: ReportedClaim[];
  angle: string;
  ctaType: 'reply' | 'call' | 'meeting' | 'resource' | 'other';
  selfCritique: string;
}

export interface PersonalizeContext {
  recipient: { firstName: string | null; title: string | null; company: string };
  sender: { name: string; title: string | null; company: string };
  offer: { summary: string; valueProposition: string | null; callToAction: string };
  facts: LedgerFact[];
  /** True when there is no research or signal to go on. */
  contextual: boolean;
  step: { purpose: string; instructions: string; order: number };
  angles: Array<{ name: string; description: string }>;
  toneGuidelines?: string | null;
  bannedPhrases: string[];
  previousMessages: Array<{ subject: string; body: string; sentAt: string }>;
}

function ledgerBlock(facts: LedgerFact[]) {
  if (!facts.length) return 'EMPTY';
  return facts
    .map((f) => {
      const when = f.eventDate ? ` (dated ${f.eventDate.toISOString().slice(0, 10)})` : '';
      const type = f.claimType ? ` [${f.claimType}]` : '';
      return `[${f.id}]${type} ${f.statement}${when}`;
    })
    .join('\n');
}

export function buildPersonalizePrompt(ctx: PersonalizeContext): string {
  const thread = ctx.previousMessages.length
    ? `\n<already_sent>\n${ctx.previousMessages.map((m) => `Sent ${m.sentAt}\nSubject: ${m.subject}\n${m.body}`).join('\n\n')}\n</already_sent>\nDo not repeat what was already said. This email must add something new.\n`
    : '';

  const contextualNote = ctx.contextual
    ? `\n<important>Research found nothing specific about this company beyond the basics in the ledger. Do not imply you know more. Write a short, honest introduction that speaks to the recipient's role and the offer.</important>\n`
    : '';

  return `<recipient>
Name: ${ctx.recipient.firstName ?? 'unknown'}
Title: ${ctx.recipient.title ?? 'unknown'}
Company: ${ctx.recipient.company}
</recipient>

<sender>
Name: ${ctx.sender.name}${ctx.sender.title ? `, ${ctx.sender.title}` : ''}
Company: ${ctx.sender.company}
Offer: ${ctx.offer.summary}
${ctx.offer.valueProposition ? `Why it matters: ${ctx.offer.valueProposition}\n` : ''}The ask: ${ctx.offer.callToAction}
${ctx.toneGuidelines ? `Tone: ${ctx.toneGuidelines}` : ''}
</sender>

<fact_ledger>
${ledgerBlock(ctx.facts)}
</fact_ledger>
${contextualNote}
<this_email>
Sequence step ${ctx.step.order + 1}: ${ctx.step.purpose}
Instructions: ${ctx.step.instructions}
${ctx.angles.length ? `Angles you may take: ${ctx.angles.map((a) => `${a.name} (${a.description})`).join('; ')}` : ''}
</this_email>
${thread}${ctx.bannedPhrases.length ? `\n<never_use>\n${ctx.bannedPhrases.join('\n')}\n</never_use>\n` : ''}
Respond with JSON matching exactly this shape:

{
  "subject": "...",
  "body": "Body with real line breaks between paragraphs, signed with the sender's first name. No unsubscribe line; one is added automatically.",
  "claims": [{ "sentence": "the exact sentence from your body", "factId": "f1", "kind": "PROSPECT" }],
  "angle": "short name of the angle you took",
  "ctaType": "reply | call | meeting | resource | other",
  "selfCritique": "One sentence: does any sentence say more than its fact supports?"
}

List every specific sentence in "claims". Use kind "SENDER" for claims about the sender. Return only the JSON object.`;
}
