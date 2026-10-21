'use client';

import { useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/types';
import { useActiveClient } from '@/components/shell/active-client';
import { Topbar } from '@/components/shell/topbar';
import { PageBody, Section } from '@/components/ui/page';
import { Kpi, pct } from '@/components/ui/kpi';
import { Table, Th, Td } from '@/components/ui/table';
import { ErrorNote, Loading } from '@/components/ui/states';
import { formatMoney, cn } from '@/lib/utils';
import { FunnelView, WindowSelect } from './funnel-view';

type Dimension = 'seniority' | 'department' | 'industry' | 'companySize' | 'title';
const DIMENSIONS: Array<{ id: Dimension; label: string }> = [
  { id: 'seniority', label: 'Seniority' }, { id: 'department', label: 'Department' }, { id: 'industry', label: 'Industry' },
  { id: 'companySize', label: 'Company size' }, { id: 'title', label: 'Title' },
];
const MIN_SAMPLE = 20;

/**
 * What is working, measured by meetings rather than opens. Every rate shows
 * its denominator; groups too small to say anything are greyed and excluded
 * from the written findings. Nothing here predicts — it counts.
 */
export function AnalyticsPage() {
  const { clientId, activeClient } = useActiveClient();
  const [days, setDays] = useState(90);
  const input = { clientId, days };
  const funnel = trpc.analytics.funnel.useQuery(input);
  const f = funnel.data?.funnel;
  const r = funnel.data?.rates;

  return (
    <>
      <Topbar title="Analytics" />
      <PageBody width="wide">
        <div className="flex items-center gap-3 mb-5">
          <p className="text-sm text-muted flex-1">{activeClient?.name ?? 'All clients'} · last {days} days</p>
          <WindowSelect days={days} onChange={setDays} />
        </div>
        <ErrorNote error={funnel.error} />

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 mb-6">
          <Kpi label="Reply rate" value={pct(r?.replyRate)} caption={f && `${f.replies} of ${f.emailsSent}`} />
          <Kpi label="Positive" value={pct(r?.positiveReplyRate)} caption={f && `${f.positiveReplies} replies`} />
          <Kpi label="Bounce rate" value={pct(r?.bounceRate)} tone={r && r.bounceRate !== null && r.bounceRate > 0.03 ? 'negative' : undefined} caption={f && `${f.bounces} bounced`} />
          <Kpi label="Connect rate" value={pct(r?.connectRate)} caption={f && `${f.connections} of ${f.callsAttempted} calls`} />
          <Kpi label="Meetings / conversation" value={pct(r?.meetingsPerConnection)} caption={f && `${f.meetingsBooked} booked`} />
          <Kpi label="Show rate" value={pct(r?.showRate, 0)} caption={f && `${f.meetingsHeld} held, ${f.meetingsNoShow} no-show`} />
          <Kpi label="Win rate" value={pct(r?.winRate, 0)} caption={f && `${f.dealsWon} of ${f.opportunities}`} />
          <Kpi label="Cost / meeting" value={r?.costPerMeetingCents != null ? formatMoney(r.costPerMeetingCents, 'USD') : '—'} caption={f && `${formatMoney(Math.round(f.costMillicents / 1000), 'USD')} spend`} />
        </div>

        <div className="grid xl:grid-cols-2 gap-6">
          <Section title="Full funnel" hint="Counted within the window. Percentages compare each stage with the one above it.">
            <div className="card p-4">{f ? <FunnelView funnel={f} /> : <Loading />}</div>
          </Section>
          <Campaigns input={input} />
        </div>

        <div className="mt-8 space-y-8">
          <ContactBreakdowns input={input} />
          <div className="grid xl:grid-cols-2 gap-6">
            <Signals input={input} />
            <Messages input={input} />
          </div>
          <div className="grid xl:grid-cols-2 gap-6">
            <Callers input={input} />
            <Objections input={input} />
          </div>
        </div>
      </PageBody>
    </>
  );
}

type Input = { clientId: string | null; days: number };
type Row = RouterOutputs['analytics']['signalBreakdown']['rows'][number];

function Insights({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="mb-3 space-y-1">
      {items.map((t, i) => <li key={i} className="text-micro flex items-start gap-1.5"><Lightbulb className="size-3.5 text-held shrink-0 mt-0.5" />{t}</li>)}
    </ul>
  );
}

function BreakdownTable({ rows, label, unit = 'contacts' }: { rows: Row[]; label: string; unit?: 'contacts' | 'accounts' }) {
  if (!rows.length) return <p className="card p-4 text-micro text-muted">No {unit} worked in this window yet.</p>;
  return (
    <Table>
      <thead>
        <tr><Th>{label}</Th><Th className="text-right">{unit === 'accounts' ? 'Accounts worked' : 'Contacted'}</Th><Th className="text-right">Positive</Th><Th className="text-right">Conversations</Th><Th className="text-right">Meetings</Th><Th className="text-right">Meeting rate</Th><Th className="text-right" >vs rest</Th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className={cn(!r.sufficient && 'text-muted')} title={r.sufficient ? undefined : `Fewer than ${MIN_SAMPLE} — too few to compare`}>
            <Td className="max-w-[220px] truncate">{r.label}</Td>
            <Td className="num text-right">{r.contacted}</Td>
            <Td className="num text-right">{r.positive}</Td>
            <Td className="num text-right">{r.connected}</Td>
            <Td className="num text-right">{r.meetings}</Td>
            <Td className="num text-right">{pct(r.meetingRate)}</Td>
            <Td className="num text-right">{r.sufficient && r.lift !== null ? `${r.lift.toFixed(1)}×` : '—'}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function ContactBreakdowns({ input }: { input: Input }) {
  const [dimension, setDimension] = useState<Dimension>('seniority');
  const q = trpc.analytics.contactBreakdown.useQuery({ ...input, dimension });
  return (
    <Section title="Who books meetings" hint={`Contacts reached in the window, grouped. Groups under ${MIN_SAMPLE} are greyed out and never used for findings.`}
             action={
               <div role="group" aria-label="Group by" className="flex flex-wrap gap-1">
                 {DIMENSIONS.map((d) => (
                   <button key={d.id} type="button" aria-pressed={dimension === d.id} onClick={() => setDimension(d.id)}
                           className={cn('h-7 px-2.5 rounded-full text-micro border', dimension === d.id ? 'border-accent bg-accent-soft text-accent' : 'border-hairline text-muted hover:bg-raised')}>
                     {d.label}
                   </button>
                 ))}
               </div>
             }>
      <ErrorNote error={q.error} />
      {q.isPending ? <Loading /> : <><Insights items={q.data?.insights ?? []} /><BreakdownTable rows={q.data?.rows ?? []} label={DIMENSIONS.find((d) => d.id === dimension)!.label} /></>}
    </Section>
  );
}

function Signals({ input }: { input: Input }) {
  const q = trpc.analytics.signalBreakdown.useQuery(input);
  return (
    <Section title="Signals" hint="Accounts emailed or called in the window, grouped by the signals they had.">
      <ErrorNote error={q.error} />
      {q.isPending ? <Loading /> : <><Insights items={q.data?.insights ?? []} /><BreakdownTable rows={q.data?.rows ?? []} label="Signal" unit="accounts" /></>}
    </Section>
  );
}

function Messages({ input }: { input: Input }) {
  const [dimension, setDimension] = useState<'angle' | 'stepOrder' | 'ctaType'>('angle');
  const q = trpc.analytics.messageBreakdown.useQuery({ ...input, dimension });
  return (
    <Section title="Emails" hint="Replies by messaging angle, sequence step and call to action."
             action={
               <select aria-label="Group emails by" className="input h-7 w-36 text-micro" value={dimension} onChange={(e) => setDimension(e.target.value as typeof dimension)}>
                 <option value="angle">Angle</option><option value="stepOrder">Sequence step</option><option value="ctaType">Call to action</option>
               </select>
             }>
      <ErrorNote error={q.error} />
      {q.isPending ? <Loading /> : !q.data?.length ? <p className="card p-4 text-micro text-muted">No emails sent in this window.</p> : (
        <Table>
          <thead><tr><Th>{dimension === 'angle' ? 'Angle' : dimension === 'stepOrder' ? 'Step' : 'Call to action'}</Th><Th className="text-right">Sent</Th><Th className="text-right">Replied</Th><Th className="text-right">Reply rate</Th></tr></thead>
          <tbody>
            {q.data.map((r) => (
              <tr key={r.key} className={cn(!r.sufficient && 'text-muted')}>
                <Td className="max-w-[240px] truncate">{r.label}</Td><Td className="num text-right">{r.sent}</Td><Td className="num text-right">{r.replied}</Td><Td className="num text-right">{pct(r.replyRate)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Section>
  );
}

function Campaigns({ input }: { input: Input }) {
  const q = trpc.analytics.campaignBreakdown.useQuery(input);
  return (
    <Section title="Campaigns and playbooks">
      <ErrorNote error={q.error} />
      {q.isPending ? <Loading /> : !q.data?.campaigns.length ? <p className="card p-4 text-micro text-muted">No campaigns yet.</p> : (
        <div className="space-y-3">
          <Table>
            <thead><tr><Th>Campaign</Th><Th className="text-right">Sent</Th><Th className="text-right">Reply rate</Th><Th className="text-right">Calls</Th><Th className="text-right">Meetings</Th></tr></thead>
            <tbody>
              {q.data.campaigns.map((c) => (
                <tr key={c.id}>
                  <Td className="max-w-[220px]"><span className="block truncate">{c.name}</span><span className="text-[11px] text-muted">{c.client}{c.playbook && ` · ${c.playbook}`}</span></Td>
                  <Td className="num text-right">{c.sent}</Td><Td className="num text-right">{pct(c.replyRate)}</Td><Td className="num text-right">{c.calls}</Td><Td className="num text-right">{c.meetings}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {q.data.playbooks.length > 1 && (
            <Table>
              <thead><tr><Th>Playbook</Th><Th className="text-right">Campaigns</Th><Th className="text-right">Sent</Th><Th className="text-right">Reply rate</Th><Th className="text-right">Meetings</Th></tr></thead>
              <tbody>
                {q.data.playbooks.map((p) => (
                  <tr key={p.id}><Td>{p.name}</Td><Td className="num text-right">{p.campaigns}</Td><Td className="num text-right">{p.sent}</Td><Td className="num text-right">{pct(p.replyRate)}</Td><Td className="num text-right">{p.meetings}</Td></tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      )}
    </Section>
  );
}

function Callers({ input }: { input: Input }) {
  const q = trpc.analytics.callerBreakdown.useQuery(input);
  return (
    <Section title="Callers">
      <ErrorNote error={q.error} />
      {q.isPending ? <Loading /> : !q.data?.length ? <p className="card p-4 text-micro text-muted">No calls logged in this window.</p> : (
        <Table>
          <thead><tr><Th>Caller</Th><Th className="text-right">Calls</Th><Th className="text-right">Connect rate</Th><Th className="text-right">Qualified</Th><Th className="text-right">Meetings</Th><Th className="text-right">Talk time</Th></tr></thead>
          <tbody>
            {q.data.map((c) => (
              <tr key={c.callerId ?? 'unknown'}>
                <Td>{c.name}</Td><Td className="num text-right">{c.calls}</Td><Td className="num text-right">{pct(c.connectRate)}</Td>
                <Td className="num text-right">{c.qualified}</Td><Td className="num text-right">{c.meetings}</Td><Td className="num text-right">{c.talkMinutes}m</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Section>
  );
}

function Objections({ input }: { input: Input }) {
  const q = trpc.analytics.objections.useQuery(input);
  const max = Math.max(1, ...(q.data ?? []).map((o) => o.count));
  return (
    <Section title="Objections heard on calls" hint="What the market is telling you. Feed the common ones back into the playbook.">
      <ErrorNote error={q.error} />
      {q.isPending ? <Loading /> : !q.data?.length ? <p className="card p-4 text-micro text-muted">No objections recorded in this window.</p> : (
        <ul className="card p-4 space-y-1.5">
          {q.data.map((o) => (
            <li key={o.key} className="grid grid-cols-[160px_1fr_40px] items-center gap-2 text-micro">
              <span className="truncate">{o.label}</span>
              <span className="h-4 bg-raised rounded-sm overflow-hidden" aria-hidden><span className="block h-full bg-held/60 rounded-r-[4px]" style={{ width: `${(o.count / max) * 100}%` }} /></span>
              <span className="num text-right">{o.count}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
