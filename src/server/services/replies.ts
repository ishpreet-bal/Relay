import type { ReplyClass } from '@prisma/client';

/**
 * First-pass reply classification. Deliberately conservative: it only labels
 * replies whose wording is unambiguous and leaves everything else
 * UNCLASSIFIED for a person to read. A wrong "positive" sends a caller after
 * someone who said no; a wrong "unsubscribe" is merely cautious — so the
 * rules lean towards the cautious mistakes.
 */

/** The reply itself, without the quoted thread underneath. */
export function ownText(body: string): string {
  return (body.split(/\n\s*(>|On .+ wrote:|-{2,}\s*Original Message|From: .+\n)/)[0] ?? body).trim();
}

const OUT_OF_OFFICE = [
  /\b(out of (the )?office|ooo|on (annual |parental |maternity )?leave|on vacation|away from (my|the) (desk|office))\b/i,
  /\b(automatic|auto-?)reply\b/i,
  /\bi('m| am) (currently )?(out|away|travell?ing)\b.*\b(until|returning|back on)\b/i,
];

const OPT_OUT = [
  /\bunsubscribe\b/i,
  /\b(stop|quit) (emailing|contacting|messaging|calling) (me|us)\b/i,
  /\b(remove|take) (me|us) (from|off) (your |the )?(list|mailing|emails?)/i,
  /\bdo not (contact|email|call|reach out)/i,
  /\bplease stop\b/i,
];

const NEGATIVE = [
  /\bnot (interested|a fit|a good fit|looking)\b/i,
  /\bno,? thanks?\b|\bno thank you\b/i,
  /\bwe('re| are) (all set|good|covered|happy with)\b/i,
  /\bnot (at this time|right now)\b/i,
];

const REFERRAL = [
  /\b(you should|you'll want to|better to) (talk|speak|reach out|connect) (to|with)\b/i,
  /\b(the right person|best person|person who handles)\b/i,
  /\bi('ve| have) (cc'?d|copied|forwarded)\b/i,
];

const POSITIVE = [
  /\b(i'?m|we'?re|i am|we are) interested\b/i,
  /\bsend (me |us )?(some |more )?(info|information|details|pricing|a quote|rates)\b/i,
  /\b(let'?s|happy to|glad to|open to|would like to) (chat|talk|connect|meet|set up|book|schedule|speak)\b/i,
  /\b(give me|feel free to) (a )?call\b|\bcall me\b/i,
  /\bwhat (times?|days?) (work|are you)\b|\bhow about (monday|tuesday|wednesday|thursday|friday)\b/i,
  /\bsounds (good|interesting|great)\b/i,
];

export function isOptOut(body: string) {
  return OPT_OUT.some((p) => p.test(ownText(body)));
}

export function classifyReply(subject: string | null, body: string): ReplyClass {
  const text = ownText(body);
  const head = `${subject ?? ''}\n${text}`;
  if (OUT_OF_OFFICE.some((p) => p.test(head))) return 'OUT_OF_OFFICE';
  if (OPT_OUT.some((p) => p.test(text))) return 'UNSUBSCRIBE';
  const negative = NEGATIVE.some((p) => p.test(text));
  const positive = POSITIVE.some((p) => p.test(text));
  // Mixed signals ("not right now, but send me info") need a human.
  if (negative && positive) return 'UNCLASSIFIED';
  if (negative) return 'NEGATIVE';
  if (REFERRAL.some((p) => p.test(text))) return 'REFERRAL';
  if (positive) return 'POSITIVE';
  return 'UNCLASSIFIED';
}
