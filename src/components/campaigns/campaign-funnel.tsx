'use client';

import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

/**
 * A funnel, not a row of vanity metrics. Each stage is shown as a proportion of
 * the one above it, so a healthy-looking "412 sent" can't hide a 3% delivery
 * rate. Bounce and complaint rates sit apart in their own row because they are
 * warnings, not achievements.
 */
export function CampaignFunnel({ campaignId }: { campaignId: string }) {
  const stats = trpc.campaigns.stats.useQuery({ id: campaignId });
  if (stats.isPending) return <p className="text-micro text-muted">Loading…</p>;
  if (!stats.data) return null;

  const s = stats.data;
  const stages = [
    { label: 'Prepared', value: s.prepared + s.approved + s.sent },
    { label: 'Awaiting review', value: s.prepared },
    { label: 'Approved', value: s.approved + s.sent },
    { label: 'Sent', value: s.sent },
    { label: 'Delivered', value: s.delivered },
    { label: 'Opened', value: s.opened },
    { label: 'Replied', value: s.replied },
  ];
  const top = stages[0]!.value || 1;

  return (
    <div className="card p-4 space-y-3">
      <ul className="space-y-1.5">
        {stages.map((stage) => (
          <li key={stage.label} className="flex items-center gap-3">
            <span className="text-micro text-muted w-32 shrink-0">{stage.label}</span>
            <div className="flex-1 h-4 rounded bg-hairline/60 overflow-hidden">
              <div className="h-full bg-accent/70 animate-meter-fill origin-left"
                   style={{ width: `${Math.min(100, (stage.value / top) * 100)}%` }} />
            </div>
            <span className="num text-micro w-10 text-right">{stage.value}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-x-6 gap-y-2 pt-3 border-t border-hairline">
        <Rate label="Reply rate" value={s.replyRate} good />
        <Rate label="Bounce rate" value={s.bounceRate} threshold={0.03} />
        <Rate label="Complaints" value={s.complained / Math.max(1, s.sent)} threshold={0.001} />
      </div>

      {s.bounceRate > 0.03 && (
        <p className="text-[11px] text-blocked">
          Bounce rate above 3%. Pause and clean the list — mailbox providers start
          filtering everything you send well before this becomes obvious.
        </p>
      )}
    </div>
  );
}

function Rate({ label, value, threshold, good }: {
  label: string; value: number; threshold?: number; good?: boolean;
}) {
  const bad = threshold !== undefined && value > threshold;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className={cn('num text-[13px] font-medium',
        bad ? 'text-blocked' : good && value > 0 ? 'text-cleared' : 'text-ink')}>
        {(value * 100).toFixed(value < 0.01 ? 2 : 1)}%
      </p>
    </div>
  );
}
