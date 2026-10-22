import { formatMoney } from '@/lib/utils';

/** Provider prices are in US dollars; costs are stored in millicents (1/1000 cent). */
export function usd(millicents: number, estimate = false) {
  return `${estimate ? '~' : ''}${formatMoney(Math.round(millicents / 1000), 'USD')}`;
}

export const FREQUENCY_LABELS = {
  MANUAL: 'Manual only', EVERY_6_HOURS: 'Every 6 hours', DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly',
} as const;

export const OUTCOME_LABELS = {
  CREATED: 'New account', UPDATED: 'Enriched existing', DUPLICATE: 'Already on file', EXCLUDED: 'Skipped',
  NEEDS_REVIEW: 'Possible duplicate', FAILED: 'Failed',
} as const;

export const SOURCE_LABELS: Record<string, string> = { google_places: 'Google Places', apollo: 'Apollo' };
