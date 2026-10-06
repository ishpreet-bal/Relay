import { cn } from '@/lib/utils';

export type Tone = 'neutral' | 'accent' | 'positive' | 'warning' | 'negative';

const TONE: Record<Tone, string> = {
  neutral: 'bg-raised text-muted border border-hairline',
  accent: 'bg-accent-soft text-accent',
  positive: 'bg-cleared/12 text-cleared',
  warning: 'bg-held/12 text-held',
  negative: 'bg-blocked/10 text-blocked',
};

export function Pill({ tone = 'neutral', children, title, className }: {
  tone?: Tone;
  children: React.ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 h-[20px] px-2 rounded-full text-[11px] font-medium whitespace-nowrap', TONE[tone], className)}>
      {children}
    </span>
  );
}
