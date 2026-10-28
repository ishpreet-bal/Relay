import { AlertTriangle, Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export function EmptyState({ icon: Icon, title, children, action, className }: {
  icon?: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('card p-10 text-center', className)}>
      {Icon && <Icon className="size-7 mx-auto text-muted mb-3" strokeWidth={1.5} />}
      <h3 className="font-display font-semibold mb-1">{title}</h3>
      {children && <div className="text-sm text-muted max-w-md mx-auto">{children}</div>}
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Loading({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn('flex items-center gap-2 p-6 text-micro text-muted', className)}>
      <Loader2 className="size-4 animate-spin" /> {label}
    </div>
  );
}

export function ErrorNote({ error, className }: { error: { message: string } | null | undefined; className?: string }) {
  if (!error) return null;
  return (
    <p role="alert" className={cn('flex items-start gap-1.5 text-[12px] text-blocked', className)}>
      <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
      <span>{error.message}{/session needs attention|Sign in again|UNAUTHORIZED|Sign in and select/i.test(error.message) && <Link href="/workspace" className="block underline mt-2">Sign in or select a workspace →</Link>}</span>
    </p>
  );
}

/** A clearly labelled "not connected" state — never a fake value. */
export function NotConfigured({ what, children }: { what: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-hairline bg-raised/50 px-3 py-2.5 text-[12px] text-muted">
      <span className="font-medium text-ink">{what} isn&apos;t connected.</span> {children}
    </div>
  );
}
