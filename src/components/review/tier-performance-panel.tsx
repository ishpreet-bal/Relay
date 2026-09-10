'use client';

import { TrendingDown, TrendingUp, Info, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

/**
 * Shows whether the industry-only tier is earning its place. The important
 * design choice here is that "not enough data" is a first-class state with its
 * own message, rather than a chart of two meaningless percentages — showing a
 * 8% vs 6% comparison on twelve emails invites exactly the wrong decision.
 */
export function TierPerformancePanel() {
  const comparison = trpc.analytics.tierComparison.useQuery({ windowDays: 90 });
  const setting = trpc.analytics.contextualSetting.useQuery();
  const utils = trpc.useUtils();
  const toggle = trpc.analytics.setContextual.useMutation({
    onSuccess: () => { utils.analytics.contextualSetting.invalidate(); utils.messages.queueSummary.invalidate(); },
  });

  if (comparison.isPending) {
    return <div className="card p-4 text-micro text-muted flex items-center gap-2">
      <Loader2 className="size-3.5 animate-spin" /> Checking how each tier is performing…
    </div>;
  }
  if (!comparison.data) return null;

  const { stats, recommendation, windowDays } = comparison.data;
  const verified = stats.find((s) => s.tier === 'VERIFIED')!;
  const contextual = stats.find((s) => s.tier === 'CONTEXTUAL')!;
  const off = setting.data && !setting.data.allowContextual;

  const tone =
    recommendation.kind === 'disable_contextual' ? 'blocked'
    : recommendation.kind === 'keep' ? 'cleared'
    : 'muted';

  const Icon =
    recommendation.kind === 'disable_contextual' ? TrendingDown
    : recommendation.kind === 'keep' ? TrendingUp
    : Info;

  return (
    <section className="card p-4">
      <div className="flex items-start gap-3">
        <Icon className={cn('size-4 shrink-0 mt-0.5',
          tone === 'blocked' && 'text-blocked', tone === 'cleared' && 'text-cleared', tone === 'muted' && 'text-muted')}
          strokeWidth={1.75} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <h2 className="text-[13px] font-medium">Are industry-only emails worth sending?</h2>
            <span className="num text-[11px] text-muted">last {windowDays} days</span>
          </div>
          <p className="text-micro text-muted leading-relaxed">{recommendation.message}</p>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <TierColumn label="Researched" stats={verified} />
            <TierColumn label="Industry only" stats={contextual} dimmed={off} />
          </div>

          {off && (
            <p className="text-[11px] text-held mt-3">
              Industry-only drafting is currently off.
              {setting.data?.contextualPauseReason ? ` ${setting.data.contextualPauseReason}` : ''}
            </p>
          )}

          {setting.data && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-hairline">
              <button
                type="button"
                className={off ? 'btn-outline h-7 text-micro' : 'btn-ghost h-7 text-micro'}
                disabled={toggle.isPending}
                onClick={() => toggle.mutate({ enabled: !!off })}
              >
                {off ? 'Turn industry-only back on' : 'Turn industry-only off'}
              </button>
              {recommendation.kind === 'disable_contextual' && !off && (
                <span className="text-[11px] text-blocked">Recommended</span>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function TierColumn({ label, stats, dimmed }: {
  label: string;
  stats: { delivered: number; replied: number; replyRate: number; bounceRate: number; complaintRate: number };
  dimmed?: boolean;
}) {
  return (
    <div className={cn('rounded-md border border-hairline p-2.5', dimmed && 'opacity-55')}>
      <p className="eyebrow mb-1.5">{label}</p>
      <p className="num text-lg font-medium leading-none">
        {stats.delivered ? `${(stats.replyRate * 100).toFixed(1)}%` : '—'}
      </p>
      <p className="text-[11px] text-muted mt-1">
        <span className="num">{stats.replied}</span> replies from{' '}
        <span className="num">{stats.delivered}</span> delivered
      </p>
      {stats.complaintRate > 0 && (
        <p className="text-[11px] text-blocked mt-0.5">
          <span className="num">{(stats.complaintRate * 100).toFixed(2)}%</span> spam complaints
        </p>
      )}
    </div>
  );
}
