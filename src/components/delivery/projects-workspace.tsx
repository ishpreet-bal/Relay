'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Briefcase, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useActiveClient } from '@/components/shell/active-client';
import { Topbar } from '@/components/shell/topbar';
import { PageBody, Section } from '@/components/ui/page';
import { Kpi } from '@/components/ui/kpi';
import { Pill, type Tone } from '@/components/ui/pill';
import { Table, Td, Th } from '@/components/ui/table';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { EmptyState, ErrorNote, Loading } from '@/components/ui/states';
import { cn, formatMoney } from '@/lib/utils';

const STATUS_TONE: Record<string, Tone> = { PLANNED: 'neutral', BUILDING: 'accent', TESTING: 'accent', LIVE: 'positive', CLOSED: 'neutral' };
const STATUSES = ['PLANNED', 'BUILDING', 'TESTING', 'LIVE', 'CLOSED'] as const;
const CATEGORIES = ['discovery', 'build', 'configuration', 'testing', 'meetings', 'support'] as const;

/** Delivery projects: estimated against actual hours, which calibrate later estimates. */
export function ProjectsWorkspace({ canLog }: { canLog: boolean }) {
  const { clientId } = useActiveClient();
  const list = trpc.delivery.projects.useQuery({ clientId });
  const [open, setOpen] = useState<string | null>(null);
  const rows = list.data ?? [];
  const closed = rows.filter((r) => r.status === 'CLOSED' && r.ratio !== null);
  const meanRatio = closed.length ? closed.reduce((n, r) => n + (r.ratio ?? 0), 0) / closed.length : null;
  return (
    <>
      <Topbar title="Delivery projects" />
      <PageBody width="wide" className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Open projects" value={list.data ? rows.filter((r) => r.status !== 'CLOSED').length : '—'} />
          <Kpi label="Live" value={list.data ? rows.filter((r) => r.status === 'LIVE').length : '—'} />
          <Kpi label="Closed" value={list.data ? rows.filter((r) => r.status === 'CLOSED').length : '—'} />
          <Kpi label="Actual ÷ estimate" value={meanRatio === null ? '—' : meanRatio.toFixed(2)} caption={closed.length ? `over ${closed.length} closed` : 'no closed projects yet'} tone={meanRatio && meanRatio > 1.2 ? 'warning' : undefined} />
        </div>
        <ErrorNote error={list.error} />
        {list.isPending ? <Loading /> : !rows.length ? (
          <EmptyState icon={Briefcase} title="No delivery projects">A project is created when an accepted proposal becomes a customer, from the opportunity page.</EmptyState>
        ) : (
          <Table>
            <thead><tr><Th>Project</Th><Th>Customer</Th><Th>Status</Th><Th>Reuse</Th><Th className="text-right">Estimate</Th><Th className="text-right">Actual</Th><Th className="text-right">Variance</Th><Th className="text-right">Price</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-raised/50 cursor-pointer" onClick={() => setOpen(r.id)}>
                  <Td className="font-medium">{r.name}</Td>
                  <Td>{r.client?.name ?? '—'}</Td>
                  <Td><Pill tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status.toLowerCase()}</Pill></Td>
                  <Td className="text-muted">{r.reusability?.toLowerCase() ?? '—'}</Td>
                  <Td className="text-right num">{r.estimatedHours} h</Td>
                  <Td className="text-right num">{r.actualHours} h</Td>
                  <Td className={cn('text-right num', r.varianceHours > 0 ? 'text-held' : 'text-muted')}>{r.varianceHours > 0 ? '+' : ''}{r.varianceHours} h</Td>
                  <Td className="text-right num text-muted">{formatMoney(r.priceSetupCents)} + {formatMoney(r.priceMonthlyCents)}/mo</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </PageBody>
      {open && <ProjectDialog id={open} canLog={canLog} onClose={() => setOpen(null)} />}
    </>
  );
}

function ProjectDialog({ id, canLog, onClose }: { id: string; canLog: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const q = trpc.delivery.project.useQuery({ id });
  const refresh = () => { utils.delivery.project.invalidate({ id }); utils.delivery.projects.invalidate(); };
  const log = trpc.delivery.logTime.useMutation({ onSuccess: refresh });
  const del = trpc.delivery.deleteTime.useMutation({ onSuccess: refresh });
  const status = trpc.delivery.setProjectStatus.useMutation({ onSuccess: refresh });
  const [entry, setEntry] = useState({ category: 'build' as (typeof CATEGORIES)[number], hours: '1', workDate: new Date().toISOString().slice(0, 10), note: '' });
  const d = q.data;
  const closed = d?.project.status === 'CLOSED';
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} width="lg" title={d?.project.name ?? 'Project'} description={d ? `${d.client?.name ?? ''} · estimated ${d.project.estimatedHours} h` : undefined}>
      {!d ? <Loading /> : (
        <div className="space-y-5 text-micro">
          <div className="grid grid-cols-3 gap-3">
            <div><p className="eyebrow">Actual</p><p className="num text-lg">{d.actualHours} h</p></div>
            <div><p className="eyebrow">Variance</p><p className={cn('num text-lg', d.varianceHours > 0 && 'text-held')}>{d.varianceHours > 0 ? '+' : ''}{d.varianceHours} h</p></div>
            <div><p className="eyebrow">Delivery cost</p><p className="num text-lg">{formatMoney(d.actualCostCents)}</p><p className="text-[11px] text-muted">at the internal hourly cost</p></div>
          </div>
          {d.project.applicationId && <p><Link href={`/studio/apps/${d.project.applicationId}`} className="hover:underline">Open the application in Studio</Link></p>}
          <Section title="Status">
            <div className="flex flex-wrap gap-1">
              {STATUSES.map((s) => (
                <button key={s} type="button" disabled={!canLog || closed || status.isPending || d.project.status === s} aria-pressed={d.project.status === s}
                        className={cn('btn-outline h-7 text-[11px]', d.project.status === s && 'border-accent')}
                        onClick={() => { if (s !== 'CLOSED' || confirm('Close the project? Its hours then calibrate future estimates on this template.')) status.mutate({ id, status: s }); }}>
                  {s.toLowerCase()}
                </button>
              ))}
            </div>
          </Section>
          {!!d.byCategory.length && <p className="text-muted">{d.byCategory.map((c) => `${c.category} ${c.hours} h`).join(' · ')}</p>}
          {canLog && !closed && (
            <form className="grid grid-cols-[1fr_80px_130px] gap-2 items-end" onSubmit={(e) => {
              e.preventDefault();
              log.mutate({ projectId: id, category: entry.category, minutes: Math.round(Number(entry.hours) * 60), workDate: entry.workDate, note: entry.note || undefined });
            }}>
              <Field label="Work">{(fid) => (
                <select id={fid} className="input" value={entry.category} onChange={(e) => setEntry({ ...entry, category: e.target.value as typeof entry.category })}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}</Field>
              <Field label="Hours">{(fid) => <input id={fid} type="number" min={0.25} max={16} step={0.25} className="input" value={entry.hours} onChange={(e) => setEntry({ ...entry, hours: e.target.value })} />}</Field>
              <Field label="Date">{(fid) => <input id={fid} type="date" className="input" value={entry.workDate} onChange={(e) => setEntry({ ...entry, workDate: e.target.value })} />}</Field>
              <Field label="Note" className="col-span-2">{(fid) => <input id={fid} className="input" value={entry.note} onChange={(e) => setEntry({ ...entry, note: e.target.value })} maxLength={500} />}</Field>
              <button type="submit" className="btn-primary h-9" disabled={log.isPending}>Log time</button>
            </form>
          )}
          <ErrorNote error={log.error ?? del.error ?? status.error} />
          {!!d.entries.length && (
            <ul className="card divide-y divide-hairline">
              {d.entries.map((t) => (
                <li key={t.id} className="p-2 flex items-center gap-2">
                  <span className="num w-20">{new Date(t.workDate).toISOString().slice(0, 10)}</span>
                  <span className="w-24">{t.category}</span>
                  <span className="num w-14 text-right">{(t.minutes / 60).toFixed(2)} h</span>
                  <span className="flex-1 text-muted truncate">{t.note}</span>
                  {canLog && !closed && <button type="button" className="btn-ghost size-7 p-0" aria-label="Delete entry" onClick={() => del.mutate({ id: t.id })}><Trash2 className="size-3.5" /></button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Dialog>
  );
}
