'use client';

import { OrganizationSwitcher, UserButton } from '@clerk/nextjs';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ClientSwitcher } from './client-switcher';
import { PageHelp } from '@/components/onboarding/page-help';

export function Topbar({ title, actions, showClientSwitcher = true }: {
  title: string;
  actions?: React.ReactNode;
  showClientSwitcher?: boolean;
}) {
  return (
    <><header className="min-h-14 shrink-0 border-b border-hairline bg-surface flex flex-wrap items-center gap-3 px-4 md:px-5 py-2">
      <h1 className="text-[15px] font-semibold tracking-display flex-1 truncate">{title}</h1>
      {actions}
      {showClientSwitcher && <ClientSwitcher />}
      <ThemeToggle />
      <div className="w-px h-5 bg-hairline hidden sm:block" />
      <div className="hidden sm:flex">
        <OrganizationSwitcher hidePersonal appearance={{ elements: { rootBox: 'flex', organizationSwitcherTrigger: 'text-[13px]' } }} />
      </div>
      <UserButton />
    </header><PageHelp /></>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === 'dark';
  return (
    <button
      type="button"
      className="btn-ghost size-8 p-0"
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {mounted && isDark ? <Sun className="size-4" strokeWidth={1.75} /> : <Moon className="size-4" strokeWidth={1.75} />}
    </button>
  );
}
