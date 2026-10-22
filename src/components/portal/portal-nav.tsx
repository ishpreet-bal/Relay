'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/portal', label: 'Overview' },
  { href: '/portal/meetings', label: 'Meetings' },
  { href: '/portal/campaigns', label: 'Campaigns' },
  { href: '/portal/apps', label: 'Applications' },
  { href: '/portal/profile', label: 'Your business' },
];

/** Portal tabs. Keeps a staff member's "view as" client on every link. */
export function PortalNav() {
  const pathname = usePathname();
  const clientId = useSearchParams().get('clientId');
  const suffix = clientId ? `?clientId=${encodeURIComponent(clientId)}` : '';
  return (
    <nav aria-label="Portal" className="flex gap-1 overflow-x-auto">
      {LINKS.map((l) => {
        const active = l.href === '/portal' ? pathname === '/portal' : pathname.startsWith(l.href);
        return (
          <Link key={l.href} href={`${l.href}${suffix}`} aria-current={active ? 'page' : undefined}
                className={cn('h-9 px-3 inline-flex items-center text-[13px] border-b-2 -mb-px whitespace-nowrap',
                  active ? 'border-accent text-ink font-medium' : 'border-transparent text-muted hover:text-ink')}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
