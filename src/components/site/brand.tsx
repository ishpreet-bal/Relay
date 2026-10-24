import { BRAND } from '@/site/config';

/**
 * The brand mark: two nodes and the path between them, a handoff. Drawn
 * with currentColor so it works on light and dark.
 */
export function Mark({ className = 'size-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" fill="none">
      <rect x="1" y="1" width="30" height="30" rx="9" fill="currentColor" />
      <circle cx="10.5" cy="20.5" r="3.6" className="fill-site-paper" />
      <circle cx="21.5" cy="11.5" r="3.6" className="stroke-site-paper" strokeWidth="2.2" />
      <path d="M13.6 18.2c2.6-1.3 2.1-4.4 4.7-5.6" className="stroke-site-paper" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Mark className="size-7 text-site-signal" />
      <span className="font-serif text-[1.45rem] leading-none tracking-[-0.03em]" style={{ fontVariationSettings: "'opsz' 72, 'SOFT' 60" }}>
        {BRAND.name}
      </span>
    </span>
  );
}
