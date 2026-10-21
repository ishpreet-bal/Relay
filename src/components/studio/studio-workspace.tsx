'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AppWindow, Copy, Plug, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/types';
import { useActiveClient } from '@/components/shell/active-client';
import { Topbar } from '@/components/shell/topbar';
import { PageBody, Section } from '@/components/ui/page';
import { Kpi } from '@/components/ui/kpi';
import { Pill, type Tone } from '@/components/ui/pill';
import { Table, Td, Th } from '@/components/ui/table';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { EmptyState, ErrorNote, Loading } from '@/components/ui/states';
import { Ago } from '@/components/ui/time';
import { cn, formatMoney } from '@/lib/utils';

type Template = RouterOutputs['studio']['templates'][number];
export interface StudioCaps { canWrite: boolean; canDeploy: boolean; canSecrets: boolean; canRun: boolean }

export const APP_STATUS_TONE: Record<string, Tone> = { DRAFT: 'neutral', TESTING: 'accent', ACTIVE: 'positive', PAUSED: 'warning', ARCHIVED: 'neutral' };
const TABS = ['applications', 'templates', 'connections', 'modules'] as const;
type Tab = (typeof TABS)[number];

/**
 * Studio: customer applications assembled from templates. Applications are
 * listed by customer; templates are versioned manifests over shared modules;
 * connections are each customer's own systems.
 */
export function StudioWorkspace(caps: StudioCaps) {
  const [tab, setTab] = useState<Tab>('applications');
  const [creating, setCreating] = useState<{ templateVersionId?: string } | null>(null);
  return (
    <>
      <Topbar title="Studio"
              actions={caps.canWrite && (
                <button type="button" className="btn-primary h-8 text-micro" onClick={() => setCreating({})}><Plus className="size-3.5" /> New application</button>
              )} />
      <PageBody width="wide" className="space-y-6">
        <div role="tablist" className="flex gap-1 border-b border-hairline">
          {TABS.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                    className={cn('px-3 h-9 text-micro capitalize border-b-2 -mb-px', tab === t ? 'border-accent text-ink font-medium' : 'border-transparent text-muted hover:text-ink')}>
              {t}
            </button>
          ))}
        </div>
        {tab === 'applications' && <Applications caps={caps} onCreate={() => setCreating({})} />}
        {tab === 'templates' && <Templates caps={caps} onUse={(templateVersionId) => setCreating({ templateVersionId })} />}
        {tab === 'connections' && <Connections caps={caps} />}
        {tab === 'modules' && <Modules />}
      </PageBody>
      {creating && <CreateApplication initialTemplateVersionId={creating.templateVersionId} onClose={() => setCreating(null)} />}
    </>
  );
}

function Applications({ caps, onCreate }: { caps: StudioCaps; onCreate: () => void }) {
  const { clientId } = useActiveClient();
  const apps = trpc.studio.applications.useQuery({ clientId }, { refetchInterval: 30_000 });
  const rows = apps.data ?? [];
  const active = rows.filter((a) => a.status === 'ACTIVE').length;
  const runs = rows.reduce((n, a) => n + a.runsToday, 0);
  const failed = rows.reduce((n, a) => n + a.failedToday, 0);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Applications" value={apps.data ? rows.length : '—'} />
        <Kpi label="In production" value={apps.data ? active : '—'} />
        <Kpi label="Runs today" value={apps.data ? runs : '—'} caption="production only" />
        <Kpi label="Failed today" value={apps.data ? failed : '—'} tone={failed ? 'negative' : undefined} />
      </div>
      <ErrorNote error={apps.error} />
      {apps.isPending ? <Loading /> : !rows.length ? (
        <EmptyState icon={AppWindow} title="No customer applications yet"
                    action={caps.canWrite && <button type="button" className="btn-primary" onClick={onCreate}>Create one from a template</button>}>
          An application is a template configured for one customer: their branding, rules, roles and connections. It runs on the shared platform, isolated from every other customer.
        </EmptyState>
      ) : (
        <Table>
          <thead><tr><Th>Application</Th><Th>Customer</Th><Th>Template</Th><Th>Status</Th><Th className="text-right">Runs today</Th><Th>Updated</Th></tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="hover:bg-raised/50">
                <Td><Link href={`/studio/apps/${a.id}`} className="font-medium hover:underline">{a.name}</Link></Td>
                <Td>{a.client.name}</Td>
                <Td className="text-muted">{a.template ? `${a.template.name} · ${a.template.industry}` : 'Custom'}</Td>
                <Td><Pill tone={APP_STATUS_TONE[a.status] ?? 'neutral'}>{a.status.toLowerCase()}</Pill></Td>
                <Td className="text-right num">{a.runsToday}{a.failedToday ? <span className="text-blocked"> · {a.failedToday} failed</span> : null}</Td>
                <Td className="text-muted"><Ago date={a.updatedAt} /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

function Templates({ caps, onUse }: { caps: StudioCaps; onUse: (templateVersionId: string) => void }) {
  const templates = trpc.studio.templates.useQuery();
  const [forking, setForking] = useState<Template | null>(null);
  return (
    <Section title="Templates" hint="Each template is a tested, versioned configuration of the shared modules. Customer applications pin a version and upgrade deliberately. Built-ins are shared by every workspace; copy one to release your own versions.">
      <ErrorNote error={templates.error} />
      {templates.isPending ? <Loading /> : (
        <div className="grid md:grid-cols-2 gap-3">
          {templates.data?.map((t) => {
            const latest = t.versions[0];
            return (
              <article key={t.id} className="card p-4 flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold">{t.name}</h3>
                    <p className="text-[11px] text-muted">{t.industry} · {latest ? `v${latest.version}` : 'no published version'} · {t._count.applications} app{t._count.applications === 1 ? '' : 's'}</p>
                  </div>
                  <Pill tone={t.builtin ? 'accent' : 'neutral'}>{t.builtin ? 'built-in' : 'workspace'}</Pill>
                </div>
                <p className="text-micro text-muted">{t.description}</p>
                {!!t.useCases.length && <p className="text-[11px]"><span className="text-muted">Covers:</span> {t.useCases.join(', ')}</p>}
                <dl className="grid grid-cols-3 gap-2 text-[11px] mt-1">
                  <div><dt className="text-muted">Build estimate</dt><dd className="num">{t.buildHoursEstimate ?? '—'} h</dd></div>
                  <div><dt className="text-muted">Setup (suggested)</dt><dd className="num">{t.recommendedSetupCents ? formatMoney(t.recommendedSetupCents) : '—'}</dd></div>
                  <div><dt className="text-muted">Monthly (suggested)</dt><dd className="num">{t.recommendedMonthlyCents ? formatMoney(t.recommendedMonthlyCents) : '—'}</dd></div>
                </dl>
                <p className="text-[10px] text-muted">Estimates are starting points, replaced by measured delivery data as projects complete.</p>
                {!!t.knownLimitations.length && <ul className="text-[11px] text-muted list-disc pl-4">{t.knownLimitations.map((l) => <li key={l}>{l}</li>)}</ul>}
                {caps.canWrite && latest && (
                  <div className="flex gap-2 mt-auto pt-2">
                    <button type="button" className="btn-primary h-8 text-micro" onClick={() => onUse(latest.id)}>Use for a customer</button>
                    <button type="button" className="btn-outline h-8 text-micro" onClick={() => setForking(t)}><Copy className="size-3.5" /> Copy to workspace</button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {forking && <ForkTemplate template={forking} onClose={() => setForking(null)} />}
    </Section>
  );
}

function ForkTemplate({ template, onClose }: { template: Template; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [name, setName] = useState(`${template.name} (ours)`);
  const [slug, setSlug] = useState(`${template.slug}-ours`.slice(0, 60));
  const fork = trpc.studio.forkTemplate.useMutation({ onSuccess: () => { utils.studio.templates.invalidate(); onClose(); } });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Copy ${template.name}`} description="Your copy starts at 1.0.0 with the current manifest. Apps already using the original are not affected.">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); fork.mutate({ templateVersionId: template.versions[0]!.id, name, slug }); }}>
        <Field label="Name">{(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Slug" hint="Lowercase letters, numbers and dashes.">{(id) => <input id={id} className="input" value={slug} onChange={(e) => setSlug(e.target.value)} />}</Field>
        <ErrorNote error={fork.error} />
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={fork.isPending}>Copy</button></div>
      </form>
    </Dialog>
  );
}

function CreateApplication({ initialTemplateVersionId, onClose }: { initialTemplateVersionId?: string; onClose: () => void }) {
  const router = useRouter();
  const { clients, clientId: active } = useActiveClient();
  const templates = trpc.studio.templates.useQuery();
  const [clientId, setClientId] = useState(active ?? clients[0]?.id ?? '');
  const [templateVersionId, setTemplateVersionId] = useState(initialTemplateVersionId ?? '');
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const create = trpc.studio.createApplication.useMutation({ onSuccess: (r) => router.push(`/studio/apps/${r.app.id}`) });
  const options = (templates.data ?? []).flatMap((t) => t.versions.map((v) => ({ id: v.id, label: `${t.name} · v${v.version}${t.builtin ? '' : ' (workspace)'}` })));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="New customer application" description="Starts as a draft. Nothing runs for the customer until a configuration passes its tests and is deployed.">
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        create.mutate({ clientId, templateVersionId, name, overrides: displayName ? { branding: { displayName } } : {} });
      }}>
        <Field label="Customer">{(id) => (
          <select id={id} className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
            <option value="" disabled>Choose…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}</Field>
        <Field label="Template">{(id) => (
          <select id={id} className="input" value={templateVersionId} onChange={(e) => setTemplateVersionId(e.target.value)} required>
            <option value="" disabled>{templates.isPending ? 'Loading…' : 'Choose…'}</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        )}</Field>
        <Field label="Application name">{(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} placeholder="e.g. Quality claims" />}</Field>
        <Field label="Name the customer's users see" hint="Optional; you can change branding, rules and connections after creating it.">{(id) => <input id={id} className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={120} />}</Field>
        <ErrorNote error={create.error} />
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={create.isPending || !clientId || !templateVersionId || !name}>Create draft</button></div>
      </form>
    </Dialog>
  );
}

export function Connections({ caps, clientId: fixedClientId }: { caps: StudioCaps; clientId?: string }) {
  const { clientId: active, clients } = useActiveClient();
  const clientId = fixedClientId ?? active;
  const utils = trpc.useUtils();
  const list = trpc.studio.connections.useQuery({ clientId });
  const check = trpc.studio.checkConnection.useMutation({ onSettled: () => utils.studio.connections.invalidate() });
  const off = trpc.studio.disconnect.useMutation({ onSuccess: () => utils.studio.connections.invalidate() });
  const [adding, setAdding] = useState(false);
  const name = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Customer';
  return (
    <Section title="Connections" hint="Each customer's own systems. Secrets are encrypted at rest and never shown again after saving. Test runs only call connections marked as sandbox; production connections are dry-run during tests."
             action={caps.canSecrets && <button type="button" className="btn-outline h-8 text-micro" onClick={() => setAdding(true)}><Plus className="size-3.5" /> Add connection</button>}>
      <ErrorNote error={list.error ?? check.error ?? off.error} />
      {check.data && <p className={cn('text-micro mb-2', check.data.ok ? 'text-cleared' : 'text-blocked')}>{check.data.ok ? 'Reachable' : 'Not reachable'}: {check.data.detail}</p>}
      {list.isPending ? <Loading /> : !list.data?.length ? (
        <EmptyState icon={Plug} title="No connections">Add one when a customer&apos;s application needs to call their own API.</EmptyState>
      ) : (
        <Table>
          <thead><tr><Th>Connection</Th><Th>Customer</Th><Th>Address</Th><Th>Secret</Th><Th>Status</Th><Th /></tr></thead>
          <tbody>
            {list.data.map((c) => (
              <tr key={c.id}>
                <Td><span className="font-medium">{c.label}</span> {c.isSandbox && <Pill tone="accent">sandbox</Pill>}</Td>
                <Td>{name(c.clientId)}</Td>
                <Td className="text-muted font-mono text-[11px]">{(c.config as { baseUrl?: string }).baseUrl}</Td>
                <Td className="text-muted">{c.hasSecret ? '•••• stored' : 'none'}</Td>
                <Td><Pill tone={c.status === 'CONNECTED' ? 'positive' : c.status === 'ERROR' ? 'negative' : 'neutral'}>{c.status.toLowerCase()}</Pill>{c.lastCheckedAt && <span className="text-[11px] text-muted"> · checked <Ago date={c.lastCheckedAt} /></span>}</Td>
                <Td className="text-right whitespace-nowrap">
                  {caps.canSecrets && c.status !== 'DISCONNECTED' && (
                    <>
                      <button type="button" className="btn-ghost h-7 text-[11px]" disabled={check.isPending} onClick={() => check.mutate({ id: c.id })}>Check</button>
                      <button type="button" className="btn-ghost h-7 text-[11px] text-blocked" disabled={off.isPending}
                              onClick={() => { if (confirm(`Disconnect ${c.label}? Its stored secret is deleted.`)) off.mutate({ id: c.id }); }}>Disconnect</button>
                    </>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {adding && <AddConnection clientId={clientId ?? null} onClose={() => setAdding(false)} />}
    </Section>
  );
}

function AddConnection({ clientId: initial, onClose }: { clientId: string | null; onClose: () => void }) {
  const { clients } = useActiveClient();
  const utils = trpc.useUtils();
  const [form, setForm] = useState({ clientId: initial ?? clients[0]?.id ?? '', label: '', baseUrl: 'https://', authHeader: 'authorization', secret: '', isSandbox: true });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const create = trpc.studio.createConnection.useMutation({ onSuccess: () => { utils.studio.connections.invalidate(); onClose(); } });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Add a connection" description="A REST API the customer has authorised you to call. Only https addresses on the public internet are accepted.">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate({ ...form, provider: 'rest_api', secret: form.secret || undefined }); }}>
        <Field label="Customer">{(id) => (
          <select id={id} className="input" value={form.clientId} onChange={(e) => set('clientId', e.target.value)} required>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}</Field>
        <Field label="Label">{(id) => <input id={id} className="input" value={form.label} onChange={(e) => set('label', e.target.value)} required maxLength={80} placeholder="e.g. ERP (test instance)" />}</Field>
        <Field label="Base URL">{(id) => <input id={id} className="input font-mono" value={form.baseUrl} onChange={(e) => set('baseUrl', e.target.value)} required />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Auth header">{(id) => <input id={id} className="input font-mono" value={form.authHeader} onChange={(e) => set('authHeader', e.target.value)} />}</Field>
          <Field label="Secret value" hint="e.g. Bearer …; stored encrypted.">{(id) => <input id={id} type="password" autoComplete="off" className="input" value={form.secret} onChange={(e) => set('secret', e.target.value)} />}</Field>
        </div>
        <label className="flex items-center gap-2 text-micro">
          <input type="checkbox" checked={form.isSandbox} onChange={(e) => set('isSandbox', e.target.checked)} />
          Sandbox (test runs may call it; leave on for a customer&apos;s test instance)
        </label>
        <ErrorNote error={create.error} />
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={create.isPending}>Save connection</button></div>
      </form>
    </Dialog>
  );
}

function Modules() {
  const modules = trpc.studio.modules.useQuery();
  return (
    <Section title="Modules" hint="The tested building blocks every application is assembled from. Configuration can enable and configure them; it can never add code.">
      <ErrorNote error={modules.error} />
      {modules.isPending ? <Loading /> : (
        <div className="grid md:grid-cols-2 gap-3">
          {modules.data?.map((m) => (
            <article key={m.key} className="card p-4">
              <div className="flex items-center gap-2 mb-1"><h3 className="font-semibold flex-1">{m.name}</h3><Pill>{m.category}</Pill><span className="text-[11px] text-muted num">v{m.version}</span></div>
              <p className="text-micro text-muted mb-2">{m.description}</p>
              <ul className="text-[11px] space-y-0.5">
                {m.steps.map((s) => <li key={s.type}><span className="font-mono">{s.type}</span> <span className="text-muted">— {s.description}</span>{s.usesIntegration && <Pill tone="accent" className="ml-1">connection</Pill>}</li>)}
              </ul>
            </article>
          ))}
        </div>
      )}
    </Section>
  );
}
