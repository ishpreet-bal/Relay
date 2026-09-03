'use client';

import { OrganizationSwitcher, UserButton } from '@clerk/nextjs';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

export function Topbar({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <header className="h-14 shrink-0 border-b border-hairline bg-surface flex items-center gap-3 px-5">
      <h1 className="text-[15px] font-semibold tracking-display flex-1">{title}</h1>
      {actions}
      <ThemeToggle />
      <div className="w-px h-5 bg-hairline" />
      <OrganizationSwitcher
        hidePersonal
        appearance={{ elements: { rootBox: 'flex', organizationSwitcherTrigger: 'text-[13px]' } }}
      />
      <UserButton />
    </header>
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
