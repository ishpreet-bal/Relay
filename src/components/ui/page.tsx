import { cn } from '@/lib/utils';

/** Scrollable page body with a consistent max width and gutters. */
export function PageBody({ children, width = 'default', className }: {
  children: React.ReactNode;
  width?: 'narrow' | 'default' | 'wide' | 'full';
  className?: string;
}) {
  const max = { narrow: 'max-w-3xl', default: 'max-w-5xl', wide: 'max-w-7xl', full: 'max-w-none' }[width];
  return (
    <div className="flex-1 overflow-y-auto">
      <div className={cn('mx-auto px-4 py-5 md:p-6 pb-20 md:pb-6', max, className)}>{children}</div>
    </div>
  );
}

export function Section({ title, hint, action, children, className }: {
  title: string;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="flex items-end gap-3 mb-2.5">
        <div className="flex-1 min-w-0">
          <h2 className="eyebrow">{title}</h2>
          {hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
