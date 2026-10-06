'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, CalendarCheck, PhoneCall, ShieldCheck } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useActiveClient } from '@/components/shell/active-client';
import { personName } from '@/lib/domain';
import { formatMoney } from '@/lib/utils';
import { Topbar } from '@/components/shell/topbar';
import { PageBody, Section } from '@/components/ui/page';
import { Kpi, pct } from '@/components/ui/kpi';
import { ErrorNote, Loading } from '@/components/ui/states';
import { DateTime } from '@/components/ui/time';
import { FunnelView, WindowSelect } from '@/components/analytics/funnel-view';
import { MeetingsTrend } from '@/components/analytics/meetings-trend';

/**
 * The operator's home: is outreach turning into meetings, what does it cost,
 * and what needs a person today.
 */
export function DashboardOverview() {
  const { clientId, activeClient } = useActiveClient();
  const [days, setDays] = useState(30);
  const funnel = trpc.analytics.funnel.useQuery({ clientId, days });
  const trend = trpc.analytics.trend.useQuery({ clientId, weeks: 12 });
  const review = trpc.messages.queueSummary.useQuery({ clientId });
  const upcoming = trpc.meetings.list.useQuery({ clientId, range: 'upcoming', limit: 6 });

  const toReview = (review.data ?? []).filter((r) => r.status === 'DRAFT' || r.status === 'NEEDS_EDIT').reduce((n, r) => n + r.count, 0);
  const f = funnel.data?.funnel;
  const r = funnel.data?.rates;

  return (
    <>
      <Topbar title="Dashboard" />
      <PageBody>
        <div className="flex items-center gap-3 mb-5">
          <p className="text-sm text-muted flex-1">{activeClient ? activeClient.name : 'All clients'} · last {days} days</p>
          <WindowSelect days={days} onChange={setDays} />
        </div>
        <ErrorNote error={funnel.error} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Kpi label="Meetings booked" value={f?.meetingsBooked ?? '—'} tone={f && f.meetingsBooked > 0 ? 'positive' : undefined}
               caption={r ? `${pct(r.meetingsPerConnection)} of conversations` : undefined} />
          <Kpi label="Show rate" value={pct(r?.showRate, 0)} caption={f ? `${f.meetingsHeld} held · ${f.meetingsNoShow} no-shows` : undefined} />
          <Kpi label="Positive replies" value={f?.positiveReplies ?? '—'} caption={r ? `${pct(r.positiveReplyRate)} of ${f!.emailsSent} sent` : undefined} />
          <Kpi label="Cost per meeting" value={r?.costPerMeetingCents != null ? formatMoney(r.costPerMeetingCents, 'USD') : '—'}
               caption={f ? `${formatMoney(Math.round(f.costMillicents / 1000), 'USD')} tracked spend` : undefined} />
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
          <div className="space-y-6 min-w-0">
            <Section title="Funnel" hint="Each stage is counted within the window; percentages compare a stage with the one above it."
                     action={<Link href="/analytics" className="text-micro text-accent hover:underline">Full analytics</Link>}>
              <div className="card p-4">{f ? <FunnelView funnel={f} compact /> : <Loading />}</div>
            </Section>
            <Section title="Meetings booked per week">
              <div className="card p-4">{trend.data ? <MeetingsTrend data={trend.data} /> : <Loading />}</div>
            </Section>
          </div>

          <aside className="space-y-6">
            <Section title="Needs a person">
              <ul className="card divide-y divide-hairline text-micro">
                <li><Link href="/review" className="flex items-center gap-2 p-3 hover:bg-raised/60"><ShieldCheck className="size-4 text-held" /><span className="flex-1">Drafts to review</span><span className="num">{toReview}</span><ArrowRight className="size-3.5 text-muted" /></Link></li>
                <li><Link href="/calls" className="flex items-center gap-2 p-3 hover:bg-raised/60"><PhoneCall className="size-4 text-accent" /><span className="flex-1">Call queue</span><ArrowRight className="size-3.5 text-muted" /></Link></li>
                <li><Link href="/meetings?range=past" className="flex items-center gap-2 p-3 hover:bg-raised/60"><CalendarCheck className="size-4 text-muted" /><span className="flex-1">Record meeting outcomes</span><ArrowRight className="size-3.5 text-muted" /></Link></li>
              </ul>
            </Section>
            <Section title="Upcoming meetings">
              {upcoming.isPending ? <Loading /> : !upcoming.data?.length ? <p className="text-micro text-muted">None scheduled.</p> : (
                <ul className="card divide-y divide-hairline">
                  {upcoming.data.map((m) => (
                    <li key={m.id} className="p-3 text-micro">
                      <p className="font-medium"><DateTime date={m.startsAt} /></p>
                      <p className="text-muted truncate">{m.account.name}{m.contact && ` · ${personName(m.contact)}`}{!clientId && ` · ${m.client.name}`}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            {f && f.pipelineCents > 0 && (
              <Section title="Open pipeline">
                <div className="card p-3">
                  <p className="num text-lg">{formatMoney(f.pipelineCents)}</p>
                  <p className="text-[11px] text-muted">Estimated value of booked and qualified meetings not yet won or lost.</p>
                </div>
              </Section>
            )}
          </aside>
        </div>
      </PageBody>
    </>
  );
}
