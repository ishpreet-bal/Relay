'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Building2, Users, Layers, PhoneCall, CalendarCheck, BookOpen, BarChart3, Briefcase,
  ShieldCheck, Plug, Activity, UsersRound, ShieldBan, Settings, Microscope, FileText, Globe, LayoutTemplate, Menu, X, CopyCheck, Radar, Filter, AppWindow, Lightbulb, ClipboardList,
} from 'lucide-react';
import type { Role } from '@prisma/client';
import { cn } from '@/lib/utils';
import { can, ROLE_LABELS, type Permission } from '@/lib/rbac';

interface NavItem {
  href: string;
  label: string;
  icon: typeof Users;
  permission: Permission;
  badge?: keyof NavCounts;
}

export interface NavCounts { review: number; calls: number; duplicates: number }

// Ordered by the work: find and understand prospects, reach them, talk to
// them, then set up and run the machine.
const GROUPS: Array<{ label: string | null; items: NavItem[] }> = [
  {
    label: null,
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'analytics:read' },
      { href: '/calls', label: 'Call queue', icon: PhoneCall, permission: 'call:read', badge: 'calls' },
      { href: '/meetings', label: 'Meetings', icon: CalendarCheck, permission: 'meeting:read' },
    ],
  },
  {
    label: 'Prospects',
    items: [
      { href: '/discovery', label: 'Discovery', icon: Radar, permission: 'account:read' },
      { href: '/pipeline', label: 'Research funnel', icon: Filter, permission: 'account:read' },
      { href: '/accounts', label: 'Accounts', icon: Building2, permission: 'account:read' },
      { href: '/contacts', label: 'Contacts', icon: Users, permission: 'account:read' },
      { href: '/duplicates', label: 'Duplicates', icon: CopyCheck, permission: 'account:read', badge: 'duplicates' },
    ],
  },
  {
    label: 'Outreach',
    items: [
      { href: '/campaigns', label: 'Campaigns', icon: Layers, permission: 'campaign:read' },
      { href: '/review', label: 'Review queue', icon: ShieldCheck, permission: 'message:read', badge: 'review' },
      { href: '/analytics', label: 'Analytics', icon: BarChart3, permission: 'analytics:read' },
    ],
  },
  {
    label: 'Delivery',
    items: [
      { href: '/opportunities', label: 'Opportunities', icon: Lightbulb, permission: 'account:read' },
      { href: '/studio', label: 'Studio', icon: AppWindow, permission: 'studio:read' },
      { href: '/projects', label: 'Projects', icon: ClipboardList, permission: 'proposal:read' },
    ],
  },
  {
    label: 'Setup',
    items: [
      { href: '/clients', label: 'Clients', icon: Briefcase, permission: 'clientProfile:write' },
      { href: '/playbooks', label: 'Playbooks', icon: BookOpen, permission: 'playbook:read' },
      { href: '/suppression', label: 'Do not contact', icon: ShieldBan, permission: 'suppression:read' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: '/connectors', label: 'Connectors', icon: Plug, permission: 'connector:manage' },
      { href: '/system', label: 'System', icon: Activity, permission: 'ops:read' },
      { href: '/team', label: 'Team', icon: UsersRound, permission: 'member:manage' },
      { href: '/settings', label: 'Settings', icon: Settings, permission: 'settings:read' },
    ],
  },
  {
    label: 'Legacy tools',
    items: [
      { href: '/research', label: 'Research queue', icon: Microscope, permission: 'research:read' },
      { href: '/solutions', label: 'Solution library', icon: LayoutTemplate, permission: 'proposal:read' },
      { href: '/proposals', label: 'Proposals', icon: FileText, permission: 'proposal:read' },
      { href: '/portfolios', label: 'Demo sites', icon: Globe, permission: 'portfolio:read' },
    ],
  },
];

export function Sidebar({ role, counts }: { role: Role; counts: NavCounts }) {
  return (
    <nav aria-label="Main" className="hidden md:flex w-[220px] shrink-0 border-r border-hairline bg-surface flex-col">
      <Brand />
      <NavList role={role} counts={counts} />
      <div className="p-3 border-t border-hairline">
        <p className="eyebrow mb-0.5">Signed in as</p>
        <p className="text-micro text-muted">{ROLE_LABELS[role]}</p>
      </div>
    </nav>
  );
}

/** The same navigation in a drawer, for narrow screens. */
export function MobileNav({ role, counts }: { role: Role; counts: NavCounts }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Open navigation"
              className="md:hidden fixed bottom-4 left-4 z-40 size-11 rounded-full bg-accent text-white shadow-pop grid place-items-center">
        <Menu className="size-5" />
      </button>
      {open && (
        <div className="md:hidden fixed inset-0 z-50 bg-ink/30 backdrop-blur-sm" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="Navigation">
          <nav aria-label="Main" className="w-[260px] h-full bg-surface border-r border-hairline flex flex-col animate-fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center pr-2"><div className="flex-1"><Brand /></div>
              <button type="button" className="btn-ghost size-8 p-0" onClick={() => setOpen(false)} aria-label="Close navigation"><X className="size-4" /></button>
            </div>
            <NavList role={role} counts={counts} />
          </nav>
        </div>
      )}
    </>
  );
}

function Brand() {
  return (
    <div className="h-14 flex items-center gap-2.5 px-4 border-b border-hairline">
      <div className="size-6 rounded bg-accent grid place-items-center text-white font-display text-[13px] font-bold">R</div>
      <span className="font-display font-semibold tracking-display">Relay</span>
    </div>
  );
}

function NavList({ role, counts }: { role: Role; counts: NavCounts }) {
  const pathname = usePathname();
  return (
    <div className="flex-1 p-2 overflow-y-auto space-y-3">
      {GROUPS.map((group) => {
        const items = group.items.filter((i) => can(role, i.permission));
        if (!items.length) return null;
        return (
          <div key={group.label ?? 'main'}>
            {group.label && <p className="eyebrow px-2.5 pt-1 pb-1.5">{group.label}</p>}
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                const count = item.badge ? counts[item.badge] : 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md px-2.5 h-8 text-[13px] transition-colors',
                        active ? 'bg-accent-soft text-accent font-medium' : 'text-muted hover:bg-raised hover:text-ink',
                      )}
                    >
                      <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                      <span className="flex-1">{item.label}</span>
                      {count > 0 && (
                        <span className={cn('num text-[11px] px-1.5 h-[18px] grid place-items-center rounded-full',
                          item.badge === 'calls' ? 'bg-accent/15 text-accent' : 'bg-held/15 text-held')}>
                          {count > 99 ? '99+' : count}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
