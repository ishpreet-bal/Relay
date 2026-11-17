'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, Check, CircleDashed, FileText, Pause, Play, Plus, X } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/types';
import { Topbar } from '@/components/shell/topbar';
import { PageBody, Section } from '@/components/ui/page';
import { Pill } from '@/components/ui/pill';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { ErrorNote, Loading } from '@/components/ui/states';
import { cn, formatMoneyExact } from '@/lib/utils';
import { ApprovalCard } from './approvals-inbox';
import { PROJECT_TONE } from './command-center';

type Detail = RouterOutputs['engineering']['project'];
const DOC_KINDS = ['REQUIREMENTS', 'ANALYSIS', 'ARCHITECTURE', 'ESTIMATE', 'TEST_REPORT', 'SECURITY_REPORT', 'DEPLOYMENT', 'HANDOVER'] as const;
const DOC_LABEL: Record<string, string> = { REQUIREMENTS: 'Requirements', ANALYSIS: 'Process analysis', ARCHITECTURE: 'Architecture', ESTIMATE: 'Estimate', TEST_REPORT: 'Test report', SECURITY_REPORT: 'Security report', DEPLOYMENT: 'Deployment record', HANDOVER: 'Handover' };
const TASK_TONE: Record<string, 'neutral' | 'accent' | 'positive' | 'warning' | 'negative'> = { PENDING: 'neutral', READY: 'accent', RUNNING: 'accent', REVIEW: 'warning', DONE: 'positive', FAILED: 'negative', CANCELLED: 'neutral' };

/** One engineering project: where it is, what it needs to move on, and everything recorded so far. */
export function ProjectWorkspace({ id, canWrite }: { id: string; canWrite: boolean }) {
  const q = trpc.engineering.project.useQuery({ id });
  const stages = trpc.engineering.stages.useQuery();
  const agents = trpc.engineering.agents.useQuery();
  const utils = trpc.useUtils();
  const refresh = () => { void utils.engineering.project.invalidate({ id }); void utils.engineering.projects.invalidate(); };
  const advance = trpc.engineering.advance.useMutation({ onSuccess: refresh });
  const status = trpc.engineering.setStatus.useMutation({ onSuccess: refresh });
  const [docKind, setDocKind] = useState<string | null>(null);
  const [addingTask, setAddingTask] = useState(false);
  if (q.isPending) return <><Topbar title="Engineering" /><PageBody><Loading /></PageBody></>;
  if (q.error || !q.data) return <><Topbar title="Engineering" /><PageBody><ErrorNote error={q.error} /></PageBody></>;
  const d = q.data;
  const p = d.project;
  const current = stages.data?.findIndex((s) => s.key === p.stage) ?? -1;

  return (
    <>
      <Topbar title={p.name} showClientSwitcher={false} actions={canWrite && p.status !== 'CANCELLED' && p.status !== 'DONE' ? (
        p.status === 'ACTIVE'
          ? <button type="button" className="btn-outline h-8 text-micro" onClick={() => status.mutate({ id, status: 'PAUSED', reason: 'Paused by hand' })}><Pause className="size-3.5" />Pause</button>
          : <button type="button" className="btn-outline h-8 text-micro" onClick={() => status.mutate({ id, status: 'ACTIVE' })}><Play className="size-3.5" />Resume</button>
      ) : null} />
      <PageBody width="wide" className="space-y-6">
        <Link href="/engineering" className="inline-flex items-center gap-1 text-micro text-muted hover:text-ink"><ArrowLeft className="size-3.5" />All projects</Link>
        <div className="flex flex-wrap items-center gap-3">
          <Pill tone={PROJECT_TONE[p.status] ?? 'neutral'}>{p.status.toLowerCase()}</Pill>
          <span className="text-micro text-muted">{d.client?.name}</span>
          {p.repository && <span className="text-micro text-muted">· {p.repository}</span>}
          <span className="text-micro text-muted">· agents spent {formatMoneyExact(Math.round(d.spentMillicents / 1000), 'USD')} of {formatMoneyExact(p.budgetCents, 'USD')}</span>
        </div>
        {p.blockedReason && p.status !== 'ACTIVE' && <p className="card p-3 text-sm border-held/40">{p.blockedReason}</p>}
        <p className="text-sm text-muted max-w-3xl whitespace-pre-wrap">{p.problem}</p>
        <ErrorNote error={status.error} />

        <ol className="flex gap-1 overflow-x-auto pb-1" aria-label="Stages">
          {(stages.data ?? []).map((s, i) => (
            <li key={s.key} className={cn('shrink-0 rounded-md px-2.5 py-1.5 text-[11px] border', i < current ? 'border-cleared/30 bg-cleared/10 text-cleared' : i === current ? 'border-accent bg-accent-soft text-accent font-medium' : 'border-hairline text-muted')}>
              {i + 1}. {s.label}
            </li>
          ))}
        </ol>

        <Section title={`To leave "${stages.data?.[current]?.label ?? p.stage}"`} hint="The orchestrator moves the project on by itself within 15 minutes once every check holds. Agents can't satisfy these on their own word." action={canWrite && d.gate.met && p.status === 'ACTIVE' ? <button type="button" className="btn-primary h-8 text-micro" disabled={advance.isPending} onClick={() => advance.mutate({ id })}>Move on now</button> : null}>
          {d.gate.checks.length ? (
            <ul className="card divide-y divide-hairline">
              {d.gate.checks.map((c) => <li key={c.label} className="flex items-center gap-2 p-3 text-sm">{c.ok ? <Check className="size-4 text-cleared" /> : <CircleDashed className="size-4 text-muted" />}{c.label}</li>)}
            </ul>
          ) : <p className="text-micro text-muted">This stage is ongoing; it has no exit.</p>}
          <ErrorNote error={advance.error} />
        </Section>

        <div className="grid xl:grid-cols-2 gap-6">
          <Section title="Documents" action={canWrite ? <select className="input h-8 text-micro w-44" value="" onChange={(e) => e.target.value && setDocKind(e.target.value)}><option value="">Add a document…</option>{DOC_KINDS.map((k) => <option key={k} value={k}>{DOC_LABEL[k]}</option>)}</select> : null}>
            {d.artifacts.length ? <ul className="card divide-y divide-hairline">{d.artifacts.map((a) => <ArtifactRow key={a.id} a={a} canWrite={canWrite} onChange={refresh} newest={!d.artifacts.some((b) => b.kind === a.kind && b.version > a.version)} />)}</ul>
              : <p className="text-micro text-muted">No documents yet. Requirements come first.</p>}
          </Section>

          <Section title="Tasks" action={canWrite ? <button type="button" className="btn-outline h-8 text-micro" onClick={() => setAddingTask(true)}><Plus className="size-3.5" />Add task</button> : null}>
            {d.tasks.length ? <ul className="card divide-y divide-hairline">{d.tasks.map((t) => <TaskRow key={t.id} t={t} tasks={d.tasks} canWrite={canWrite} onChange={refresh} />)}</ul>
              : <p className="text-micro text-muted">Tasks are planned after scope is approved. Each gets its own branch and acceptance criteria.</p>}
          </Section>
        </div>

        <Section title="Approvals">
          {d.approvals.length ? <ApprovalsForProject projectId={id} /> : <p className="text-micro text-muted">Nothing requested yet. Scope, acceptance and production deployment each need one.</p>}
          {canWrite && <RequestApproval projectId={id} onDone={refresh} />}
        </Section>

        <Section title="Agent runs" hint="Every model call and sandbox session an agent makes on this project, with its cost.">
          {d.agentRuns.length ? (
            <ul className="card divide-y divide-hairline">
              {d.agentRuns.map((r) => <li key={r.id} className="p-3 flex flex-wrap gap-x-3 gap-y-1 text-micro"><span className="font-medium">{agents.data?.find((a) => a.role === r.role)?.name ?? r.role}</span><Pill tone={r.status === 'SUCCEEDED' ? 'positive' : r.status === 'FAILED' ? 'negative' : 'neutral'}>{r.status.toLowerCase()}</Pill><span className="text-muted">{r.model}</span><span className="text-muted num">{formatMoneyExact(Math.round(r.costMillicents / 1000), 'USD')}</span>{r.summary && <span className="basis-full text-muted">{r.summary}</span>}{r.error && <span className="basis-full text-blocked">{r.error}</span>}</li>)}
            </ul>
          ) : <p className="text-micro text-muted">No agent has worked on this project yet. Agents beyond the orchestrator are not built yet; their work is done by hand for now.</p>}
        </Section>

        <Section title="History">
          <ul className="text-micro text-muted space-y-1">{d.stageRuns.map((s) => <li key={s.id}>{stages.data?.find((x) => x.key === s.stage)?.label ?? s.stage}: entered {new Date(s.enteredAt).toLocaleString()}{s.completedAt ? `, completed ${new Date(s.completedAt).toLocaleString()} by ${s.completedBy === 'orchestrator' ? 'the orchestrator' : 'a person'}` : ''}</li>)}</ul>
        </Section>
      </PageBody>
      {docKind && <NewDocument projectId={id} kind={docKind} onClose={() => { setDocKind(null); refresh(); }} />}
      {addingTask && <NewTask projectId={id} tasks={d.tasks} roles={(agents.data ?? []).filter((a) => a.role !== 'orchestrator').map((a) => ({ role: a.role, name: a.name }))} onClose={() => { setAddingTask(false); refresh(); }} />}
    </>
  );
}

function ApprovalsForProject({ projectId }: { projectId: string }) {
  const list = trpc.engineering.approvals.useQuery({ projectId });
  return <ul className="space-y-3">{(list.data ?? []).map((a) => <ApprovalCard key={a.id} a={a} />)}</ul>;
}

function ArtifactRow({ a, canWrite, newest, onChange }: { a: Detail['artifacts'][number]; canWrite: boolean; newest: boolean; onChange: () => void }) {
  const accept = trpc.engineering.acceptArtifact.useMutation({ onSuccess: onChange });
  return (
    <li className="p-3 space-y-1">
      <div className="flex items-center gap-2">
        <FileText className="size-4 text-muted" />
        <p className="text-[13px] font-medium flex-1">{DOC_LABEL[a.kind] ?? a.kind} v{a.version}: {a.title}</p>
        <Pill tone={a.status === 'ACCEPTED' ? 'positive' : 'neutral'}>{a.status.toLowerCase()}</Pill>
        {canWrite && newest && a.status === 'DRAFT' && <button type="button" className="btn-outline h-7 text-micro" disabled={accept.isPending} onClick={() => accept.mutate({ id: a.id })}>Accept</button>}
      </div>
      <details><summary className="text-micro text-muted cursor-pointer">Read</summary><pre className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed">{a.content}</pre>{a.data ? <pre className="mt-2 text-[11px] text-muted">{JSON.stringify(a.data)}</pre> : null}</details>
      <p className="text-[11px] text-muted">By {a.createdBy.startsWith('agent:') ? `agent (${a.createdBy.split(':')[1]})` : 'a teammate'} · {new Date(a.createdAt).toLocaleDateString()}{a.acceptedAt ? ` · accepted ${new Date(a.acceptedAt).toLocaleDateString()}` : ''}</p>
      <ErrorNote error={accept.error} />
    </li>
  );
}

function TaskRow({ t, tasks, canWrite, onChange }: { t: Detail['tasks'][number]; tasks: Detail['tasks']; canWrite: boolean; onChange: () => void }) {
  const update = trpc.engineering.updateTask.useMutation({ onSuccess: onChange });
  const [evidence, setEvidence] = useState('');
  const deps = tasks.filter((x) => t.dependsOn.includes(x.id));
  const ev = t.evidence as Record<string, string> | null;
  return (
    <li className="p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] font-medium flex-1 min-w-0">{t.title}</p>
        <Pill tone={TASK_TONE[t.status] ?? 'neutral'}>{t.status.toLowerCase()}</Pill>
        <span className="text-[11px] text-muted">{t.role}</span>
      </div>
      <ul className="text-micro text-muted list-disc pl-5">{t.acceptanceCriteria.map((c) => <li key={c}>{c}</li>)}</ul>
      <p className="text-[11px] text-muted">Branch {t.branch}{deps.length ? ` · after ${deps.map((x) => x.title).join(', ')}` : ''}{ev?.pullRequest ? <> · <a className="text-accent" href={ev.pullRequest} target="_blank" rel="noreferrer">pull request</a></> : null}{t.error ? ` · ${t.error}` : ''}</p>
      {canWrite && t.status !== 'DONE' && t.status !== 'CANCELLED' && (
        <div className="flex flex-wrap gap-2">
          {(t.status === 'READY' || t.status === 'RUNNING' || t.status === 'FAILED') && <>
            <input className="input h-7 text-micro flex-1 min-w-[180px]" placeholder="Pull request or commit URL" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
            <button type="button" className="btn-outline h-7 text-micro" disabled={!evidence.trim() || update.isPending} onClick={() => update.mutate({ id: t.id, status: 'REVIEW', evidence: { pullRequest: evidence.trim() } })}>Send to review</button>
          </>}
          {t.status === 'REVIEW' && <button type="button" className="btn-primary h-7 text-micro" disabled={update.isPending} onClick={() => update.mutate({ id: t.id, status: 'DONE' })}><Check className="size-3.5" />Checked, mark done</button>}
          {t.status === 'REVIEW' && <button type="button" className="btn-outline h-7 text-micro" disabled={update.isPending} onClick={() => update.mutate({ id: t.id, status: 'FAILED', error: 'Sent back from review' })}><X className="size-3.5" />Send back</button>}
          <button type="button" className="btn-ghost h-7 text-micro" disabled={update.isPending} onClick={() => update.mutate({ id: t.id, status: 'CANCELLED' })}>Cancel task</button>
        </div>
      )}
      <ErrorNote error={update.error} />
    </li>
  );
}

function NewDocument({ projectId, kind, onClose }: { projectId: string; kind: string; onClose: () => void }) {
  const [title, setTitle] = useState(DOC_LABEL[kind] ?? kind);
  const [content, setContent] = useState('');
  const [passed, setPassed] = useState(false);
  const [openHigh, setOpenHigh] = useState('0');
  const add = trpc.engineering.addArtifact.useMutation({ onSuccess: onClose });
  const data = kind === 'TEST_REPORT' ? { passed } : kind === 'SECURITY_REPORT' ? { openHighOrCritical: Number(openHigh) } : undefined;
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }} title={`New ${DOC_LABEL[kind]?.toLowerCase() ?? 'document'}`} description="Saved as a draft. Someone other than you accepts it." width="lg">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); add.mutate({ projectId, kind: kind as (typeof DOC_KINDS)[number], title, content, data }); }}>
        <Field label="Title">{(fid) => <input id={fid} className="input" required value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label="Content" hint="Markdown is fine.">{(fid) => <textarea id={fid} className="input min-h-48 font-mono text-[12px]" required value={content} onChange={(e) => setContent(e.target.value)} />}</Field>
        {kind === 'TEST_REPORT' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={passed} onChange={(e) => setPassed(e.target.checked)} />Every test passed</label>}
        {kind === 'SECURITY_REPORT' && <Field label="Open high or critical findings">{(fid) => <input id={fid} type="number" min={0} className="input w-32" value={openHigh} onChange={(e) => setOpenHigh(e.target.value)} />}</Field>}
        <ErrorNote error={add.error} />
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={add.isPending}>Save draft</button></div>
      </form>
    </Dialog>
  );
}

function NewTask({ projectId, tasks, roles, onClose }: { projectId: string; tasks: Detail['tasks']; roles: Array<{ role: string; name: string }>; onClose: () => void }) {
  const [form, setForm] = useState({ title: '', description: '', role: 'developer', criteria: '', dependsOn: [] as string[] });
  const add = trpc.engineering.addTask.useMutation({ onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }} title="New task" description="One unit of work with its own branch." width="lg">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); add.mutate({ projectId, title: form.title, description: form.description, role: form.role, acceptanceCriteria: form.criteria.split('\n').map((s) => s.trim()).filter(Boolean), dependsOn: form.dependsOn }); }}>
        <Field label="Title">{(fid) => <input id={fid} className="input" required minLength={3} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}</Field>
        <Field label="What to build">{(fid) => <textarea id={fid} className="input min-h-24" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}</Field>
        <Field label="Acceptance criteria" hint="One per line: how anyone will know it is done.">{(fid) => <textarea id={fid} className="input min-h-20" required value={form.criteria} onChange={(e) => setForm({ ...form, criteria: e.target.value })} />}</Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Done by">{(fid) => <select id={fid} className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{roles.map((r) => <option key={r.role} value={r.role}>{r.name}</option>)}<option value="human">A person</option></select>}</Field>
          {tasks.length > 0 && <Field label="Starts after">{(fid) => <select id={fid} multiple className="input min-h-20" value={form.dependsOn} onChange={(e) => setForm({ ...form, dependsOn: [...e.target.selectedOptions].map((o) => o.value) })}>{tasks.filter((t) => t.status !== 'CANCELLED').map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select>}</Field>}
        </div>
        <ErrorNote error={add.error} />
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={add.isPending}>Add task</button></div>
      </form>
    </Dialog>
  );
}

const REQUESTABLE = [
  { kind: 'SCOPE', label: 'Scope and price' }, { kind: 'ACCEPTANCE', label: 'Customer acceptance' },
  { kind: 'PRODUCTION_DEPLOY', label: 'Production deployment' }, { kind: 'CUSTOMER_SYSTEM_ACCESS', label: 'Access to a customer system' },
] as const;

function RequestApproval({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ kind: (typeof REQUESTABLE)[number]['kind']; title: string; summary: string }>({ kind: 'SCOPE', title: '', summary: '' });
  const req = trpc.engineering.requestApproval.useMutation({ onSuccess: () => { setOpen(false); setForm({ ...form, title: '', summary: '' }); onDone(); } });
  if (!open) return <button type="button" className="btn-outline h-8 text-micro mt-3" onClick={() => setOpen(true)}><Plus className="size-3.5" />Request approval</button>;
  return (
    <form className="card p-4 space-y-3 mt-3" onSubmit={(e) => { e.preventDefault(); req.mutate({ projectId, ...form }); }}>
      <div className="grid sm:grid-cols-[200px_1fr] gap-3">
        <Field label="Kind">{(fid) => <select id={fid} className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as typeof form.kind })}>{REQUESTABLE.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}</select>}</Field>
        <Field label="Title">{(fid) => <input id={fid} className="input" required minLength={3} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}</Field>
      </div>
      <Field label="What will happen" hint="Plain words: what, for how much, what changes.">{(fid) => <textarea id={fid} className="input min-h-20" required minLength={10} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />}</Field>
      <ErrorNote error={req.error} />
      <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button type="submit" className="btn-primary" disabled={req.isPending}>Send for approval</button></div>
    </form>
  );
}
