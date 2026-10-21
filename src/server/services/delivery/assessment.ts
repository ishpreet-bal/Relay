import { z } from 'zod';

/**
 * Automation assessment: the inputs behind a value estimate, each with where
 * it came from, and the projection computed from them. The projection is a
 * scenario (low and high), never a measured saving; realised savings come
 * only from a live application's own run data.
 */

const source = z.enum(['stated_by_prospect', 'observed', 'research_estimate', 'our_assumption']);
const input = <T extends z.ZodTypeAny>(value: T) => z.object({ value, source }).strict();

export const assessmentSchema = z.object({
  /** How often the task happens. */
  tasksPerWeek: input(z.number().min(0).max(1_000_000)),
  /** Minutes a person spends on one, today. */
  minutesPerTask: input(z.number().min(0).max(24 * 60)),
  /** Share of that time the automation can take over, as a range. */
  automatableShare: input(z.object({ low: z.number().min(0).max(1), high: z.number().min(0).max(1) }).strict().refine((r) => r.low <= r.high, 'low must not exceed high')),
  /** Loaded hourly cost of the people doing it. */
  hourlyCostCents: input(z.number().int().min(0).max(100_000)),
  /** Errors per 100 tasks and what one costs, when known. */
  errorRatePct: input(z.number().min(0).max(100)).optional(),
  costPerErrorCents: input(z.number().int().min(0).max(10_000_000)).optional(),
  /** Qualitative: how hard the data and integrations are. */
  dataAvailability: z.enum(['digital_structured', 'digital_unstructured', 'mixed', 'paper']).optional(),
  integrationComplexity: z.enum(['none', 'low', 'medium', 'high']).optional(),
  risks: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
  notes: z.string().trim().max(2000).optional(),
}).strict();

export type Assessment = z.infer<typeof assessmentSchema>;

const WEEKS_PER_MONTH = 52 / 12;
/** Automation rarely removes errors entirely. */
const ERROR_REDUCTION = 0.5;

export function projectValue(a: Assessment, price?: { setupCents: number; monthlyCents: number }) {
  const hoursPerMonthToday = (a.tasksPerWeek.value * a.minutesPerTask.value / 60) * WEEKS_PER_MONTH;
  const errorsPerMonth = a.errorRatePct && a.costPerErrorCents ? a.tasksPerWeek.value * WEEKS_PER_MONTH * a.errorRatePct.value / 100 : 0;
  const scenario = (share: number) => {
    const hours = hoursPerMonthToday * share;
    const laborCents = hours * a.hourlyCostCents.value;
    const errorCents = errorsPerMonth * ERROR_REDUCTION * share * (a.costPerErrorCents?.value ?? 0);
    const monthlyCents = Math.round(laborCents + errorCents);
    const netMonthly = monthlyCents - (price?.monthlyCents ?? 0);
    return {
      hoursPerMonth: Math.round(hours * 10) / 10,
      monthlyValueCents: monthlyCents,
      annualValueCents: monthlyCents * 12,
      paybackMonths: price && netMonthly > 0 ? Math.ceil(price.setupCents / netMonthly) : null,
    };
  };
  const sources = Object.entries(a)
    .filter(([, v]) => v && typeof v === 'object' && 'source' in (v as object))
    .map(([k, v]) => ({ input: k, source: (v as { source: string }).source }));
  const unverified = sources.filter((s) => s.source === 'research_estimate' || s.source === 'our_assumption').map((s) => s.input);
  return {
    kind: 'PROJECTED' as const,
    hoursPerMonthToday: Math.round(hoursPerMonthToday * 10) / 10,
    low: scenario(a.automatableShare.value.low),
    high: scenario(a.automatableShare.value.high),
    sources,
    note: unverified.length
      ? `Projected from inputs that include unconfirmed estimates (${unverified.join(', ')}). Confirm them with the prospect before quoting.`
      : 'Projected from inputs the prospect stated or we observed. A projection, not a measured saving.',
  };
}

export type Projection = ReturnType<typeof projectValue>;
