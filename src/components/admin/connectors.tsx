'use client';

import { CheckCircle2, CircleDashed, ExternalLink, PlugZap, XCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/types';
import { humanize } from '@/lib/domain';
import { Topbar } from '@/components/shell/topbar';
import { PageBody } from '@/components/ui/page';
import { Pill } from '@/components/ui/pill';
import { ErrorNote, Loading } from '@/components/ui/states';
import { Ago } from '@/components/ui/time';

type Connector = RouterOutputs['ops']['connectors'][number];

/**
 * Every data and communication provider Relay can use, with its honest
 * state. Credentials live in the environment, never in the database or the
 * browser; this page names the variables that are missing but never shows a
 * value. Admin-only.
 */
export function ConnectorsPage({ canManage }: { canManage: boolean }) {
  const connectors = trpc.ops.connectors.useQuery();
  const groups = groupByCapability(connectors.data ?? []);
  return (
    <>
      <Topbar title="Connectors" showClientSwitcher={false} />
      <PageBody>
        <p className="text-sm text-muted mb-6 max-w-2xl">
          Relay orchestrates providers rather than replacing them. When several can do the same job they are tried in priority
          order, and paid lookups are cached so the same question is never paid for twice. A provider that isn&apos;t connected
          simply isn&apos;t used — nothing is filled in with made-up data.
        </p>
        <ErrorNote error={connectors.error} />
        {connectors.isPending ? <Loading /> : (
          <div className="space-y-8">
            {groups.map(([capability, items]) => (
              <section key={capability}>
                <h2 className="eyebrow mb-2">{CAPABILITY_LABELS[capability] ?? humanize(capability)}</h2>
                <ul className="card divide-y divide-hairline">
                  {items.map((c) => <ConnectorRow key={c.id} c={c} canManage={canManage} />)}
                </ul>
              </section>
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}

const CAPABILITY_LABELS: Record<string, string> = {
  COMPANY_DATA: 'Company data', CONTACT_DATA: 'Contact data', EMAIL_FINDER: 'Email finding', EMAIL_VERIFICATION: 'Email verification',
  PHONE_DATA: 'Phone data', RESEARCH_SOURCE: 'Research sources', EMAIL_SENDING: 'Email sending', PHONE: 'Calling', CALENDAR: 'Calendar',
  CRM: 'CRM', AI: 'AI models',
};

function groupByCapability(items: Connector[]): Array<[string, Connector[]]> {
  const map = new Map<string, Connector[]>();
  for (const c of items) {
    const key = c.capabilities[0] ?? 'OTHER';
    map.set(key, [...(map.get(key) ?? []), c]);
  }
  return [...map.entries()];
}

function ConnectorRow({ c, canManage }: { c: Connector; canManage: boolean }) {
  const utils = trpc.useUtils();
  const set = trpc.ops.setConnector.useMutation({ onSuccess: () => utils.ops.connectors.invalidate() });
  const test = trpc.ops.testConnector.useMutation({ onSuccess: () => utils.ops.connectors.invalidate() });
  const state = !c.implemented ? 'planned' : !c.configured ? 'missing' : !c.enabled ? 'disabled' : 'ready';
  const Icon = state === 'ready' ? CheckCircle2 : state === 'planned' ? CircleDashed : XCircle;

  return (
    <li className="p-4 flex flex-col sm:flex-row sm:items-start gap-3">
      <Icon className={`size-4 shrink-0 mt-0.5 ${state === 'ready' ? 'text-cleared' : state === 'planned' ? 'text-muted' : 'text-held'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] font-medium">{c.name}</p>
          {state === 'ready' && <Pill tone="positive">connected</Pill>}
          {state === 'missing' && <Pill tone="warning">not configured</Pill>}
          {state === 'disabled' && <Pill>turned off</Pill>}
          {state === 'planned' && <Pill>not built yet</Pill>}
          {c.capabilities.slice(1).map((cap) => <Pill key={cap}>{CAPABILITY_LABELS[cap] ?? cap}</Pill>)}
        </div>
        <p className="text-micro text-muted mt-0.5">{c.description}</p>
        {state === 'missing' && canManage && (
          <p className="text-[11px] text-muted mt-1">Set {c.missingEnv.map((e) => <code key={e} className="num text-ink mx-0.5">{e}</code>)} in the server environment and restart.</p>
        )}
        {state === 'planned' && <p className="text-[11px] text-muted mt-1">The interface is in place; this integration hasn&apos;t been implemented.</p>}
        {c.lastError && <p className="text-[11px] text-blocked mt-1">Last check failed: {c.lastError}</p>}
        {c.lastCheckedAt && !c.lastError && <p className="text-[11px] text-muted mt-1">Checked <Ago date={c.lastCheckedAt} /></p>}
        {test.data && <p className={`text-[11px] mt-1 ${test.data.ok ? 'text-cleared' : 'text-blocked'}`}>{test.data.ok ? 'Connection works.' : test.data.detail}</p>}
        <ErrorNote error={set.error ?? test.error} className="mt-1" />
      </div>
      {canManage && c.implemented && (
        <div className="flex items-center gap-2 shrink-0">
          {c.docsUrl && <a href={c.docsUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost h-8 text-micro">Docs <ExternalLink className="size-3" /></a>}
          {c.hasHealthCheck && c.configured && (
            <button type="button" className="btn-outline h-8 text-micro" disabled={test.isPending} onClick={() => test.mutate({ provider: c.id })}>
              <PlugZap className="size-3.5" /> {test.isPending ? 'Testing…' : 'Test'}
            </button>
          )}
          <label className="flex items-center gap-1.5 text-micro" title="Priority within its capability; lower runs first">
            Priority
            <input type="number" min={1} max={999} defaultValue={c.priority} className="input h-8 w-16 text-micro"
                   onBlur={(e) => { const v = Number(e.target.value); if (v && v !== c.priority) set.mutate({ provider: c.id, priority: v }); }} />
          </label>
          <label className="flex items-center gap-1.5 text-micro">
            <input type="checkbox" checked={c.enabled} disabled={set.isPending} onChange={(e) => set.mutate({ provider: c.id, enabled: e.target.checked })} />
            On
          </label>
        </div>
      )}
    </li>
  );
}
