'use client';

import { useId, useState } from 'react';
import { cn } from '@/lib/utils';

export interface ScoreSignal {
  key: string; label: string; points: number; max: number; detail?: string;
}

/**
 * The signature element. Rather than a single number, the meter is segmented by
 * scoring signal — each segment's width is that signal's weight, its fill is the
 * points earned. An operator can see at a glance that a 68 is "great contact
 * data, unknown industry" versus "perfect fit, no email", which are opposite
 * problems. The score model is transparent in code, so the UI shows its work.
 */
export function ScoreMeter({
  score, signals, size = 'sm',
}: { score: number; signals: ScoreSignal[]; size?: 'sm' | 'lg' }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const total = signals.reduce((s, x) => s + x.max, 0) || 100;
  const tone = score >= 75 ? 'cleared' : score >= 50 ? 'held' : 'blocked';

  return (
    <div className="relative inline-flex items-center gap-2">
      <span
        className={cn(
          'num tabular-nums font-medium',
          size === 'lg' ? 'text-2xl' : 'text-[13px]',
          tone === 'cleared' && 'text-cleared',
          tone === 'held' && 'text-held',
          tone === 'blocked' && 'text-muted',
        )}
      >
        {score}
      </span>

      <button
        type="button"
        aria-describedby={open ? id : undefined}
        aria-label={`Score ${score} of 100. Show breakdown.`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={cn('flex gap-px rounded-sm overflow-hidden', size === 'lg' ? 'w-48 h-2.5' : 'w-20 h-1.5')}
      >
        {signals.map((s) => (
          <span
            key={s.key}
            style={{ flexGrow: s.max / total }}
            className="relative bg-hairline overflow-hidden"
          >
            <span
              className={cn(
                'absolute inset-y-0 left-0 origin-left animate-meter-fill',
                tone === 'cleared' && 'bg-cleared',
                tone === 'held' && 'bg-held',
                tone === 'blocked' && 'bg-muted',
              )}
              style={{ width: `${(s.points / s.max) * 100}%` }}
            />
          </span>
        ))}
      </button>

      {open && (
        <div
          id={id}
          role="tooltip"
          className="absolute z-30 top-full left-0 mt-2 w-64 card shadow-pop p-3 animate-fade-up"
        >
          <p className="eyebrow mb-2">Score breakdown</p>
          <ul className="space-y-1.5">
            {signals.map((s) => (
              <li key={s.key} className="text-micro">
                <div className="flex justify-between gap-2">
                  <span>{s.label}</span>
                  <span className="num text-muted">{s.points}/{s.max}</span>
                </div>
                {s.detail && <p className="text-muted text-[11px] leading-tight">{s.detail}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
