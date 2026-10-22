import { addMonths, differenceInCalendarDays } from 'date-fns';

/**
 * Invoice arithmetic, kept pure. Money is in cents; per-run prices are in
 * thousandths of a cent so small usage prices add up exactly. Nothing here
 * is estimated: usage comes from the platform's own run records.
 */

export interface PriceTerms {
  monthlyCents: number;
  includedRuns: number;
  overageMillicentsPerRun: number;
  setupFeeCents: number;
}

export interface InvoiceLine {
  label: string;
  quantity: number;
  unitMillicents: number;
  amountCents: number;
  kind: 'setup' | 'subscription' | 'usage';
}

export const nextPeriodEnd = (start: Date) => addMonths(start, 1);

const line = (label: string, quantity: number, unitMillicents: number, kind: InvoiceLine['kind']): InvoiceLine => ({
  label, quantity, unitMillicents, amountCents: Math.round((quantity * unitMillicents) / 1000), kind,
});

export function setupLines(t: PriceTerms, appName: string): InvoiceLine[] {
  return t.setupFeeCents > 0 ? [line(`Setup: ${appName}`, 1, t.setupFeeCents * 1000, 'setup')] : [];
}

/**
 * The monthly fee (prorated by days when the period ends early, e.g. an
 * immediate cancellation) plus runs above what is included.
 */
export function periodLines(t: PriceTerms, appName: string, period: { start: Date; end: Date; fullEnd: Date }, runs: number): InvoiceLine[] {
  const fullDays = Math.max(1, differenceInCalendarDays(period.fullEnd, period.start));
  const usedDays = Math.min(fullDays, Math.max(0, differenceInCalendarDays(period.end, period.start)));
  const prorated = usedDays < fullDays;
  const out: InvoiceLine[] = [];
  if (t.monthlyCents > 0) {
    out.push(prorated
      ? line(`${appName}: ${usedDays} of ${fullDays} days`, 1, Math.round((t.monthlyCents * 1000 * usedDays) / fullDays), 'subscription')
      : line(`${appName}: monthly`, 1, t.monthlyCents * 1000, 'subscription'));
  }
  const over = Math.max(0, runs - t.includedRuns);
  if (over > 0 && t.overageMillicentsPerRun > 0) {
    out.push(line(`Workflow runs above ${t.includedRuns.toLocaleString('en-CA')} included (${runs.toLocaleString('en-CA')} this period)`, over, t.overageMillicentsPerRun, 'usage'));
  }
  return out;
}

export const total = (lines: InvoiceLine[]) => lines.reduce((n, l) => n + l.amountCents, 0);
