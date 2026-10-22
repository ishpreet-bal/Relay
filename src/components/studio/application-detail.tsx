'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, CircleDashed, KeyRound, Pause, Play, RotateCcw, Rocket, FlaskConical } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/types';
import type { Manifest, ValidationIssue } from '@/server/studio/manifest';
import { Topbar } from '@/components/shell/topbar';
import { PageBody, Section } from '@/components/ui/page';
import { Kpi } from '@/components/ui/kpi';
import { Pill, type Tone } from '@/components/ui/pill';
import { Table, Td, Th } from '@/components/ui/table';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { ErrorNote, Loading } from '@/components/ui/states';
import { Ago, DateTime } from '@/components/ui/time';
import { cn } from '@/lib/utils';
import { APP_STATUS_TONE, Connections, type StudioCaps } from './studio-workspace';

type Detail = RouterOutputs['studio']['application'];
type Execution = Detail['executions'][number];
type Overrides = Record<string, unknown> & {
  branding?: { displayName?: string; primaryColor?: string };
  rules?: Record<string, string | number | boolean>;
  bindings?: Record<string, string>;
  disabledWorkflows?: string[];
  limits?: { maxExecutionsPerDay?: number; maxConcurrent?: number };
};

const RUN_TONE: Record<string, Tone> = { QUEUED: 'neutral', RUNNING: 'accent', WAITING_APPROVAL: 'warning', SUCCEEDED: 'positive', FAILED: 'negative', CANCELLED: 'neutral' };
const CONFIG_TONE: Record<string, Tone> = { VALID: 'accent', INVALID: 'negative', DEPLOYED: 'positive', SUPERSEDED: 'neutral', DRAFT: 'neutral' };
const triggerLabel = (t: Manifest['workflows'][number]['trigger']) =>
  t.type === 'schedule' ? `Schedule ${t.cron}${t.timezone ? ` (${t.timezone})` : ' (UTC)'}` : t.type === 'record_created' ? `When a ${t.collection} record is created` : t.type === 'webhook' ? 'Webhook' : 'Manual';

/** Runs the page's queued executions forward while it's open, for deployments without a worker. */
function useDriveRuns(appId: string, executions: Execution[]) {
  const utils = trpc.useUtils();
  const step = trpc.studio.step.useMutation();
  const recent = Date.now() - 30 * 60_000;
  const active = executions.filter((e) => ['QUEUED', 'RUNNING'].includes(e.status) && new Date(e.createdAt).getTime() > recent).map((e) => e.id).slice(0, 3);
  const key = active.join(',');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      for (const id of key.split(',')) {
        if (cancelled) return;
        await step.mutateAsync({ executionId: id }).catch(() => undefined);
      }
      if (cancelled) return;
      await utils.studio.application.invalidate({ id: appId });
      setTick((n) => n + 1);
    }, 1500);
    return () => { cancelled = true; clearTimeout(timer); };
    // step and utils are stable for the page's lifetime; re-running on them would double-drive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick, appId]);
}

export function ApplicationDetail({ id, caps }: { id: string; caps: StudioCaps }) {
  const q = trpc.studio.application.useQuery({ id }, { refetchInterval: 15_000 });
  useDriveRuns(id, q.data?.executions ?? []);
  if (q.isPending) return (<><Topbar title="Application" /><Loading /></>);
  if (q.error || !q.data) return (<><Topbar title="Application" /><PageBody><ErrorNote error={q.error ?? { message: 'Not found' }} /></PageBody></>);
  return <Loaded d={q.data} caps={caps} />;
}

function Loaded({ d, caps }: { d: Detail; caps: StudioCaps }) {
  const utils = trpc.useUtils();
  const refresh = () => utils.studio.application.invalidate({ id: d.app.id });
  const [editing, setEditing] = useState(false);
  const [openRun, setOpenRun] = useState<string | null>(null);
  const status = trpc.studio.setStatus.useMutation({ onSuccess: refresh });
  const rollback = trpc.studio.rollback.useMutation({ onSuccess: refresh });
  const upgrade = trpc.studio.upgrade.useMutation({ onSuccess: refresh });

  const active = d.configs.find((c) => c.id === d.app.activeConfigVersionId) ?? null;
  const latest = d.configs[0] ?? null;
  const shown = (active ?? latest)?.manifest as unknown as Manifest | undefined;
  const newer = d.template?.versions.filter((v) => v.id !== d.templateVersion?.id && compare(v.version, d.templateVersion?.version ?? '0.0.0') > 0) ?? [];
  const ok = d.health.last30Days.find((h) => h.status === 'SUCCEEDED')?.count ?? 0;
  const failed = d.health.last30Days.find((h) => h.status === 'FAILED')?.count ?? 0;

  return (
    <>
      <Topbar title={d.app.name} showClientSwitcher={false}
              actions={(
                <div className="flex gap-2">
                  {caps.canWrite && d.app.status === 'ACTIVE' && <button type="button" className="btn-outline h-8 text-micro" disabled={status.isPending} onClick={() => status.mutate({ applicationId: d.app.id, status: 'PAUSED' })}><Pause className="size-3.5" /> Pause</button>}
                  {caps.canDeploy && d.app.status === 'PAUSED' && <button type="button" className="btn-outline h-8 text-micro" disabled={status.isPending} onClick={() => status.mutate({ applicationId: d.app.id, status: 'ACTIVE' })}><Play className="size-3.5" /> Resume</button>}
                  {caps.canDeploy && d.deployments.length > 1 && <button type="button" className="btn-outline h-8 text-micro" disabled={rollback.isPending} onClick={() => { if (confirm('Redeploy the configuration that was live before this one?')) rollback.mutate({ applicationId: d.app.id }); }}><RotateCcw className="size-3.5" /> Roll back</button>}
                </div>
              )} />
      <PageBody width="wide" className="space-y-8">
        <div>
          <Link href="/studio" className="text-micro text-muted hover:text-ink inline-flex items-center gap-1"><ArrowLeft className="size-3.5" /> Studio</Link>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-micro">
            <Pill tone={APP_STATUS_TONE[d.app.status] ?? 'neutral'}>{d.app.status.toLowerCase()}</Pill>
            <span>{d.client?.name}</span><span className="text-muted">·</span>
            <span className="text-muted">{d.template ? `${d.template.name} v${d.templateVersion?.version}` : 'Custom'}</span><span className="text-muted">·</span>
            <span className="text-muted">{active ? `configuration v${active.version} live` : 'nothing deployed'}</span>
            <span className="text-muted">·</span><span className="text-muted">{d.app.deployment === 'SHARED' ? 'shared runtime' : 'dedicated'}</span>
          </div>
          <ErrorNote error={status.error ?? rollback.error ?? upgrade.error} className="mt-2" />
        </div>

        {caps.canWrite && newer.length > 0 && (
          <div className="card p-4 flex items-center gap-3 text-micro border-accent/40">
            <p className="flex-1">Template version {newer[0]!.version} is available. Upgrading keeps this customer&apos;s settings and creates a new configuration to test; nothing deploys by itself.</p>
            <button type="button" className="btn-outline h-8 text-micro" disabled={upgrade.isPending} onClick={() => upgrade.mutate({ applicationId: d.app.id, templateVersionId: newer[0]!.id })}>Upgrade to {newer[0]!.version}</button>
          </div>
        )}
        {upgrade.data && (
          <p className="text-micro">{upgrade.data.breaking.length ? <>Upgrade created configuration v{upgrade.data.config.version} with <strong>{upgrade.data.breaking.length} breaking change{upgrade.data.breaking.length === 1 ? '' : 's'}</strong>: {upgrade.data.breaking.join('; ')}. Review and test before deploying.</> : `Upgrade created configuration v${upgrade.data.config.version}; no breaking changes. Test it, then deploy.`}</p>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Runs today" value={d.health.runsToday} caption={`limit ${d.app.maxExecutionsPerDay}/day`} />
          <Kpi label="Succeeded (30 days)" value={ok} />
          <Kpi label="Failed (30 days)" value={failed} tone={failed ? 'negative' : undefined} />
          <Kpi label="Concurrency" value={d.app.maxConcurrent} caption="runs at once, this app only" />
        </div>

        {latest && <Gate d={d} latest={latest} caps={caps} onOpenRun={setOpenRun} />}

        <Section title="Configuration versions" hint="Every change is a new version; deployed versions never change. Branding, rules, roles, connections and limits are this customer's; the rest comes from the template."
                 action={caps.canWrite && <button type="button" className="btn-outline h-8 text-micro" onClick={() => setEditing(true)}>Edit configuration</button>}>
          <Table>
            <thead><tr><Th>Version</Th><Th>Status</Th><Th>Notes</Th><Th>Issues</Th><Th>Created</Th></tr></thead>
            <tbody>
              {d.configs.map((c) => {
                const issues = (c.validationErrors as unknown as ValidationIssue[] | null) ?? [];
                return (
                  <tr key={c.id}>
                    <Td className="num">v{c.version}{c.id === d.app.activeConfigVersionId && <Pill tone="positive" className="ml-2">live</Pill>}</Td>
                    <Td><Pill tone={CONFIG_TONE[c.status] ?? 'neutral'}>{c.status.toLowerCase()}</Pill></Td>
                    <Td className="text-muted">{c.notes ?? '—'}</Td>
                    <Td className={issues.length ? 'text-blocked text-[11px]' : 'text-muted'}>{issues.length ? issues.slice(0, 3).map((i) => `${i.path}: ${i.message}`).join('; ') : 'none'}</Td>
                    <Td className="text-muted"><Ago date={c.createdAt} /></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Section>

        {shown && <Workflows d={d} manifest={shown} caps={caps} onOpenRun={setOpenRun} />}
        <Runs d={d} onOpen={setOpenRun} />
        {shown && <Records d={d} manifest={shown} />}

        <Section title="Deployments">
          {!d.deployments.length ? <p className="card p-4 text-micro text-muted">Not deployed yet.</p> : (
            <Table>
              <thead><tr><Th>When</Th><Th>Kind</Th><Th>Environment</Th><Th>Configuration</Th><Th>Notes</Th></tr></thead>
              <tbody>
                {d.deployments.map((x) => (
                  <tr key={x.id}>
                    <Td><DateTime date={x.createdAt} /></Td>
                    <Td><Pill tone={x.kind === 'ROLLBACK' ? 'warning' : 'neutral'}>{x.kind.toLowerCase()}</Pill></Td>
                    <Td>{x.environment.toLowerCase()}</Td>
                    <Td className="num">v{d.configs.find((c) => c.id === x.configVersionId)?.version ?? '?'}</Td>
                    <Td className="text-muted">{x.notes ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>

        <Connections caps={caps} clientId={d.app.clientId} />
      </PageBody>
      {editing && latest && <ConfigEditor d={d} onClose={() => setEditing(false)} />}
      {openRun && <RunDialog id={openRun} canDecide={caps.canRun} onClose={() => setOpenRun(null)} />}
    </>
  );
}

function compare(a: string, b: string) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

/** The newest configuration's path to production: tests on synthetic input, then deploy. */
function Gate({ d, latest, caps, onOpenRun }: { d: Detail; latest: Detail['configs'][number]; caps: StudioCaps; onOpenRun: (id: string) => void }) {
  const utils = trpc.useUtils();
  const refresh = () => utils.studio.application.invalidate({ id: d.app.id });
  const run = trpc.studio.run.useMutation();
  const deploy = trpc.studio.deploy.useMutation({ onSuccess: refresh });
  const [testing, setTesting] = useState(false);
  const gate = d.gate;
  const missing = gate ? gate.required.filter((k) => !gate.passed.includes(k)) : [];
  const isLive = latest.id === d.app.activeConfigVersionId;
  const manifest = latest.manifest as unknown as Manifest;
  const triggered = new Set(manifest.workflows.filter((w) => w.trigger.type === 'record_created').map((w) => w.key));

  const runTests = async () => {
    setTesting(true);
    try {
      // Record-triggered workflows are tested by the runs that create their records.
      for (const w of manifest.workflows.filter((x) => !triggered.has(x.key))) {
        await run.mutateAsync({ applicationId: d.app.id, workflowKey: w.key, test: true, configVersionId: latest.id });
      }
    } finally {
      setTesting(false);
      refresh();
    }
  };
  const waiting = d.executions.filter((e) => e.isTest && e.configVersionId === latest.id && e.status === 'WAITING_APPROVAL');

  return (
    <Section title={`Configuration v${latest.version}: path to production`} hint="Tests run on each workflow's synthetic input. They write only test records, and call only sandbox connections (production connections are dry-run). Production needs every workflow to have passed in this exact version.">
      <div className="card p-4 space-y-3">
        {latest.status === 'INVALID' ? (
          <p className="text-micro text-blocked">This version has validation issues; fix them in a new version before testing.</p>
        ) : (
          <>
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {gate?.required.map((k) => {
                const passed = gate.passed.includes(k);
                return (
                  <li key={k} className="flex items-center gap-2 text-micro">
                    {passed ? <CheckCircle2 className="size-4 text-cleared" /> : <CircleDashed className="size-4 text-muted" />}
                    <span className="font-mono">{k}</span>
                    {triggered.has(k) && <span className="text-[11px] text-muted">(record-triggered)</span>}
                  </li>
                );
              })}
            </ul>
            {waiting.length > 0 && (
              <p className="text-micro text-held">
                {waiting.length} test run{waiting.length === 1 ? ' is' : 's are'} waiting for an approval:{' '}
                {waiting.map((w) => <button key={w.id} type="button" className="underline mr-2" onClick={() => onOpenRun(w.id)}>{w.workflowKey}</button>)}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {caps.canRun && <button type="button" className="btn-outline h-8 text-micro" disabled={testing} onClick={runTests}><FlaskConical className="size-3.5" /> {testing ? 'Starting…' : 'Run all tests'}</button>}
              {caps.canWrite && !isLive && <button type="button" className="btn-outline h-8 text-micro" disabled={deploy.isPending} onClick={() => deploy.mutate({ applicationId: d.app.id, configVersionId: latest.id, environment: 'SANDBOX' })}>Deploy to sandbox</button>}
              {caps.canDeploy && (!isLive || d.app.status !== 'ACTIVE') && (
                <button type="button" className="btn-primary h-8 text-micro" disabled={deploy.isPending || missing.length > 0}
                        title={missing.length ? `Not yet passed: ${missing.join(', ')}` : undefined}
                        onClick={() => { if (confirm(`Deploy configuration v${latest.version} to production for ${d.client?.name}?`)) deploy.mutate({ applicationId: d.app.id, configVersionId: latest.id, environment: 'PRODUCTION' }); }}>
                  <Rocket className="size-3.5" /> Deploy to production
                </button>
              )}
              {isLive && d.app.status === 'ACTIVE' && <span className="text-micro text-cleared self-center">Live in production.</span>}
            </div>
          </>
        )}
        <ErrorNote error={run.error ?? deploy.error} />
      </div>
    </Section>
  );
}

function Workflows({ d, manifest, caps, onOpenRun }: { d: Detail; manifest: Manifest; caps: StudioCaps; onOpenRun: (id: string) => void }) {
  const utils = trpc.useUtils();
  const [running, setRunning] = useState<Manifest['workflows'][number] | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const rotate = trpc.studio.rotateWebhookToken.useMutation({ onSuccess: (r) => { setToken(r.token); utils.studio.application.invalidate({ id: d.app.id }); } });
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const hasWebhooks = manifest.workflows.some((w) => w.trigger.type === 'webhook');
  return (
    <Section title="Workflows" hint={d.app.activeConfigVersionId ? 'As deployed.' : 'From the newest configuration (not deployed).'}
             action={caps.canSecrets && hasWebhooks && (
               <button type="button" className="btn-outline h-8 text-micro" disabled={rotate.isPending}
                       onClick={() => { if (!d.app.hasWebhookToken || confirm('Issue a new webhook token? The current one stops working immediately.')) rotate.mutate({ applicationId: d.app.id }); }}>
                 <KeyRound className="size-3.5" /> {d.app.hasWebhookToken ? 'Rotate webhook token' : 'Issue webhook token'}
               </button>
             )}>
      <ErrorNote error={rotate.error} />
      {token && (
        <div className="card p-3 mb-3 text-micro border-held/40">
          <p className="font-medium mb-1">Webhook token. Copy it now; it won&apos;t be shown again.</p>
          <code className="block font-mono text-[11px] break-all bg-raised rounded p-2 select-all">{token}</code>
          <p className="text-muted mt-1">The customer&apos;s system sends it as <span className="font-mono">Authorization: Bearer …</span>, with an optional <span className="font-mono">Idempotency-Key</span> header so a retried delivery starts one run.</p>
        </div>
      )}
      <ul className="card divide-y divide-hairline">
        {manifest.workflows.map((w) => (
          <li key={w.key} className="p-3 text-micro flex flex-wrap items-start gap-3">
            <div className="flex-1 min-w-[240px]">
              <p className="font-medium">{w.name} <span className="font-mono text-[11px] text-muted">{w.key}</span></p>
              <p className="text-muted">{triggerLabel(w.trigger)} · {w.steps.length} step{w.steps.length === 1 ? '' : 's'}: {w.steps.map((s) => s.type).join(' → ')}</p>
              {w.trigger.type === 'webhook' && <p className="font-mono text-[11px] text-muted mt-0.5 break-all">POST {origin}/api/studio/hooks/{d.app.id}/{w.key}</p>}
            </div>
            {caps.canRun && d.app.status === 'ACTIVE' && d.app.activeConfigVersionId && w.trigger.type !== 'record_created' && (
              <button type="button" className="btn-outline h-7 text-[11px]" onClick={() => setRunning(w)}><Play className="size-3" /> Run now</button>
            )}
          </li>
        ))}
      </ul>
      {running && <RunNow d={d} workflow={running} manifest={manifest} onClose={() => setRunning(null)} onStarted={onOpenRun} />}
    </Section>
  );
}

function RunNow({ d, workflow, manifest, onClose, onStarted }: { d: Detail; workflow: Manifest['workflows'][number]; manifest: Manifest; onClose: () => void; onStarted: (id: string) => void }) {
  const utils = trpc.useUtils();
  const coll = manifest.collections.find((c) => workflow.steps.some((s) => (s.config as { collection?: string }).collection === c.key));
  const [text, setText] = useState(() => JSON.stringify(Object.fromEntries((coll?.fields ?? []).map((f) => [f.key, ''])), null, 2));
  const [parseError, setParseError] = useState<string | null>(null);
  const run = trpc.studio.run.useMutation({ onSuccess: (e) => { utils.studio.application.invalidate({ id: d.app.id }); onClose(); onStarted(e.id); } });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} width="lg" title={`Run ${workflow.name}`} description="A production run for this customer. It writes real records and calls their production connections.">
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        try { const input = JSON.parse(text); setParseError(null); run.mutate({ applicationId: d.app.id, workflowKey: workflow.key, input }); } catch { setParseError('Input must be a JSON object.'); }
      }}>
        <Field label="Input (JSON)" error={parseError}>{(id) => <textarea id={id} className="input h-56 font-mono text-[12px] py-2" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />}</Field>
        <ErrorNote error={run.error} />
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={run.isPending}>Start run</button></div>
      </form>
    </Dialog>
  );
}

function Runs({ d, onOpen }: { d: Detail; onOpen: (id: string) => void }) {
  return (
    <Section title="Recent runs" hint="Test runs use synthetic input and test records only.">
      {!d.executions.length ? <p className="card p-4 text-micro text-muted">No runs yet.</p> : (
        <Table>
          <thead><tr><Th>Started</Th><Th>Workflow</Th><Th>Trigger</Th><Th>Status</Th><Th className="text-right">Duration</Th><Th>Error</Th></tr></thead>
          <tbody>
            {d.executions.map((e) => (
              <tr key={e.id} className="hover:bg-raised/50 cursor-pointer" onClick={() => onOpen(e.id)}>
                <Td><Ago date={e.createdAt} /></Td>
                <Td className="font-mono text-[12px]">{e.workflowKey}{e.isTest && <Pill className="ml-2">test</Pill>}</Td>
                <Td className="text-muted">{e.trigger.toLowerCase()}</Td>
                <Td><Pill tone={RUN_TONE[e.status] ?? 'neutral'}>{e.status.toLowerCase().replace('_', ' ')}</Pill></Td>
                <Td className="text-right num text-muted">{e.durationMs !== null ? `${(e.durationMs / 1000).toFixed(1)}s` : '—'}</Td>
                <Td className="text-blocked text-[11px] max-w-[280px] truncate">{e.error ?? ''}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Section>
  );
}

interface StepLog { key: string; type: string; status: string; startedAt: string; durationMs: number; output?: unknown; error?: string }

function RunDialog({ id, canDecide, onClose }: { id: string; canDecide: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const q = trpc.studio.execution.useQuery({ id }, { refetchInterval: (query) => (['QUEUED', 'RUNNING'].includes(query.state.data?.status ?? '') ? 2000 : false) });
  const [note, setNote] = useState('');
  const decide = trpc.studio.decide.useMutation({ onSuccess: (e) => { utils.studio.execution.invalidate({ id }); utils.studio.application.invalidate({ id: e.applicationId }); } });
  const e = q.data;
  const log = ((e?.steps as { log?: StepLog[] } | null)?.log) ?? [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} width="lg" title={e ? `${e.workflowKey} run` : 'Run'} description={e ? `${e.isTest ? 'Test run' : 'Production run'} · ${e.trigger.toLowerCase()}` : undefined}>
      {!e ? <Loading /> : (
        <div className="space-y-4 text-micro">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={RUN_TONE[e.status] ?? 'neutral'}>{e.status.toLowerCase().replace('_', ' ')}</Pill>
            <span className="text-muted">created <Ago date={e.createdAt} /></span>
            {e.durationMs !== null && <span className="text-muted">· {(e.durationMs / 1000).toFixed(2)}s</span>}
          </div>
          {e.error && <p className="text-blocked">{e.error}</p>}
          <div>
            <p className="eyebrow mb-1">Input</p>
            <pre className="bg-raised rounded p-2 text-[11px] overflow-x-auto max-h-40">{JSON.stringify(e.input, null, 2)}</pre>
          </div>
          <div>
            <p className="eyebrow mb-1">Steps</p>
            {!log.length ? <p className="text-muted">{e.status === 'QUEUED' ? 'Waiting to start.' : 'No steps recorded.'}</p> : (
              <ol className="space-y-1.5">
                {log.map((s, i) => (
                  <li key={`${s.key}-${i}`} className="card p-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{s.key}</span><span className="text-muted">{s.type}</span>
                      <span className="flex-1" />
                      <Pill tone={s.status === 'SUCCEEDED' ? 'positive' : s.status === 'FAILED' ? 'negative' : s.status === 'WAITING' ? 'warning' : 'neutral'}>{s.status.toLowerCase()}</Pill>
                      <span className="num text-muted">{s.durationMs}ms</span>
                    </div>
                    {s.error && <p className={cn('mt-1', s.status === 'FAILED' ? 'text-blocked' : 'text-muted')}>{s.error}</p>}
                    {s.output !== undefined && <pre className="mt-1 text-[11px] text-muted overflow-x-auto max-h-28">{JSON.stringify(s.output, null, 2)}</pre>}
                  </li>
                ))}
              </ol>
            )}
          </div>
          {e.status === 'WAITING_APPROVAL' && canDecide && (
            <div className="card p-3 space-y-2 border-held/40">
              <p className="font-medium">This run is waiting for a decision.</p>
              <input className="input" placeholder="Note (optional)" value={note} onChange={(ev) => setNote(ev.target.value)} maxLength={500} />
              <div className="flex gap-2">
                <button type="button" className="btn-primary h-8 text-micro" disabled={decide.isPending} onClick={() => decide.mutate({ executionId: e.id, decision: 'APPROVE', note: note || null })}>Approve</button>
                <button type="button" className="btn-outline h-8 text-micro" disabled={decide.isPending} onClick={() => decide.mutate({ executionId: e.id, decision: 'REJECT', note: note || null })}>Reject</button>
              </div>
              <ErrorNote error={decide.error} />
            </div>
          )}
        </div>
      )}
      <ErrorNote error={q.error} />
    </Dialog>
  );
}

function Records({ d, manifest }: { d: Detail; manifest: Manifest }) {
  const [collection, setCollection] = useState(manifest.collections[0]?.key ?? '');
  const [isTest, setIsTest] = useState(false);
  const q = trpc.studio.records.useQuery({ applicationId: d.app.id, collection, isTest }, { enabled: !!collection });
  const coll = manifest.collections.find((c) => c.key === collection);
  if (!manifest.collections.length) return null;
  const count = (key: string, test: boolean) => d.records.find((r) => r.collection === key && r.isTest === test)?.count ?? 0;
  return (
    <Section title="Records" hint="This customer's data in this application only."
             action={(
               <div className="flex gap-1 text-[11px]">
                 {[false, true].map((t) => (
                   <button key={String(t)} type="button" onClick={() => setIsTest(t)} aria-pressed={isTest === t}
                           className={cn('h-7 px-2 rounded', isTest === t ? 'bg-raised text-ink' : 'text-muted')}>{t ? 'Test' : 'Production'}</button>
                 ))}
               </div>
             )}>
      <div className="flex flex-wrap gap-2 mb-2">
        {manifest.collections.map((c) => (
          <button key={c.key} type="button" onClick={() => setCollection(c.key)} aria-pressed={collection === c.key}
                  className={cn('btn-outline h-7 text-[11px]', collection === c.key && 'border-accent')}>
            {manifest.terminology[c.key] ?? c.label} <span className="num text-muted">{count(c.key, isTest)}</span>
          </button>
        ))}
      </div>
      <ErrorNote error={q.error} />
      {q.isPending ? <Loading /> : !q.data?.length ? <p className="card p-4 text-micro text-muted">No {isTest ? 'test' : 'production'} records.</p> : (
        <Table>
          <thead><tr>{coll?.fields.map((f) => <Th key={f.key}>{f.label}</Th>)}<Th>Created</Th></tr></thead>
          <tbody>
            {q.data.map((r) => {
              const data = r.data as Record<string, unknown>;
              return (
                <tr key={r.id}>
                  {coll?.fields.map((f) => <Td key={f.key} className={f.type === 'number' ? 'num' : undefined}>{data[f.key] === undefined ? <span className="text-muted">—</span> : String(data[f.key])}</Td>)}
                  <Td className="text-muted"><Ago date={r.createdAt} /></Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Section>
  );
}

/** Edits this customer's overrides; the template stays as published. Validated as you type, saved as a new version. */
function ConfigEditor({ d, onClose }: { d: Detail; onClose: () => void }) {
  const utils = trpc.useUtils();
  const latest = d.configs[0]!;
  const template = (d.templateVersion?.manifest ?? latest.manifest) as unknown as Manifest;
  const [overrides, setOverrides] = useState<Overrides>(() => (latest.overrides ?? {}) as Overrides);
  const [json, setJson] = useState(() => JSON.stringify(latest.overrides ?? {}, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const connections = trpc.studio.connections.useQuery({ clientId: d.app.clientId });
  const preview = trpc.studio.previewConfig.useMutation();
  const save = trpc.studio.saveConfig.useMutation({ onSuccess: () => { utils.studio.application.invalidate({ id: d.app.id }); onClose(); } });

  const update = (next: Overrides) => { setOverrides(next); setJson(JSON.stringify(next, null, 2)); setJsonError(null); };
  const serialized = useMemo(() => JSON.stringify(overrides), [overrides]);
  useEffect(() => {
    const t = setTimeout(() => preview.mutate({ applicationId: d.app.id, overrides: JSON.parse(serialized) }), 500);
    return () => clearTimeout(t);
    // preview is stable; validate when the overrides change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, d.app.id]);

  const rules = template.rules ?? {};
  const merged = preview.data?.manifest as Manifest | null | undefined;
  const issues = preview.data?.issues ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} width="lg" title={`Edit configuration (new v${latest.version + 1})`} description="The template's modules, collections and workflows stay as published; these are this customer's settings on top.">
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save.mutate({ applicationId: d.app.id, overrides, notes: notes || null }); }}>
        <fieldset className="grid grid-cols-2 gap-3">
          <legend className="eyebrow mb-2 col-span-2">Branding</legend>
          <Field label="Display name">{(id) => <input id={id} className="input" value={overrides.branding?.displayName ?? ''} placeholder={template.branding.displayName}
                                                     onChange={(e) => update({ ...overrides, branding: { ...overrides.branding, displayName: e.target.value || undefined } })} />}</Field>
          <Field label="Primary colour">{(id) => <input id={id} className="input font-mono" value={overrides.branding?.primaryColor ?? ''} placeholder={template.branding.primaryColor}
                                                       onChange={(e) => update({ ...overrides, branding: { ...overrides.branding, primaryColor: e.target.value || undefined } })} />}</Field>
        </fieldset>

        {Object.keys(rules).length > 0 && (
          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="eyebrow mb-2 col-span-2">Business rules</legend>
            {Object.entries(rules).map(([k, v]) => (
              <Field key={k} label={k.replace(/_/g, ' ')} hint={`Template default: ${String(v)}`}>{(id) => (
                typeof v === 'boolean' ? (
                  <select id={id} className="input" value={String(overrides.rules?.[k] ?? v)} onChange={(e) => update({ ...overrides, rules: { ...overrides.rules, [k]: e.target.value === 'true' } })}>
                    <option value="true">Yes</option><option value="false">No</option>
                  </select>
                ) : (
                  <input id={id} className="input" type={typeof v === 'number' ? 'number' : 'text'} value={String(overrides.rules?.[k] ?? '')} placeholder={String(v)}
                         onChange={(e) => {
                           const next = { ...overrides.rules };
                           if (e.target.value === '') delete next[k];
                           else next[k] = typeof v === 'number' ? Number(e.target.value) : e.target.value;
                           update({ ...overrides, rules: next });
                         }} />
                )
              )}</Field>
            ))}
          </fieldset>
        )}

        {template.integrations.length > 0 && (
          <fieldset className="space-y-3">
            <legend className="eyebrow mb-2">Connections</legend>
            {template.integrations.map((integ) => (
              <Field key={integ.key} label={`${integ.key}${integ.required ? ' (required)' : ''}`} hint={integ.purpose}>{(id) => (
                <select id={id} className="input" value={overrides.bindings?.[integ.key] ?? ''}
                        onChange={(e) => { const b = { ...overrides.bindings }; if (e.target.value) b[integ.key] = e.target.value; else delete b[integ.key]; update({ ...overrides, bindings: b }); }}>
                  <option value="">Not connected</option>
                  {connections.data?.filter((c) => c.provider === integ.provider && c.status === 'CONNECTED').map((c) => <option key={c.id} value={c.id}>{c.label}{c.isSandbox ? ' (sandbox)' : ''}</option>)}
                </select>
              )}</Field>
            ))}
          </fieldset>
        )}

        <fieldset className="space-y-1.5">
          <legend className="eyebrow mb-2">Workflows</legend>
          {template.workflows.map((w) => {
            const off = overrides.disabledWorkflows?.includes(w.key) ?? false;
            return (
              <label key={w.key} className="flex items-center gap-2 text-micro">
                <input type="checkbox" checked={!off} onChange={(e) => {
                  const set = new Set(overrides.disabledWorkflows ?? []);
                  if (e.target.checked) set.delete(w.key); else set.add(w.key);
                  update({ ...overrides, disabledWorkflows: set.size ? [...set] : undefined });
                }} />
                {w.name} <span className="text-muted">({triggerLabel(w.trigger)})</span>
              </label>
            );
          })}
        </fieldset>

        <fieldset className="grid grid-cols-2 gap-3">
          <legend className="eyebrow mb-2 col-span-2">Limits</legend>
          <Field label="Runs per day">{(id) => <input id={id} type="number" min={1} max={10000} className="input" value={overrides.limits?.maxExecutionsPerDay ?? ''} placeholder={String(template.limits.maxExecutionsPerDay)}
                                                    onChange={(e) => update({ ...overrides, limits: { ...overrides.limits, maxExecutionsPerDay: e.target.value ? Number(e.target.value) : undefined } })} />}</Field>
          <Field label="Runs at once">{(id) => <input id={id} type="number" min={1} max={10} className="input" value={overrides.limits?.maxConcurrent ?? ''} placeholder={String(template.limits.maxConcurrent)}
                                                    onChange={(e) => update({ ...overrides, limits: { ...overrides.limits, maxConcurrent: e.target.value ? Number(e.target.value) : undefined } })} />}</Field>
        </fieldset>

        <details>
          <summary className="eyebrow cursor-pointer">Advanced: overrides as JSON</summary>
          <Field label="Overrides" error={jsonError} className="mt-2" hint="Terminology, roles, extra fields and module settings can be set here. Same rules as the form.">{(id) => (
            <textarea id={id} className="input h-48 font-mono text-[12px] py-2" spellCheck={false} value={json}
                      onChange={(e) => { setJson(e.target.value); try { setOverrides(JSON.parse(e.target.value)); setJsonError(null); } catch { setJsonError('Not valid JSON yet.'); } }} />
          )}</Field>
        </details>

        <div className="card p-3 text-micro">
          {preview.isPending && !preview.data ? <p className="text-muted">Checking…</p>
            : issues.length ? (
              <>
                <p className="text-blocked font-medium mb-1">{issues.length} issue{issues.length === 1 ? '' : 's'}. You can save, but an invalid version can&apos;t be tested or deployed.</p>
                <ul className="list-disc pl-4 text-blocked">{issues.map((i, n) => <li key={n}><span className="font-mono">{i.path}</span>: {i.message}</li>)}</ul>
              </>
            ) : merged ? <p className="text-cleared">Valid. {merged.workflows.length} workflow{merged.workflows.length === 1 ? '' : 's'}, shown to users as “{merged.branding.displayName}”.</p> : null}
          <ErrorNote error={preview.error} />
        </div>

        <Field label="What changed">{(id) => <input id={id} className="input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="e.g. Raised escalation threshold to 75" />}</Field>
        <ErrorNote error={save.error} />
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={save.isPending || !!jsonError}>Save v{latest.version + 1}</button></div>
      </form>
    </Dialog>
  );
}
