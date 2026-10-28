'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { CircleHelp } from 'lucide-react';
import { guideForPath } from '@/lib/onboarding/guide';
import { useWorkspaceRole } from './workspace-role';

export function PageHelp() {
  const path = usePathname();
  const role = useWorkspaceRole();
  const guide = role ? guideForPath(role, path) : undefined;
  if (!guide) return null;
  return <details className="shrink-0 border-b border-hairline bg-surface px-4 md:px-6 py-2 text-sm">
    <summary className="cursor-pointer text-muted w-fit"><span className="inline-flex items-center gap-2"><CircleHelp className="size-3.5" />What is {guide.label} for?</span></summary>
    <div className="max-w-3xl py-4 space-y-3 leading-relaxed"><p>{guide.purpose}</p><p className="text-muted">{guide.next}</p><Link href="/guide" className="text-accent">Open the workspace guide →</Link></div>
  </details>;
}
