'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Bot, Cpu, Plus } from 'lucide-react';
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
import { formatMoneyExact } from '@/lib/utils';

export const PROJECT_TONE: Record<string, Tone> = { ACTIVE: 'accent', PAUSED: 'neutral', BLOCKED: 'warning', DONE: 'positive', CANCELLED: 'neutral' };

/**
 * Engineering command center: every project, where it is, what it costs and
 * what is waiting on a person. Agents listed here say plainly whether they
 * are built yet.
 */
export function CommandCenter({ canWrite }: { canWrite: boolean }) {
  const { clientId } = useActiveClient();
  const projects = trpc.engineering.projects.useQuery({ clientId });
  const stages = trpc.engineering.stages.useQuery();
  const agents = trpc.engineering.agents.useQuery();
  const approvals = trpc.engineering.approvals.useQuery({ status: 'PENDING' });
  const [creating, setCreating] = useState(false);
  const rows = projects.data ?? [];
  const label = (s: string) => stages.data?.find((x) => x.key === s)?.label ?? s;
  const spent = rows.reduce((n, r) => n + r.spentMillicents, 0);

  return (
    <>
      <Topbar title="Engineering" actions={canWrite ? <button type="button" className="btn-primary h-8 text-micro" onClick={() => setCreating(true)}><Plus className="size-3.5" />New project</button> : null} />
      <PageBody width="wide" className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi label="Active" value={projects.data ? rows.filter((r) => r.status === 'ACTIVE').length : '—'} />
          <Kpi label="Blocked" value={projects.data ? rows.filter((r) => r.status === 'BLOCKED').length : '—'} tone={rows.some((r) => r.status === 'BLOCKED') ? 'warning' : undefined} />
          <Kpi label="Failed tasks" value={projects.data ? rows.reduce((n, r) => n + r.tasks.failed, 0) : '—'} tone={rows.some((r) => r.tasks.failed) ? 'negative' : undefined} />
          <Kpi label="Waiting on you" value={approvals.data ? approvals.data.filter((a) => a.canDecide).length : '—'} caption={<Link href="/approvals" className="text-accent">Approval inbox</Link>} />
          <Kpi label="Agent spend" value={projects.data ? formatMoneyExact(Math.round(spent / 1000), 'USD') : '—'} caption="recorded runs, all projects" />
        </div>

        <ErrorNote error={projects.error} />
        {projects.isPending ? <Loading /> : !rows.length ? (
          <EmptyState icon={Cpu} title="No engineering projects yet">
            A project carries a customer&apos;s problem from requirements to a maintained application, stage by stage. Start with something internal before a paying client.
          </EmptyState>
        ) : (
          <Table>
            <thead><tr><Th>Project</Th><Th>Client</Th><Th>Stage</Th><Th>Status</Th><Th className="text-right">Tasks</Th><Th className="text-right">Approvals</Th><Th className="text-right">Spend / budget</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-raised/50">
                  <Td className="font-medium"><Link href={`/engineering/${r.id}`} className="hover:underline">{r.name}</Link></Td>
                  <Td>{r.client?.name ?? '—'}</Td>
                  <Td><span className="text-muted num mr-1.5">{r.stageIndex + 1}/{stages.data?.length ?? 15}</span>{label(r.stage)}</Td>
                  <Td><Pill tone={PROJECT_TONE[r.status] ?? 'neutral'} title={r.blockedReason ?? undefined}>{r.status.toLowerCase()}</Pill></Td>
                  <Td className="text-right num">{r.tasks.done}/{r.tasks.total}{r.tasks.failed ? <span className="text-blocked"> · {r.tasks.failed} failed</span> : null}</Td>
                  <Td className="text-right num">{r.pendingApprovals || '—'}</Td>
                  <Td className="text-right num text-muted">{formatMoneyExact(Math.round(r.spentMillicents / 1000), 'USD')} / {formatMoneyExact(r.budgetCents, 'USD')}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        <Section title="Agents" hint="Each agent is a role with a defined job, tools and limits. Consequential actions only ever become approval requests.">
          <ul className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {(agents.data ?? []).map((a) => (
              <li key={a.role} className="card p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Bot className="size-4 text-muted" />
                  <p className="font-medium text-[13px] flex-1">{a.name}</p>
                  <Pill tone={a.available ? 'positive' : 'neutral'}>{a.available ? 'running' : 'not built yet'}</Pill>
                </div>
                <p className="text-micro text-muted leading-relaxed">{a.job}</p>
                <p className="text-[11px] text-muted"><span className="font-medium text-ink">Produces:</span> {a.output}</p>
                <p className="text-[11px] text-muted"><span className="font-medium text-ink">Runs as:</span> {a.runtime === 'sandbox' ? 'isolated sandbox per task' : a.runtime === 'structured' ? 'single model call' : 'Relay code'}{a.model ? ` · ${a.model}` : ''}</p>
                {a.preparesOnly.length > 0 && <p className="text-[11px] text-muted"><span className="font-medium text-ink">Needs approval for:</span> {a.preparesOnly.join(', ')}</p>}
              </li>
            ))}
          </ul>
        </Section>
      </PageBody>
      {creating && <NewProject onClose={() => setCreating(false)} />}
    </>
  );
}

function NewProject({ onClose }: { onClose: () => void }) {
  const { clients, clientId } = useActiveClient();
  const [form, setForm] = useState({ clientId: clientId ?? clients[0]?.id ?? '', name: '', problem: '', repository: '', budget: '50' });
  const utils = trpc.useUtils();
  const create = trpc.engineering.create.useMutation({ onSuccess: (p) => { void utils.engineering.projects.invalidate(); window.location.href = `/engineering/${p.id}`; } });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }} title="New engineering project" description="Start from the customer's problem in their own words." width="lg">
      <form className="space-y-4" onSubmit={(e) => {
        e.preventDefault();
        create.mutate({ clientId: form.clientId, name: form.name, problem: form.problem, repository: form.repository || null, budgetCents: Math.round(Number(form.budget || 0) * 100) });
      }}>
        <Field label="Client">{(id) => <select id={id} className="input" required value={form.clientId} onChange={set('clientId')}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</Field>
        <Field label="Project name">{(id) => <input id={id} className="input" required minLength={3} value={form.name} onChange={set('name')} placeholder="Invoice automation" />}</Field>
        <Field label="The problem" hint="What happens today, and what goes wrong.">{(id) => <textarea id={id} className="input min-h-28" required minLength={20} value={form.problem} onChange={set('problem')} placeholder="We re-key about 300 supplier invoices a week into QuickBooks by hand…" />}</Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Repository" hint="owner/name, optional for now">{(id) => <input id={id} className="input" value={form.repository} onChange={set('repository')} placeholder="acme/invoice-automation" />}</Field>
          <Field label="Agent budget (USD)" hint="Work stops when it's reached">{(id) => <input id={id} type="number" min={0} step="1" className="input" value={form.budget} onChange={set('budget')} />}</Field>
        </div>
        <ErrorNote error={create.error} />
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create project'}</button></div>
      </form>
    </Dialog>
  );
}
