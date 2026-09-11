'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';

interface EligibleLead {
  id: string;
  companyName: string;
  industry: string | null;
  city: string | null;
  score: number;
}

export function EligibleLeads({ leads, canWrite }: { leads: EligibleLead[]; canWrite: boolean }) {
  const router = useRouter();
  const [building, setBuilding] = useState<string | null>(null);
  const createSite = trpc.proposals.createSite.useMutation({
    onSuccess: () => router.refresh(),
    onSettled: () => setBuilding(null),
  });

  if (leads.length === 0) {
    return (
      <div className="card p-6 text-center">
        <p className="text-micro text-muted">
          No researched leads waiting. Research a lead from the{' '}
          <Link href="/research" className="text-accent hover:underline">Research</Link> page and it
          will show up here.
        </p>
      </div>
    );
  }

  return (
    <>
      <ul className="card divide-y divide-hairline">
        {leads.map((lead) => (
          <li key={lead.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <Link href={`/leads/${lead.id}`} className="text-[13px] font-medium hover:text-accent">
                {lead.companyName}
              </Link>
              <p className="text-[11px] text-muted capitalize truncate">
                {[lead.industry, lead.city].filter(Boolean).join(' · ') || 'No industry recorded'}
              </p>
            </div>
            <span className="num text-[11px] text-muted">score {lead.score}</span>
            {canWrite && (
              <button
                type="button"
                className="btn-outline h-7 text-micro"
                disabled={createSite.isPending}
                onClick={() => {
                  setBuilding(lead.id);
                  createSite.mutate({ leadId: lead.id });
                }}
              >
                {building === lead.id && createSite.isPending
                  ? <Loader2 className="size-3.5 animate-spin" />
                  : <Sparkles className="size-3.5" />}
                Build demo
              </button>
            )}
          </li>
        ))}
      </ul>
      {createSite.error && (
        <p className="text-[11px] text-blocked mt-2">{createSite.error.message}</p>
      )}
    </>
  );
}
