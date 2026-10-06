import { differenceInCalendarDays } from 'date-fns';
import type {
  AccountFacts, AccountScore, ContactFacts, EngagementFacts, IcpCriteria, ScoreComponent, ScoreReason, SignalFacts,
} from './types';
import { reachability, roleFit } from './contact-score';
import { locationMatches, normalizeText, textIncludesAny } from './text';

/**
 * Account opportunity score, 0-100:
 *   Fit 40 · Contact 20 · Signals 20 · Engagement 10 · Data quality 10
 *
 * Fit is measured against the client's ICP, never against a built-in notion of
 * a "good industry". With no ICP, fit is scored neutrally and says so.
 */

export function employeeEstimate(count: number | null, range: string | null): number | null {
  if (count != null) return count;
  if (!range) return null;
  const pair = range.match(/(\d[\d,]*)\D+(\d[\d,]*)/);
  if (pair) return Math.round((Number(pair[1]!.replace(/,/g, '')) + Number(pair[2]!.replace(/,/g, ''))) / 2);
  const single = range.match(/(\d[\d,]*)/);
  return single ? Number(single[1]!.replace(/,/g, '')) : null;
}

function reason(label: string, points: number, tone: ScoreReason['tone']): ScoreReason {
  return { label, points, tone };
}

function component<K extends string>(key: K, label: string, max: number, reasons: ScoreReason[]): ScoreComponent<K> {
  const points = Math.max(0, Math.min(max, reasons.reduce((s, r) => s + r.points, 0)));
  return { key, label, points, max, reasons };
}

// ---------------------------------------------------------------------------
// Fit (40)
// ---------------------------------------------------------------------------

function industryFit(a: AccountFacts, icp: IcpCriteria | null): { reason: ScoreReason; excluded: boolean } {
  const industry = a.industry?.trim() ?? '';
  const searchable = [industry, a.description ?? '', ...a.keywords].join(' ');

  if (icp && icp.excludedIndustries.length && industry && textIncludesAny(industry, icp.excludedIndustries)) {
    return { reason: reason(`${industry} is excluded by the ICP`, 0, 'negative'), excluded: true };
  }
  if (!icp || (!icp.industries.length && !icp.industryKeywords.length)) {
    return { reason: reason('ICP has no industry criteria', 8, 'neutral'), excluded: false };
  }
  if (!industry && !a.description && !a.keywords.length) {
    return { reason: reason('Industry unknown', 0, 'negative'), excluded: false };
  }
  const hit = icp.industries.find((i) => {
    const want = normalizeText(i);
    const have = normalizeText(industry);
    return want && have && (have.includes(want) || want.includes(have));
  });
  if (hit) return { reason: reason(`${industry} — a target industry`, 15, 'positive'), excluded: false };

  const keyword = textIncludesAny(searchable, icp.industryKeywords);
  if (keyword) return { reason: reason(`Mentions "${keyword}"`, 10, 'positive'), excluded: false };

  return { reason: reason(`${industry || 'Industry'} is outside the target industries`, 2, 'negative'), excluded: false };
}

function sizeFit(a: AccountFacts, icp: IcpCriteria | null): ScoreReason {
  const size = employeeEstimate(a.employeeCount, a.employeeRange);
  const min = icp?.employeeMin ?? null;
  const max = icp?.employeeMax ?? null;
  if (min == null && max == null) return reason('ICP has no size criteria', 6, 'neutral');
  if (size == null) return reason('Company size unknown', 2, 'negative');

  const label = `${size.toLocaleString('en-CA')} employees`;
  const lo = min ?? 0;
  const hi = max ?? Number.POSITIVE_INFINITY;
  if (size >= lo && size <= hi) return reason(`${label} — inside ${lo}–${Number.isFinite(hi) ? hi : '∞'}`, 12, 'positive');
  // Close misses still matter: a 550-person company for a 20-500 ICP is a fit.
  if (size >= lo * 0.5 && size <= hi * 1.5) return reason(`${label} — just outside the target range`, 6, 'neutral');
  return reason(`${label} — outside the target range`, 0, 'negative');
}

function locationFit(a: AccountFacts, icp: IcpCriteria | null): ScoreReason {
  if (!icp || !icp.locations.length) return reason('ICP has no location criteria', 7, 'neutral');
  if (!a.city && !a.region && !a.country) return reason('Location unknown', 2, 'negative');
  const where = [a.city, a.region].filter(Boolean).join(', ') || a.country || '';
  const hit = locationMatches(a, icp.locations);
  if (hit) return reason(`${where} — inside the target area (${hit})`, 13, 'positive');
  return reason(`${where} — outside the target area`, 0, 'negative');
}

// ---------------------------------------------------------------------------
// Contact (20): the best person we could reach
// ---------------------------------------------------------------------------

function contactComponent(contacts: ContactFacts[], icp: IcpCriteria | null, employeeCount: number | null) {
  const workable = contacts.filter((c) => !(c.doNotEmail && c.doNotCall));
  if (!workable.length) {
    return component('contact', 'Contact', 20, [
      reason(contacts.length ? 'Every known contact is do-not-contact' : 'No contacts found yet', 0, 'negative'),
    ]);
  }

  // Role is 12 of the 20 points, reachability 8.
  let best: { role: number; reach: number; roleReason: ScoreReason; reachReasons: ScoreReason[] } | null = null;
  for (const c of workable) {
    const r = roleFit(c, icp, employeeCount);
    const reach = reachability(c);
    const role = Math.round((r.points / 50) * 12);
    const reachPts = Math.round((reach.points / 30) * 8);
    if (!best || role + reachPts > best.role + best.reach) {
      best = { role, reach: reachPts, roleReason: r.reason, reachReasons: reach.reasons };
    }
  }
  const b = best!;
  const reachLabel = b.reachReasons.filter((x) => x.points > 0).map((x) => x.label.toLowerCase()).join(', ') || 'no way to reach them yet';
  return component('contact', 'Contact', 20, [
    { ...b.roleReason, points: b.role },
    reason(`Reachable: ${reachLabel}`, b.reach, b.reach >= 6 ? 'positive' : b.reach > 0 ? 'neutral' : 'negative'),
  ]);
}

// ---------------------------------------------------------------------------
// Signals (20)
// ---------------------------------------------------------------------------

const EVIDENCE_WEIGHT = { VERIFIED: 1, PROVIDER_REPORTED: 0.8, UNVERIFIED: 0.5, REJECTED: 0 } as const;

export function signalFreshness(signal: Pick<SignalFacts, 'detectedAt' | 'eventDate'>, now: Date) {
  const age = Math.max(0, differenceInCalendarDays(now, signal.eventDate ?? signal.detectedAt));
  const weight = age <= 30 ? 1 : age <= 90 ? 0.7 : age <= 180 ? 0.4 : 0.15;
  return { age, weight };
}

function signalComponent(signals: SignalFacts[], icp: IcpCriteria | null, now: Date) {
  const scored = signals
    .map((s) => {
      const preferred = !icp || !icp.preferredSignals.length || icp.preferredSignals.includes(s.type);
      const { age, weight } = signalFreshness(s, now);
      const raw = 12 * (preferred ? 1 : 0.5) * EVIDENCE_WEIGHT[s.evidenceStatus] * weight * Math.max(0.3, Math.min(1, s.confidence));
      return { s, age, preferred, points: Math.round(raw) };
    })
    .filter((x) => x.points > 0)
    .sort((a, b) => b.points - a.points);

  if (!scored.length) {
    return component('signals', 'Signals', 20, [reason(signals.length ? 'Signals are stale or unverified' : 'No timely signals found', 0, 'neutral')]);
  }
  return component('signals', 'Signals', 20, scored.slice(0, 3).map(({ s, age, preferred, points }) =>
    reason(
      `${s.title} (${age === 0 ? 'today' : `${age} day${age === 1 ? '' : 's'} ago`}${preferred ? '' : ', not a preferred signal'}${s.evidenceStatus === 'VERIFIED' ? '' : ', unverified'})`,
      points,
      'positive',
    ),
  ));
}

// ---------------------------------------------------------------------------
// Engagement (10)
// ---------------------------------------------------------------------------

function engagementComponent(e: EngagementFacts) {
  const positive = e.replies.some((r) => r.replyClass === 'POSITIVE' || r.replyClass === 'REFERRAL');
  const negative = e.replies.some((r) => r.replyClass === 'NEGATIVE' || r.replyClass === 'UNSUBSCRIBE');
  let r: ScoreReason;
  if (e.meetingsBooked) r = reason('Meeting booked', 10, 'positive');
  else if (positive) r = reason('Replied with interest', 10, 'positive');
  else if (negative) r = reason('Replied, not interested', 0, 'negative');
  else if (e.replies.length) r = reason('Replied', 8, 'positive');
  else if (e.callsConnected) r = reason('Spoke with someone on the phone', 6, 'positive');
  else if (e.clicked) r = reason('Clicked a link in an email', 5, 'positive');
  else if (e.opened >= 2) r = reason(`Opened ${e.opened} emails`, 3, 'neutral');
  else if (e.opened === 1) r = reason('Opened an email', 1, 'neutral');
  else if (e.emailsSent) r = reason(`${e.emailsSent} email${e.emailsSent > 1 ? 's' : ''} sent, no response yet`, 0, 'neutral');
  else r = reason('Not contacted yet', 0, 'neutral');
  return component('engagement', 'Engagement', 10, [r]);
}

// ---------------------------------------------------------------------------
// Data quality (10)
// ---------------------------------------------------------------------------

function dataComponent(a: AccountFacts, contacts: ContactFacts[]) {
  const reachable = contacts.some((c) =>
    (c.email && c.emailVerification === 'VALID' && !c.doNotEmail) || ((c.directPhone || c.mobilePhone) && !c.doNotCall));
  const checks: Array<[boolean, string]> = [
    [!!a.websiteUrl, 'website'],
    [!!a.industry, 'industry'],
    [employeeEstimate(a.employeeCount, a.employeeRange) != null, 'size'],
    [!!(a.city || a.region), 'location'],
    [reachable, 'a verified email or direct phone'],
  ];
  const have = checks.filter(([ok]) => ok).map(([, l]) => l);
  const missing = checks.filter(([ok]) => !ok).map(([, l]) => l);
  const reasons = [reason(have.length ? `Known: ${have.join(', ')}` : 'Almost nothing known yet', have.length * 2, have.length >= 4 ? 'positive' : 'neutral')];
  if (missing.length) reasons.push(reason(`Missing: ${missing.join(', ')}`, 0, 'negative'));
  return component('data', 'Data quality', 10, reasons);
}

// ---------------------------------------------------------------------------

export function scoreAccount(params: {
  account: AccountFacts;
  icp: IcpCriteria | null;
  contacts: ContactFacts[];
  signals: SignalFacts[];
  engagement: EngagementFacts;
  now?: Date;
}): AccountScore {
  const now = params.now ?? new Date();
  const { account, icp } = params;
  const size = employeeEstimate(account.employeeCount, account.employeeRange);

  const industry = industryFit(account, icp);
  const fit = component('fit', 'ICP fit', 40, [industry.reason, sizeFit(account, icp), locationFit(account, icp)]);
  const contact = contactComponent(params.contacts, icp, size);
  const signals = signalComponent(params.signals, icp, now);
  const engagement = engagementComponent(params.engagement);
  const data = dataComponent(account, params.contacts);

  const flags: string[] = [];
  if (account.doNotContact) flags.push('Do not contact');
  if (industry.excluded) flags.push('Excluded industry');

  const components = [fit, contact, signals, engagement, data];
  const total = components.reduce((s, c) => s + c.points, 0);

  return { version: 2, total, components, flags, summary: summarize(components, flags, icp) };
}

function summarize(components: Array<ScoreComponent<string>>, flags: string[], icp: IcpCriteria | null): string {
  if (flags.length) return `${flags.join('; ')}.`;
  const strongest = components
    .flatMap((c) => c.reasons)
    .filter((r) => r.tone === 'positive')
    .sort((a, b) => b.points - a.points)
    .slice(0, 2)
    .map((r) => r.label);
  if (!strongest.length) return icp ? 'Little evidence of fit yet.' : 'No ICP to score against yet.';
  return `${strongest.join('; ')}.`;
}
