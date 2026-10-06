import { cn } from '@/lib/utils';

export function Kpi({ label, value, caption, tone, className }: {
  label: string;
  value: React.ReactNode;
  caption?: React.ReactNode;
  tone?: 'positive' | 'warning' | 'negative';
  className?: string;
}) {
  return (
    <div className={cn('card p-4', className)}>
      <p className="eyebrow mb-1.5">{label}</p>
      <p className={cn('num text-xl font-medium',
        tone === 'positive' && 'text-cleared', tone === 'warning' && 'text-held', tone === 'negative' && 'text-blocked')}>
        {value}
      </p>
      {caption && <p className="text-[11px] text-muted mt-1">{caption}</p>}
    </div>
  );
}

export function pct(value: number | null | undefined, digits = 1) {
  return value === null || value === undefined ? '—' : `${(value * 100).toFixed(digits)}%`;
}
