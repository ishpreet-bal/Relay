'use client';

import type { RouterOutputs } from '@/lib/trpc/types';
import { cn } from '@/lib/utils';

type Funnel = RouterOutputs['analytics']['funnel']['funnel'];

const STAGES: Array<{ key: keyof Funnel; label: string; hint?: string }> = [
  { key: 'accountsDiscovered', label: 'Accounts found' },
  { key: 'accountsQualified', label: 'Good fit', hint: 'Fit score of 28/40 or more' },
  { key: 'contactsFound', label: 'Contacts found' },
  { key: 'emailsSent', label: 'Emails sent' },
  { key: 'replies', label: 'Replies', hint: 'Excluding out-of-office' },
  { key: 'positiveReplies', label: 'Positive replies' },
  { key: 'callsAttempted', label: 'Calls made' },
  { key: 'connections', label: 'Conversations' },
  { key: 'meetingsBooked', label: 'Meetings booked' },
  { key: 'meetingsHeld', label: 'Meetings held' },
  { key: 'opportunities', label: 'Opportunities' },
  { key: 'dealsWon', label: 'Won' },
];

/**
 * The funnel as a ranked list of bars. Stages are counted independently in
 * the window (an email sent this month may be to an account found last
 * month), so the step-to-step percentage is labelled as a ratio, not a
 * conversion rate.
 */
export function FunnelView({ funnel, compact = false }: { funnel: Funnel; compact?: boolean }) {
  const stages = compact ? STAGES.filter((s) => ['accountsDiscovered', 'emailsSent', 'replies', 'connections', 'meetingsBooked', 'meetingsHeld', 'dealsWon'].includes(s.key)) : STAGES;
  const max = Math.max(1, ...stages.map((s) => Number(funnel[s.key])));
  return (
    <ol className="space-y-1.5" aria-label="Funnel">
      {stages.map((s, i) => {
        const value = Number(funnel[s.key]);
        const prev = i > 0 ? Number(funnel[stages[i - 1]!.key]) : null;
        const ratio = prev ? value / prev : null;
        return (
          <li key={s.key} className="grid grid-cols-[130px_1fr_56px_52px] sm:grid-cols-[160px_1fr_64px_64px] items-center gap-2 text-micro">
            <span className="truncate" title={s.hint}>{s.label}</span>
            <span className="h-5 bg-raised rounded-sm overflow-hidden" aria-hidden>
              <span className={cn('block h-full rounded-r-[4px]', s.key === 'meetingsBooked' || s.key === 'dealsWon' ? 'bg-accent' : 'bg-accent/45')}
                    style={{ width: `${Math.max(value ? 1.5 : 0, (value / max) * 100)}%` }} />
            </span>
            <span className="num text-right">{value.toLocaleString('en-CA')}</span>
            <span className="num text-right text-[11px] text-muted" title={prev !== null ? `${s.label} ÷ ${stages[i - 1]!.label}` : undefined}>
              {ratio !== null && Number.isFinite(ratio) ? `${(ratio * 100).toFixed(ratio < 0.1 ? 1 : 0)}%` : ''}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function WindowSelect({ days, onChange }: { days: number; onChange: (d: number) => void }) {
  return (
    <div role="group" aria-label="Time window" className="inline-flex rounded-md border border-hairline overflow-hidden">
      {[30, 90, 180, 365].map((d) => (
        <button key={d} type="button" aria-pressed={days === d} onClick={() => onChange(d)}
                className={cn('h-8 px-3 text-micro num', days === d ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-raised')}>
          {d === 365 ? '1y' : `${d}d`}
        </button>
      ))}
    </div>
  );
}
