'use client';

import { useId, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Field({ label, hint, error, children, className }: {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  children: (id: string) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-[12px] font-medium mb-1.5">{label}</label>
      {children(id)}
      {hint && !error && <p className="text-[11px] text-muted mt-1">{hint}</p>}
      {error && <p className="text-[11px] text-blocked mt-1">{error}</p>}
    </div>
  );
}

/**
 * A list of short strings (titles, industries, places) edited as chips.
 * Enter or comma adds; backspace on an empty input removes the last.
 */
export function ListInput({ id, value, onChange, placeholder, max = 30 }: {
  id?: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  max?: number;
}) {
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const items = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (!items.length) return;
    onChange([...new Set([...value, ...items])].slice(0, max));
    setDraft('');
  };
  return (
    <div className="min-h-9 w-full rounded-md border border-hairline bg-surface px-2 py-1 flex flex-wrap items-center gap-1 focus-within:border-accent">
      {value.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded bg-raised text-[12px]">
          {v}
          <button type="button" aria-label={`Remove ${v}`} className="text-muted hover:text-ink"
                  onClick={() => onChange(value.filter((x) => x !== v))}>
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft); }
          if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => add(draft)}
        placeholder={value.length ? '' : placeholder}
        className={cn('flex-1 min-w-[120px] h-7 bg-transparent text-sm outline-none placeholder:text-muted')}
      />
    </div>
  );
}

/** Multi-select as toggle chips, for enums like signal types or claim types. */
export function ChipSelect<T extends string>({ options, value, onChange, labels }: {
  options: readonly T[];
  value: T[];
  onChange: (next: T[]) => void;
  labels: Record<T, string>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button key={o} type="button" aria-pressed={on}
                  onClick={() => onChange(on ? value.filter((v) => v !== o) : [...value, o])}
                  className={cn('h-7 px-2.5 rounded-full text-micro border transition-colors',
                    on ? 'border-accent bg-accent-soft text-accent' : 'border-hairline text-muted hover:bg-raised')}>
            {labels[o]}
          </button>
        );
      })}
    </div>
  );
}
