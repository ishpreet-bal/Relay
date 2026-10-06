'use client';

import { useId, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Scores are shown as their parts. "86" alone is not trusted or tuned;
 * "Fit 36/40 · Contact 18/20 · Signals 14/20 · Engagement 10/10 · Data 8/10",
 * each with its reasons, is. These components read the stored breakdown
 * (services/scoring) and degrade gracefully for accounts not yet rescored.
 */

export interface ScoreReason { label: string; points: number; tone: 'positive' | 'neutral' | 'negative' }
export interface ScoreComponent { key: string; label: string; points: number; max: number; reasons: ScoreReason[] }
export interface ScoreBreakdownData { version: 2; total: number; components: ScoreComponent[]; flags: string[]; summary: string }

export function parseBreakdown(value: unknown): ScoreBreakdownData | null {
  const v = value as Partial<ScoreBreakdownData> | null;
  return v && v.version === 2 && Array.isArray(v.components) ? (v as ScoreBreakdownData) : null;
}

function toneFor(score: number) {
  return score >= 70 ? 'text-cleared' : score >= 45 ? 'text-held' : 'text-muted';
}

/** Compact score with a segmented bar; hover or focus shows the parts. */
export function ScoreBadge({ score, breakdown, overridden, size = 'sm' }: {
  score: number;
  breakdown: unknown;
  overridden?: boolean;
  size?: 'sm' | 'lg';
}) {
  const parsed = parseBreakdown(breakdown);
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className="relative inline-flex items-center gap-2">
      <span className={cn('num font-medium tabular-nums', size === 'lg' ? 'text-2xl' : 'text-[13px]', toneFor(score))}>
        {score}
        {overridden && <span className="text-[10px] text-muted align-super" title="Set by hand">*</span>}
      </span>
      {parsed ? (
        <button
          type="button"
          aria-describedby={open ? id : undefined}
          aria-label={`Score ${score} of 100. Show breakdown.`}
          onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
          className={cn('flex gap-px rounded-sm overflow-hidden', size === 'lg' ? 'w-48 h-2.5' : 'w-20 h-1.5')}
        >
          {parsed.components.map((c) => (
            <span key={c.key} style={{ flexGrow: c.max }} className="relative bg-hairline overflow-hidden">
              <span
                className={cn('absolute inset-y-0 left-0 origin-left animate-meter-fill',
                  score >= 70 ? 'bg-cleared' : score >= 45 ? 'bg-held' : 'bg-muted')}
                style={{ width: `${(c.points / c.max) * 100}%` }}
              />
            </span>
          ))}
        </button>
      ) : (
        <span className="text-[11px] text-muted">not scored yet</span>
      )}
      {open && parsed && (
        <div id={id} role="tooltip" className="absolute z-30 top-full left-0 mt-2 w-72 card shadow-pop p-3 animate-fade-up">
          <ScoreParts breakdown={parsed} compact />
        </div>
      )}
    </div>
  );
}

/** The full explanation: each component, its points, and why. */
export function ScoreParts({ breakdown, compact = false }: { breakdown: ScoreBreakdownData; compact?: boolean }) {
  return (
    <div className="space-y-2.5">
      {breakdown.flags.length > 0 && (
        <p className="text-[11px] font-medium text-blocked">{breakdown.flags.join(' · ')}</p>
      )}
      <ul className="space-y-2">
        {breakdown.components.map((c) => (
          <li key={c.key}>
            <div className="flex items-center gap-2">
              <span className="text-micro font-medium flex-1">{c.label}</span>
              <span className="num text-micro text-muted">{c.points}/{c.max}</span>
            </div>
            <div className="h-1 rounded-full bg-hairline overflow-hidden mt-1">
              <div className="h-full bg-accent/70" style={{ width: `${(c.points / c.max) * 100}%` }} />
            </div>
            {compact ? (
              c.reasons[0] && <p className="text-[11px] text-muted leading-snug mt-0.5">{c.reasons[0].label}</p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {c.reasons.map((r, i) => (
                  <li key={i} className={cn('text-[11px] leading-snug',
                    r.tone === 'positive' ? 'text-ink' : r.tone === 'negative' ? 'text-blocked' : 'text-muted')}>
                    {r.label}{r.points ? <span className="num text-muted"> · +{r.points}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-hairline pt-2">
        <span className="text-micro font-medium">Total</span>
        <span className="num text-micro">{breakdown.total}/100</span>
      </div>
    </div>
  );
}
