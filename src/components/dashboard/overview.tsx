'use client';

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { AlertTriangle, Info } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { cn, formatMoney } from '@/lib/utils';

const PIPELINE_ORDER = [
  'DISCOVERED', 'RESEARCHED', 'DRAFTED', 'CONTACTED',
  'ENGAGED', 'MEETING_BOOKED', 'PROPOSAL_SENT', 'WON',
];

export function DashboardOverview() {
  const overview = trpc.admin.overview.useQuery({ days: 90 });

  if (overview.isPending) return <p className="text-micro text-muted">Loading…</p>;
  if (!overview.data) return null;

  const { pipeline, outreach, conversion, revenue, aiSpend } = overview.data;
  const stageMap = new Map(pipeline.stages.map((s) => [s.status, s.count]));
  const funnel = PIPELINE_ORDER.map((status) => ({ status, count: stageMap.get(status) ?? 0 }));
  const top = Math.max(...funnel.map((f) => f.count), 1);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Won this month" value={formatMoney(revenue.wonThisMonthCents, revenue.currency)} tone="cleared" />
        <Metric label="Recurring monthly" value={formatMoney(revenue.mrrCents, revenue.currency)} />
        <Metric label="Outstanding invoices" value={formatMoney(revenue.outstandingCents, revenue.currency)}
                caption={revenue.overdueCents > 0 ? `${formatMoney(revenue.overdueCents, revenue.currency)} overdue` : undefined}
                tone={revenue.overdueCents > 0 ? 'blocked' : undefined} />
        <Metric label="AI spend this month" value={`$${(aiSpend.spentCents / 100).toFixed(0)}`}
                caption={`of $${(aiSpend.capCents / 100).toFixed(0)} budget`}
                tone={aiSpend.spentCents / aiSpend.capCents > 0.8 ? 'held' : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="eyebrow mb-3">Pipeline</h2>
          <ul className="space-y-1.5">
            {funnel.map((stage) => (
              <li key={stage.status} className="flex items-center gap-3">
                <span className="text-micro text-muted w-32 shrink-0 capitalize">
                  {stage.status.toLowerCase().replace(/_/g, ' ')}
                </span>
                <div className="flex-1 h-4 rounded bg-hairline/60 overflow-hidden">
                  <div className={cn('h-full animate-meter-fill origin-left',
                    stage.status === 'WON' ? 'bg-cleared' : 'bg-accent/70')}
                    style={{ width: `${(stage.count / top) * 100}%` }} />
                </div>
                <span className="num text-micro w-10 text-right">{stage.count}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-4">
          <h2 className="eyebrow mb-1">Revenue</h2>
          <p className="text-[11px] text-muted mb-3">Accepted proposals and collected invoices</p>
          <ResponsiveContainer width="100%" height={168}>
            <AreaChart data={revenue.series} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="rgb(var(--hairline))" vertical={false} />
              <XAxis dataKey="month" stroke="rgb(var(--muted))" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="rgb(var(--muted))" fontSize={10} tickLine={false} axisLine={false} width={52}
                     tickFormatter={(v) => `$${Math.round(v / 100000)}k`} />
              <Tooltip
                formatter={(v: number) => formatMoney(v, revenue.currency)}
                contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--hairline))', borderRadius: 8, fontSize: 12 }}
              />
              <Area type="monotone" dataKey="won" name="Won" stroke="rgb(var(--accent))" strokeWidth={2} fill="url(#rev)" />
              <Area type="monotone" dataKey="collected" name="Collected" stroke="rgb(var(--cleared))" strokeWidth={2} fill="none" />
            </AreaChart>
          </ResponsiveContainer>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-4">
          <h2 className="eyebrow mb-3">Outreach, last 90 days</h2>
          <dl className="space-y-2">
            <Row label="Delivered" value={String(outreach.delivered)} />
            <Row label="Reply rate" value={`${(outreach.replyRate * 100).toFixed(1)}%`} tone="cleared" />
            <Row label="Meetings booked" value={String(outreach.meetings)} />
            <Row label="Bounce rate" value={`${(outreach.bounceRate * 100).toFixed(2)}%`}
                 tone={outreach.bounceRate > 0.03 ? 'blocked' : undefined} />
          </dl>
          {outreach.bounceRate > 0.03 && (
            <p className="flex items-start gap-1.5 text-[11px] text-blocked mt-3">
              <AlertTriangle className="size-3 mt-0.5 shrink-0" />
              Above 3%. Clean the list before sending more — providers filter on this.
            </p>
          )}
        </section>

        <section className="card p-4">
          <h2 className="eyebrow mb-3">Conversion</h2>
          {conversion.reliable ? (
            <>
              <p className="num text-2xl font-medium">{(conversion.contactedToWon * 100).toFixed(1)}%</p>
              <p className="text-[11px] text-muted mt-1">
                of contacted leads become clients
              </p>
              <p className="text-[11px] text-muted mt-2">
                {conversion.won} won from {conversion.contacted} contacted, across leads added more
                than {conversion.maturationDays} days ago.
              </p>
            </>
          ) : (
            <div className="flex items-start gap-2">
              <Info className="size-3.5 text-muted shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted">
                Not enough matured leads yet. Conversion only counts leads added more than{' '}
                {conversion.maturationDays} days ago — otherwise recent additions drag the rate
                down for no real reason. {30 - conversion.cohortSize} more needed.
              </p>
            </div>
          )}
        </section>

        <section className="card p-4">
          <h2 className="eyebrow mb-3">By industry</h2>
          <ResponsiveContainer width="100%" height={168}>
            <BarChart data={pipeline.byIndustry} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="industry" width={92} stroke="rgb(var(--muted))"
                     fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--hairline))', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" name="Leads" fill="rgb(var(--accent))" radius={[0, 3, 3, 0]} barSize={12} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value, caption, tone }: {
  label: string; value: string; caption?: string; tone?: 'cleared' | 'held' | 'blocked';
}) {
  return (
    <div className="card p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted mb-1">{label}</p>
      <p className={cn('num text-xl font-medium',
        tone === 'cleared' && 'text-cleared', tone === 'held' && 'text-held', tone === 'blocked' && 'text-blocked')}>
        {value}
      </p>
      {caption && <p className="text-[11px] text-muted mt-1">{caption}</p>}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'cleared' | 'blocked' }) {
  return (
    <div className="flex justify-between items-baseline">
      <dt className="text-micro text-muted">{label}</dt>
      <dd className={cn('num text-micro font-medium',
        tone === 'cleared' && 'text-cleared', tone === 'blocked' && 'text-blocked')}>{value}</dd>
    </div>
  );
}
