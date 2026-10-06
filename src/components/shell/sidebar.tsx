'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, Microscope, Send, FileText,
  Globe, ShieldBan, Settings, Layers, LayoutTemplate,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Role } from '@prisma/client';
import { can, type Permission } from '@/lib/rbac';

// Navigation follows the pipeline in order: discover, research, draft, review,
// send, close. The order is the workflow, so it doubles as documentation.
const NAV: Array<{ href: string; label: string; icon: typeof Users; permission: Permission; badge?: 'held' }> = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, permission: 'lead:read' },
  { href: '/leads', label: 'Leads', icon: Users, permission: 'lead:read' },
  { href: '/research', label: 'Research', icon: Microscope, permission: 'research:read' },
  { href: '/review', label: 'Review queue', icon: Send, permission: 'message:read', badge: 'held' },
  { href: '/campaigns', label: 'Campaigns', icon: Layers, permission: 'campaign:read' },
  { href: '/solutions', label: 'Solution library', icon: LayoutTemplate, permission: 'lead:read' },
  { href: '/proposals', label: 'Proposals', icon: FileText, permission: 'proposal:read' },
  { href: '/portfolios', label: 'Demo sites', icon: Globe, permission: 'portfolio:read' },
  { href: '/suppression', label: 'Do not contact', icon: ShieldBan, permission: 'suppression:read' },
  { href: '/settings', label: 'Settings', icon: Settings, permission: 'settings:read' },
];

export function Sidebar({ role, pendingReview = 0 }: { role: Role; pendingReview?: number }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="w-[228px] shrink-0 border-r border-hairline bg-surface flex flex-col">
      <div className="h-14 flex items-center gap-2.5 px-4 border-b border-hairline">
        <div className="size-6 rounded bg-accent grid place-items-center text-white font-display text-[13px] font-bold">
          F
        </div>
        <span className="font-display font-semibold tracking-display">Foundry</span>
      </div>

      <ul className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {NAV.filter((item) => can(role, item.permission)).map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group flex items-center gap-2.5 rounded-md px-2.5 h-8 text-[13px] transition-colors',
                  active ? 'bg-accent-soft text-accent font-medium' : 'text-muted hover:bg-raised hover:text-ink',
                )}
              >
                <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                <span className="flex-1">{item.label}</span>
                {item.badge === 'held' && pendingReview > 0 && (
                  <span className="num text-[11px] px-1.5 h-[18px] grid place-items-center rounded-full bg-held/15 text-held">
                    {pendingReview}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="p-3 border-t border-hairline">
        <p className="eyebrow mb-1">Your role</p>
        <p className="text-micro text-muted">
          {role === 'OPERATOR' || role === 'ADMIN' || role === 'OWNER'
            ? 'You can approve and send outreach.'
            : 'You can draft, but not send.'}
        </p>
      </div>
    </nav>
  );
}
