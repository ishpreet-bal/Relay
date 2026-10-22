'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AppWindow } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/types';
import { Section } from '@/components/ui/page';
import { Pill, type Tone } from '@/components/ui/pill';
import { Table, Td, Th } from '@/components/ui/table';
import { Field } from '@/components/ui/field';
import { EmptyState, ErrorNote, Loading } from '@/components/ui/states';
import { Ago } from '@/components/ui/time';
import { cn } from '@/lib/utils';

const RUN_TONE: Record<string, Tone> = { QUEUED: 'neutral', RUNNING: 'accent', WAITING_APPROVAL: 'warning', SUCCEEDED: 'positive', FAILED: 'negative', CANCELLED: 'neutral' };
const suffix = (viewAs: string | null) => (viewAs ? `?clientId=${encodeURIComponent(viewAs)}` : '');

export function PortalApps({ clientId, viewAs }: { clientId: string; viewAs: string | null }) {
  const apps = trpc.studio.customerApps.useQuery({ clientId });
  return (
    <Section title="Your applications">
      <ErrorNote error={apps.error} />
      {apps.isPending ? <Loading /> : !apps.data?.length ? (
        <EmptyState icon={AppWindow} title="No applications yet">Applications built for you appear here once they are live.</EmptyState>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-3">
          {apps.data.map((a) => (
            <li key={a.id}>
              <Link href={`/portal/apps/${a.id}${suffix(viewAs)}`} className="card p-4 block hover:border-accent/50">
                <p className="font-medium">{a.name}</p>
                <p className="text-[11px] text-muted mt-1">{a.status === 'ACTIVE' ? 'Live' : a.status.toLowerCase()} · updated <Ago date={a.updatedAt} /></p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** A customer's application, in their branding and words. */
export function PortalApp({ id, viewAs, canRun }: { id: string; viewAs: string | null; canRun: boolean }) {
  const q = trpc.studio.customerApp.useQuery({ id }, { refetchInterval: 15_000 });
  const [collection, setCollection] = useState<string | null>(null);
  const [form, setForm] = useState<string | null>(null);
  if (q.isPending) return <Loading />;
  if (!q.data) return <ErrorNote error={q.error ?? { message: 'Not found' }} />;
  const d = q.data;
  const activeColl = collection ?? d.collections[0]?.key ?? null;
  const live = d.app.status === 'ACTIVE';
  return (
    <div className="space-y-8" style={{ ['--brand' as string]: d.branding.primaryColor }}>
      <div className="flex items-center gap-3">
        <Link href={`/portal/apps${suffix(viewAs)}`} className="text-micro text-muted hover:text-ink">Applications</Link>
        <span className="text-muted">/</span>
        <h1 className="text-lg font-semibold flex-1" style={{ color: 'var(--brand)' }}>{d.branding.displayName}</h1>
        {!live && <Pill tone="warning">{d.app.status.toLowerCase()}</Pill>}
      </div>

      {!!d.widgets.length && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {d.widgets.map((w, i) => (
            <div key={i} className="card p-4" style={{ borderTop: '3px solid var(--brand)' }}>
              <p className="eyebrow mb-1">{w.title}</p>
              {'value' in w ? <p className="num text-xl">{w.value.toLocaleString('en-CA')}</p> : (
                <ul className="text-[12px] space-y-0.5">{(w.items ?? []).map((it) => <li key={it.id} className="truncate">{Object.values(it.data as object)[0] as string}</li>)}</ul>
              )}
            </div>
          ))}
        </div>
      )}

      {!!d.approvals.length && (
        <Section title="Waiting for your decision">
          <ul className="card divide-y divide-hairline">
            {d.approvals.map((a) => <Approval key={a.executionId} a={a} canDecide={canRun} />)}
          </ul>
        </Section>
      )}

      {canRun && live && !!d.forms.length && (
        <Section title="Submit">
          <div className="flex flex-wrap gap-2 mb-3">
            {d.forms.map((f) => (
              <button key={f.workflowKey} type="button" className={cn('btn-outline h-8 text-micro', form === f.workflowKey && 'border-[var(--brand)]')} onClick={() => setForm(form === f.workflowKey ? null : f.workflowKey)}>{f.name}</button>
            ))}
          </div>
          {form && <SubmitForm appId={d.app.id} form={d.forms.find((f) => f.workflowKey === form)!} onDone={() => setForm(null)} />}
        </Section>
      )}

      {activeColl && (
        <Section title="Records" action={(
          <div className="flex gap-1">
            {d.collections.map((c) => (
              <button key={c.key} type="button" onClick={() => setCollection(c.key)} aria-pressed={activeColl === c.key}
                      className={cn('h-7 px-2 rounded text-[12px]', activeColl === c.key ? 'bg-raised text-ink' : 'text-muted')}>{c.label}</button>
            ))}
          </div>
        )}>
          <Records appId={d.app.id} collection={d.collections.find((c) => c.key === activeColl)!} />
        </Section>
      )}

      <Section title="Recent activity">
        {!d.runs.length ? <p className="card p-4 text-micro text-muted">Nothing has run yet.</p> : (
          <ul className="card divide-y divide-hairline">
            {d.runs.map((r) => (
              <li key={r.id} className="p-3 text-micro flex items-center gap-2">
                <span className="flex-1">{r.workflow}</span>
                {r.error && <span className="text-blocked text-[11px] truncate max-w-[40%]">{r.error}</span>}
                <Pill tone={RUN_TONE[r.status] ?? 'neutral'}>{r.status.toLowerCase().replace('_', ' ')}</Pill>
                <span className="text-muted text-[11px] w-24 text-right"><Ago date={r.createdAt} /></span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

type Detail = RouterOutputs['studio']['customerApp'];

function Approval({ a, canDecide }: { a: Detail['approvals'][number]; canDecide: boolean }) {
  const utils = trpc.useUtils();
  const [note, setNote] = useState('');
  const decide = trpc.studio.decide.useMutation({ onSuccess: () => utils.studio.customerApp.invalidate() });
  return (
    <li className="p-3 text-micro space-y-2">
      <p className="font-medium">{a.title}</p>
      <p className="text-[11px] text-muted">{a.workflow} · <Ago date={a.createdAt} /></p>
      {canDecide && (
        <div className="flex flex-wrap gap-2">
          <input className="input h-8 flex-1 min-w-[180px]" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          <button type="button" className="btn-primary h-8 text-micro" disabled={decide.isPending} onClick={() => decide.mutate({ executionId: a.executionId, decision: 'APPROVE', note: note || null })}>Approve</button>
          <button type="button" className="btn-outline h-8 text-micro" disabled={decide.isPending} onClick={() => decide.mutate({ executionId: a.executionId, decision: 'REJECT', note: note || null })}>Reject</button>
        </div>
      )}
      <ErrorNote error={decide.error} />
    </li>
  );
}

function SubmitForm({ appId, form, onDone }: { appId: string; form: Detail['forms'][number]; onDone: () => void }) {
  const utils = trpc.useUtils();
  const [values, setValues] = useState<Record<string, string>>({});
  const run = trpc.studio.run.useMutation({ onSuccess: () => { utils.studio.customerApp.invalidate(); onDone(); } });
  const submit = () => {
    const input = Object.fromEntries(form.fields.filter((f) => values[f.key] !== undefined && values[f.key] !== '').map((f) => [f.key, f.type === 'number' ? Number(values[f.key]) : f.type === 'boolean' ? values[f.key] === 'true' : values[f.key]]));
    run.mutate({ applicationId: appId, workflowKey: form.workflowKey, input });
  };
  return (
    <form className="card p-4 grid sm:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {form.fields.map((f) => (
        <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`}>{(id) => (
          f.type === 'select' ? (
            <select id={id} className="input" value={values[f.key] ?? ''} required={f.required} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}>
              <option value="">Choose…</option>
              {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : f.type === 'boolean' ? (
            <select id={id} className="input" value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}>
              <option value="">—</option><option value="true">Yes</option><option value="false">No</option>
            </select>
          ) : (
            <input id={id} className="input" required={f.required} type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : 'text'}
                   value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
          )
        )}</Field>
      ))}
      <div className="sm:col-span-2 flex justify-end gap-2">
        <ErrorNote error={run.error} className="flex-1" />
        <button type="button" className="btn-ghost" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={run.isPending}>Submit</button>
      </div>
    </form>
  );
}

function Records({ appId, collection }: { appId: string; collection: Detail['collections'][number] }) {
  const q = trpc.studio.records.useQuery({ applicationId: appId, collection: collection.key, isTest: false, limit: 50 });
  if (q.isPending) return <Loading />;
  if (!q.data?.length) return <p className="card p-4 text-micro text-muted">No {collection.label.toLowerCase()} yet.</p>;
  return (
    <Table>
      <thead><tr>{collection.fields.map((f) => <Th key={f.key}>{f.label}</Th>)}<Th>Added</Th></tr></thead>
      <tbody>
        {q.data.map((r) => {
          const data = r.data as Record<string, unknown>;
          return (
            <tr key={r.id}>
              {collection.fields.map((f) => <Td key={f.key} className={f.type === 'number' ? 'num' : undefined}>{data[f.key] === undefined ? <span className="text-muted">—</span> : String(data[f.key])}</Td>)}
              <Td className="text-muted"><Ago date={r.createdAt} /></Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
