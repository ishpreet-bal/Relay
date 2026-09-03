'use client';

import { Play, Pause, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

export function CampaignControls({ campaignId, status, canActivate }: {
  campaignId: string; status: string; canActivate: boolean;
}) {
  const router = useRouter();
  const setStatus = trpc.campaigns.setStatus.useMutation({ onSuccess: () => router.refresh() });

  return (
    <div className="card p-3 flex items-center gap-2 flex-wrap">
      <p className="text-micro text-muted flex-1 min-w-[220px]">
        {status === 'ACTIVE'
          ? 'Active. Drafts are being generated on schedule and land in your review queue.'
          : 'Paused. No new drafts will be generated and nothing scheduled will send.'}
      </p>

      {canActivate && status !== 'ACTIVE' && (
        <button type="button" className="btn-primary h-8 text-micro" disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ id: campaignId, status: 'ACTIVE' })}>
          <Play className="size-3.5" /> Activate
        </button>
      )}
      {canActivate && status === 'ACTIVE' && (
        <>
          <button type="button" className="btn-outline h-8 text-micro" disabled={setStatus.isPending}
                  onClick={() => setStatus.mutate({ id: campaignId, status: 'PAUSED' })}>
            <Pause className="size-3.5" /> Pause
          </button>
          <button type="button" className="btn-ghost h-8 text-micro" disabled={setStatus.isPending}
                  onClick={() => setStatus.mutate({ id: campaignId, status: 'COMPLETED' })}>
            <Check className="size-3.5" /> Mark complete
          </button>
        </>
      )}

      {setStatus.error && (
        <p className="w-full text-[11px] text-blocked">{setStatus.error.message}</p>
      )}
    </div>
  );
}
