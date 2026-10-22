import { addDays } from 'date-fns';
import type { OpportunityTier, PipelineSettings, PipelineStage, Prisma, SignalType } from '@prisma/client';
import type { AccountScore, ScoreReason } from '@/server/services/scoring/types';

/**
 * Stage 2: preliminary qualification from cheap, deterministic evidence —
 * fit with the client's ICP, recent business events, an active website,
 * signs of operational complexity, and how complete and reachable the record
 * is. No model call, so it can run over every stored company.
 *
 * A low score never deletes anything: the account is SCREENED_OUT, kept, and
 * screened again when a new signal arrives or its refresh comes due.
 */

export interface ScreeningInput {
  score: AccountScore | null;
  hasWebsite: boolean;
  /** The website answered and confirmed the business the last time it was read. */
  websiteConfirmed: boolean;
  employeeCount: number | null;
  locations: number;
  hasPhone: boolean;
  contacts: number;
  signals: Array<{ type: SignalType; eventDate: Date | null; detectedAt: Date }>;
  doNotContact: boolean;
  now?: Date;
}

export interface ScreeningResult {
  score: number;
  reasons: ScoreReason[];
  tier: OpportunityTier;
  advance: boolean;
  flags: string[];
}

const ACTIVITY: SignalType[] = ['HIRING', 'EXPANSION', 'NEW_LOCATION', 'NEW_PRODUCT', 'NEW_CONTRACT', 'FUNDING', 'TECHNOLOGY_CHANGE', 'LEADERSHIP_CHANGE'];

function componentShare(score: AccountScore | null, key: string) {
  const c = score?.components.find((x) => x.key === key);
  return c && c.max > 0 ? Math.max(0, Math.min(1, c.points / c.max)) : 0;
}

export function screenAccount(input: ScreeningInput, settings: Pick<PipelineSettings, 'screeningThreshold'>): ScreeningResult {
  const now = input.now ?? new Date();
  const reasons: ScoreReason[] = [];
  const add = (label: string, points: number, tone: ScoreReason['tone'] = points > 0 ? 'positive' : 'neutral') =>
    reasons.push({ label, points: Math.round(points), tone });

  // ICP fit, from the existing explained account score (40).
  const fit = componentShare(input.score, 'fit') * 40;
  add(input.score ? `ICP fit ${Math.round(fit)}/40` : 'Not scored against an ICP yet', fit, input.score ? (fit >= 20 ? 'positive' : 'neutral') : 'negative');

  // Recent business events, the most useful cheap signal of change (20).
  const recent = input.signals.filter((s) => ACTIVITY.includes(s.type) && (s.eventDate ?? s.detectedAt) >= addDays(now, -180));
  const activity = Math.min(20, recent.length * 8 + componentShare(input.score, 'signals') * 8);
  add(recent.length ? `${recent.length} business event${recent.length === 1 ? '' : 's'} in the last 6 months` : 'No recent business events', activity);

  // An active website: something to research, and a sign the business operates (10).
  const site = input.websiteConfirmed ? 10 : input.hasWebsite ? 6 : 0;
  add(input.websiteConfirmed ? 'Website confirmed' : input.hasWebsite ? 'Has a website' : 'No website: little to research', site, input.hasWebsite ? 'positive' : 'negative');

  // Operational complexity: enough people and places for repeated admin work (15).
  let complexity = 0;
  if (input.employeeCount !== null) {
    complexity += input.employeeCount >= 10 && input.employeeCount <= 500 ? 10 : input.employeeCount > 500 ? 6 : input.employeeCount >= 5 ? 5 : 1;
  }
  if (input.locations > 1) complexity += 5;
  add(input.employeeCount === null && input.locations <= 1 ? 'Size unknown' : `Operational scale${input.locations > 1 ? `, ${input.locations} locations` : ''}`, Math.min(15, complexity));

  // Completeness of what we know (10).
  const data = componentShare(input.score, 'data') * 10;
  add('Record completeness', data);

  // Reachable through a published business channel (5).
  const reach = input.contacts > 0 ? 5 : input.hasPhone ? 3 : 0;
  add(input.contacts > 0 ? 'Has a business contact' : input.hasPhone ? 'Has a main phone line' : 'No way to reach them yet', reach, reach ? 'positive' : 'negative');

  const flags = [...(input.score?.flags ?? [])];
  if (input.doNotContact && !flags.includes('Do not contact')) flags.push('Do not contact');
  const score = Math.round(Math.max(0, Math.min(100, fit + activity + site + Math.min(15, complexity) + data + reach)));
  const suppressed = flags.length > 0;
  const tier: OpportunityTier = suppressed ? 'SUPPRESSED'
    : score >= 75 ? 'HOT'
    : score >= settings.screeningThreshold ? 'WARM'
    : score >= 35 ? 'EXPLORATORY'
    : 'LOW';
  return { score, reasons, tier, flags, advance: !suppressed && score >= settings.screeningThreshold };
}

/**
 * The stage after screening. Screening moves records between DISCOVERED,
 * SCREENED_OUT and QUALIFIED only; it never undoes research, and never
 * overrides a stage a person set.
 */
export function stageAfterScreening(current: PipelineStage, pinned: boolean, advance: boolean): PipelineStage {
  if (pinned || current === 'ANALYZED' || current === 'DEEP_RESEARCHED') return current;
  return advance ? 'QUALIFIED' : 'SCREENED_OUT';
}

/** When the record is next due a freshness check, by priority. */
export function refreshDue(tier: OpportunityTier, stage: PipelineStage, settings: PipelineSettings, from = new Date()) {
  const days = stage === 'SCREENED_OUT' ? settings.refreshDaysScreenedOut
    : tier === 'HOT' ? settings.refreshDaysHot
    : tier === 'WARM' ? settings.refreshDaysWarm
    : tier === 'EXPLORATORY' ? settings.refreshDaysExploratory
    : settings.refreshDaysLow;
  return addDays(from, days);
}

export function reasonsJson(r: ScreeningResult): Prisma.InputJsonValue {
  return { reasons: r.reasons, flags: r.flags } as unknown as Prisma.InputJsonValue;
}
