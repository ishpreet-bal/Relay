export const PERSONALIZE_PROMPT_VERSION = 'personalize/2026-01-15.1';

/**
 * A fact is a single verified statement the model is permitted to reference.
 * In VERIFIED mode facts come from research citations about the recipient's own
 * site. In CONTEXTUAL mode they come from the agency's own industry context
 * library. Either way the model never draws on its general knowledge, which is
 * what keeps the contextual fallback from drifting into invented specifics.
 */
export interface Fact {
  id: string;
  statement: string;
  sourceUrl: string | null;
  kind: 'prospect' | 'agency';
}

const SHARED_RULES = `THE FACT LEDGER IS YOUR ONLY SOURCE OF TRUTH.
You may reference the numbered facts below and nothing else. You may not:
- state or imply anything about their size, revenue, clients, years in business, or software unless a fact says so
- claim you used their product, visited their location, or met them
- name a competitor, client, or mutual connection
- cite statistics, industry benchmarks, or case study results
- promise a specific outcome, percentage, timeline, or dollar figure

Every sentence making a specific claim must be traceable to a fact id, and you will list those mappings in your output.

VOICE:
- One person emailing another, not a company emailing a lead.
- 90 to 140 words of body. Shorter is better.
- No flattery openers ("I came across your impressive website"). No "I hope this finds you well." No "quick question." No "circling back." No false urgency.
- Lead with the observation, not with who you are.
- One idea. One ask, and a small one: a reply, or fifteen minutes.
- Plain sentences. If a sentence sounds like marketing copy, rewrite it.
- Use the recipient's first name at most once.
- Hedge honestly about their internals: "looks like" and "if that's still handled manually" are correct; asserting you know their process is not.

SUBJECT LINE: 4-8 words, sentence case, no colons, no "Re:", no clickbait.
SIGN-OFF: sender's first name only.`;

export const PERSONALIZE_SYSTEM_VERIFIED = `You write short, specific first-contact emails for an AI automation agency. The recipient is a busy owner or manager at a small business who did not ask to hear from you.

${SHARED_RULES}

Your facts come from the recipient's own website. Use them. The email should make it obvious you actually read their site — a specific, checkable observation in the first two sentences.`;

export const PERSONALIZE_SYSTEM_CONTEXTUAL = `You write short first-contact emails for an AI automation agency. The recipient is a busy owner or manager at a small business who did not ask to hear from you.

IMPORTANT CONTEXT: research could not extract anything citable from this company's website. You therefore know nothing specific about this business beyond its industry and city.

${SHARED_RULES}

Your facts are about the SENDING AGENCY's own experience, not the recipient. This changes what you can write:
- Do not pretend to know anything about this specific company. No "I noticed", "I saw on your site", "it looks like your team".
- You may speak about the industry in general terms and about the agency's own work, but general industry statements must be phrased as the sender's experience, not as facts about the recipient. Write "Most of the ${'{'}industry{'}'} teams we work with lose hours to X" — not "You're probably losing hours to X."
- Be honest that this is a cold introduction. A short, direct, unpresumptuous email is the goal.
- The ask should be smaller than usual: an invitation to reply if it's relevant, not a meeting request.
- Never fabricate a reason for reaching out to them specifically.

A short honest email beats a longer one pretending to be personalized.`;

export interface PersonalizeOutput {
  subject: string;
  body: string;
  factsUsed: Array<{ factId: string; sentence: string }>;
  selfCritique: string;
}

export function buildPersonalizePrompt(input: {
  companyName: string;
  contactFirstName: string | null;
  contactTitle: string | null;
  city: string | null;
  industry: string | null;
  facts: Fact[];
  tier: 'VERIFIED' | 'CONTEXTUAL';
  senderName: string;
  agencyName: string;
  offerBrief: string;
  toneGuidelines?: string | null;
  bannedPhrases: string[];
  stepPurpose: string;
  stepInstructions: string;
  previousMessages?: Array<{ subject: string; body: string; sentAt: string }>;
}): string {
  const ledger = input.facts
    .map((f) => `[${f.id}] ${f.statement}${f.sourceUrl ? `\n     source: ${f.sourceUrl}` : ''}`)
    .join('\n');

  const thread = input.previousMessages?.length
    ? `\n<already_sent_to_them>\n${input.previousMessages
        .map((m) => `Sent ${m.sentAt}\nSubject: ${m.subject}\n${m.body}`).join('\n\n')}\n</already_sent_to_them>\n\nDo not repeat points you already made. This message must add something new.\n`
    : '';

  return `<recipient>
Company: ${input.companyName}
Contact: ${input.contactFirstName ?? 'unknown first name'}${input.contactTitle ? `, ${input.contactTitle}` : ''}
Location: ${input.city ?? 'unknown'}
Industry: ${input.industry ?? 'unknown'}
</recipient>

<fact_ledger kind="${input.tier === 'VERIFIED' ? 'facts about the recipient' : "the sending agency's own experience"}">
${ledger || 'EMPTY'}
</fact_ledger>

<sender>
Name: ${input.senderName}
Agency: ${input.agencyName}
What we do: ${input.offerBrief}
${input.toneGuidelines ? `Tone notes: ${input.toneGuidelines}` : ''}
</sender>

<this_message>
Purpose: ${input.stepPurpose}
Instructions: ${input.stepInstructions}
</this_message>
${thread}
${input.bannedPhrases.length ? `<never_use>\n${input.bannedPhrases.join('\n')}\n</never_use>\n` : ''}
Write the email. Respond with JSON matching exactly this shape:

{
  "subject": "...",
  "body": "Body text with real line breaks between paragraphs. Sign off with the sender's first name. Do not include an unsubscribe line; one is appended automatically.",
  "factsUsed": [{ "factId": "f1", "sentence": "The sentence from your body that uses this fact." }],
  "selfCritique": "One sentence on the weakest part of this email, or 'none'."
}

Return only the JSON object.`;
}


/* ---------------------------------------------------------------------------
 * Contextual path — used when research produced no verified facts.
 *
 * The email still goes out, but it is honest about what it doesn't know. It
 * speaks to the industry and the region, never to the company. The risk with
 * this path is drift: over hundreds of sends, "businesses like yours" quietly
 * becomes "your scheduling system." The linter in personalize.ts exists to
 * catch that, and this prompt is written to make it rare.
 * ------------------------------------------------------------------------- */

export const CONTEXTUAL_SYSTEM = `You write short first-contact emails on behalf of an AI automation agency. This email is different from your usual work: you were unable to learn anything specific about this recipient's business, and the email must not pretend otherwise.

YOU KNOW ONLY: their company name, their industry, and their city. Nothing else.

ABSOLUTE RULES:
- Do not claim to have looked at their website, read about them, seen their work, or noticed anything about them. You did not.
- Do not describe their services, tools, team, size, clients, or processes. You do not know them.
- Do not say "I noticed", "I saw", "I came across", "looking at your", "your team", "your current", or any phrase implying knowledge of their operations.
- Do not cite statistics, percentages, industry benchmarks, or results from other clients.
- Do not name any software.
- Speak about the industry in general terms and be explicit that you are doing so. "Most ${'${industry}'} shops we work with" is honest. "Your shop" is not.
- Do not manufacture a reason for reaching out. "We work with a lot of trades businesses in the area" is a real reason. "I was impressed by your website" is a lie.

VOICE:
- 60 to 100 words. Shorter than a researched email, because you have less to say. Do not pad it.
- Lead with what you do for businesses in their industry, in one plain sentence.
- One small ask: a reply, or fifteen minutes.
- No greeting flattery. No "I hope this finds you well." No false urgency.
- The email should read as a straightforward, low-pressure introduction from a local firm. That is what it is.

SUBJECT LINE: 4-7 words, sentence case, about the industry or the offer. Never implies familiarity with them.`;

export function buildContextualPrompt(input: {
  companyName: string;
  contactFirstName: string | null;
  city: string | null;
  industry: string | null;
  senderName: string;
  agencyName: string;
  offerBrief: string;
  industryExamples: string[];
  toneGuidelines?: string | null;
  bannedPhrases: string[];
}): string {
  return `<recipient>
Company: ${input.companyName}
Contact: ${input.contactFirstName ?? 'unknown first name'}
Industry: ${input.industry ?? 'unknown'}
City: ${input.city ?? 'unknown'}
</recipient>

<what_we_know>
Nothing beyond the four lines above. Research could not read their website.
</what_we_know>

<what_we_do_for_this_industry>
${input.industryExamples.length ? input.industryExamples.map((e) => `- ${e}`).join('\n') : '- General workflow automation'}
</what_we_do_for_this_industry>

<sender>
Name: ${input.senderName}
Agency: ${input.agencyName}
What we do: ${input.offerBrief}
${input.toneGuidelines ? `Tone notes: ${input.toneGuidelines}` : ''}
</sender>
${input.bannedPhrases.length ? `\n<never_use>\n${input.bannedPhrases.join('\n')}\n</never_use>\n` : ''}
Write the email. Respond with JSON matching exactly this shape:

{
  "subject": "...",
  "body": "The email body, real line breaks between paragraphs, signed off with the sender's first name. No unsubscribe line; one is appended automatically.",
  "factsUsed": [],
  "selfCritique": "One sentence: does this email claim anything about them that you do not actually know? Answer honestly."
}

Return only the JSON object.`;
}
