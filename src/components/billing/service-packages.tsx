'use client';

import { useState } from 'react';
import { Calculator, Pencil, Plus, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/types';
import { Topbar } from '@/components/shell/topbar';
import { PageBody } from '@/components/ui/page';
import { Pill } from '@/components/ui/pill';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { EmptyState, ErrorNote, Loading } from '@/components/ui/states';
import { costBreakdown, type PackageCosts } from '@/lib/cost-model';

type Data = RouterOutputs['servicePackages']['list'];
type Pkg = Data['packages'][number];

const SERVICE_LABEL: Record<string, string> = { AUTOMATION: 'Business automation', ACQUISITION: 'Customer acquisition', WEBSITES: 'Websites & digital foundations' };

/**
 * What each package costs to build and run, and the price that implies at
 * its target margin. Internal only: nothing here reaches the website.
 */
export function ServicePackages() {
  const list = trpc.servicePackages.list.useQuery();
  const utils = trpc.useUtils();
  const addStarting = trpc.servicePackages.addStarting.useMutation({ onSuccess: () => utils.servicePackages.list.invalidate() });
  const [editing, setEditing] = useState<Pkg | 'new' | null>(null);
  const data = list.data;
  const fmt = (c: number) => money(c, data?.currency ?? 'CAD');
  return (
    <>
      <Topbar title="Service packages" />
      <PageBody width="wide" className="space-y-4">
        <p className="text-micro text-muted max-w-3xl">
          The internal cost model behind each package: implementation hours, hosting, database, AI, third-party services, domain and email,
          monitoring, support and maintenance time, and the margin you want. Labour is costed at your rate card&apos;s internal hourly cost
          {data ? <> ({fmt(data.hourlyCostCents)} an hour, set in Settings)</> : null}. None of this is shown to customers.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary h-8 text-micro" onClick={() => setEditing('new')}><Plus className="size-4" />New package</button>
          <button type="button" className="btn-outline h-8 text-micro" disabled={addStarting.isPending} onClick={() => addStarting.mutate()}>
            {addStarting.isPending ? 'Adding…' : 'Add starting packages'}
          </button>
          {addStarting.data && <span className="text-micro text-muted self-center">{addStarting.data.added ? `Added ${addStarting.data.added}.` : 'All starting packages are already here.'}</span>}
        </div>
        <ErrorNote error={list.error ?? addStarting.error} />
        {list.isPending ? <Loading /> : !data?.packages.length ? (
          <EmptyState icon={Calculator} title="No packages yet">
            Add the starting packages (one per offering on the website, with assumptions to replace), or create your own.
          </EmptyState>
        ) : (
          <div className="grid xl:grid-cols-2 gap-3">
            {data.packages.map((p) => <PackageCard key={p.id} pkg={p} fmt={fmt} onEdit={() => setEditing(p)} />)}
          </div>
        )}
      </PageBody>
      {editing && data && <PackageDialog pkg={editing === 'new' ? null : editing} hourlyCostCents={data.hourlyCostCents} fmt={fmt} onClose={() => setEditing(null)} />}
    </>
  );
}

function PackageCard({ pkg, fmt, onEdit }: { pkg: Pkg; fmt: (c: number) => string; onEdit: () => void }) {
  const c = pkg.cost;
  return (
    <article className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{SERVICE_LABEL[pkg.service] ?? pkg.service}</p>
          <h3 className="text-[14px] font-semibold mt-1">{pkg.name}</h3>
          {pkg.description && <p className="text-micro text-muted mt-0.5">{pkg.description}</p>}
        </div>
        <button type="button" className="btn-ghost h-8 text-micro" onClick={onEdit}><Pencil className="size-3.5" />Edit</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-card border border-hairline p-3">
          <p className="eyebrow">One-time</p>
          <p className="text-micro mt-1.5">Cost <span className="num">{fmt(c.setup.totalCents)}</span> <span className="text-muted">({pkg.buildHours} h)</span></p>
          <p className="text-micro">Floor at {pkg.targetMarginPct}% <span className="num font-medium">{fmt(c.floor.setupCents)}</span></p>
          {pkg.priceSetupCents != null && <p className="text-micro">Quoted <span className="num">{fmt(pkg.priceSetupCents)}</span> <MarginPill pct={c.quoted.setupMarginPct} target={pkg.targetMarginPct} /></p>}
        </div>
        <div className="rounded-card border border-hairline p-3">
          <p className="eyebrow">Monthly</p>
          <p className="text-micro mt-1.5">Cost <span className="num">{fmt(c.monthly.totalCents)}</span></p>
          <p className="text-micro">Floor at {pkg.targetMarginPct}% <span className="num font-medium">{fmt(c.floor.monthlyCents)}</span></p>
          {pkg.priceMonthlyCents != null && <p className="text-micro">Quoted <span className="num">{fmt(pkg.priceMonthlyCents)}</span> <MarginPill pct={c.quoted.monthlyMarginPct} target={pkg.targetMarginPct} /></p>}
        </div>
      </div>
      <details className="text-micro">
        <summary className="cursor-pointer text-muted">Monthly cost lines</summary>
        <table className="w-full mt-2">
          <tbody>{c.monthly.lines.map((l) => <tr key={l.label} className="border-t border-hairline"><td className="py-1">{l.label}</td><td className="py-1 text-right num">{fmt(l.cents)}</td></tr>)}</tbody>
        </table>
      </details>
      <p className="text-[11px] text-muted">First year: cost <span className="num">{fmt(c.firstYear.costCents)}</span> · floor <span className="num">{fmt(c.firstYear.floorCents)}</span>{c.firstYear.quotedCents != null && <> · quoted <span className="num">{fmt(c.firstYear.quotedCents)}</span></>}</p>
      {pkg.includedUsage && <p className="text-[11px]"><span className="text-muted">Included usage:</span> {pkg.includedUsage}</p>}
      {pkg.notes && <p className="text-[11px] text-held">{pkg.notes}</p>}
    </article>
  );
}

function MarginPill({ pct, target }: { pct: number | null; target: number }) {
  if (pct == null) return null;
  return <Pill tone={pct < target ? 'negative' : 'positive'}>{pct}% margin</Pill>;
}

type Form = Record<'name' | 'description' | 'includedUsage' | 'notes', string> & Record<
  'buildHours' | 'setupCost' | 'hosting' | 'database' | 'ai' | 'thirdParty' | 'domain' | 'monitoring' | 'supportHours' | 'maintenanceHours' | 'targetMarginPct' | 'priceSetup' | 'priceMonthly', string
> & { service: 'AUTOMATION' | 'ACQUISITION' | 'WEBSITES' };

const dollars = (c: number | null | undefined) => (c == null ? '' : String(c / 100));
const toCents = (s: string) => Math.round((Number(s) || 0) * 100);

function PackageDialog({ pkg, hourlyCostCents, fmt, onClose }: { pkg: Pkg | null; hourlyCostCents: number; fmt: (c: number) => string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const done = () => { utils.servicePackages.list.invalidate(); onClose(); };
  const save = trpc.servicePackages.save.useMutation({ onSuccess: done });
  const remove = trpc.servicePackages.delete.useMutation({ onSuccess: done });
  const [f, setF] = useState<Form>({
    service: (pkg?.service as Form['service']) ?? 'AUTOMATION', name: pkg?.name ?? '', description: pkg?.description ?? '', includedUsage: pkg?.includedUsage ?? '', notes: pkg?.notes ?? '',
    buildHours: String(pkg?.buildHours ?? 0), setupCost: dollars(pkg?.setupCostCents ?? 0), hosting: dollars(pkg?.hostingCents ?? 0), database: dollars(pkg?.databaseCents ?? 0),
    ai: dollars(pkg?.aiCents ?? 0), thirdParty: dollars(pkg?.thirdPartyCents ?? 0), domain: dollars(pkg?.domainCents ?? 0), monitoring: dollars(pkg?.monitoringCents ?? 0),
    supportHours: String(pkg?.supportHours ?? 0), maintenanceHours: String(pkg?.maintenanceHours ?? 0), targetMarginPct: String(pkg?.targetMarginPct ?? 40),
    priceSetup: dollars(pkg?.priceSetupCents), priceMonthly: dollars(pkg?.priceMonthlyCents),
  });
  const costs: PackageCosts = {
    buildHours: Number(f.buildHours) || 0, setupCostCents: toCents(f.setupCost), hostingCents: toCents(f.hosting), databaseCents: toCents(f.database), aiCents: toCents(f.ai),
    thirdPartyCents: toCents(f.thirdParty), domainCents: toCents(f.domain), monitoringCents: toCents(f.monitoring), supportHours: Number(f.supportHours) || 0,
    maintenanceHours: Number(f.maintenanceHours) || 0, targetMarginPct: Math.min(95, Math.max(0, Math.round(Number(f.targetMarginPct) || 0))),
    priceSetupCents: f.priceSetup ? toCents(f.priceSetup) : null, priceMonthlyCents: f.priceMonthly ? toCents(f.priceMonthly) : null,
  };
  const preview = costBreakdown(costs, hourlyCostCents);
  const num = (k: keyof Form, label: string, hint?: string) => (
    <Field label={label} hint={hint}>{(id) => <input id={id} inputMode="decimal" className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value.replace(/[^\d.]/g, '') })} />}</Field>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={pkg ? `Edit ${pkg.name}` : 'New package'} width="lg" description="Amounts in dollars. Monthly costs are per client.">
      <form className="space-y-4" onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ id: pkg?.id ?? null, data: { ...costs, service: f.service, name: f.name, description: f.description || null, includedUsage: f.includedUsage || null, notes: f.notes || null } });
      }}>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Name">{(id) => <input id={id} className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} />}</Field>
          <Field label="Service">{(id) => (
            <select id={id} className="input" value={f.service} onChange={(e) => setF({ ...f, service: e.target.value as Form['service'] })}>
              {Object.entries(SERVICE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )}</Field>
        </div>
        <Field label="What it includes">{(id) => <textarea id={id} className="input h-auto py-2" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
        <p className="eyebrow pt-2">One-time</p>
        <div className="grid sm:grid-cols-3 gap-3">{num('buildHours', 'Implementation hours')}{num('setupCost', 'Third-party setup costs')}{num('priceSetup', 'Quoted setup price', 'Optional')}</div>
        <p className="eyebrow pt-2">Monthly</p>
        <div className="grid sm:grid-cols-3 gap-3">
          {num('hosting', 'Hosting')}{num('database', 'Database')}{num('ai', 'AI services')}{num('thirdParty', 'Third-party services')}
          {num('domain', 'Domain, email, upkeep')}{num('monitoring', 'Monitoring')}{num('supportHours', 'Support hours')}{num('maintenanceHours', 'Maintenance hours')}{num('priceMonthly', 'Quoted monthly price', 'Optional')}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {num('targetMarginPct', 'Target margin (%)')}
          <Field label="Included usage" hint="What the contract includes, in words">{(id) => <input id={id} className="input" value={f.includedUsage} onChange={(e) => setF({ ...f, includedUsage: e.target.value })} />}</Field>
        </div>
        <Field label="Notes">{(id) => <textarea id={id} className="input h-auto py-2" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />}</Field>
        <div className="rounded-card bg-raised p-3 text-micro grid sm:grid-cols-2 gap-2">
          <p>One-time cost <span className="num">{fmt(preview.setup.totalCents)}</span> → floor <span className="num font-medium">{fmt(preview.floor.setupCents)}</span></p>
          <p>Monthly cost <span className="num">{fmt(preview.monthly.totalCents)}</span> → floor <span className="num font-medium">{fmt(preview.floor.monthlyCents)}</span></p>
          {preview.quoted.belowTarget && <p className="sm:col-span-2 text-blocked">A quoted price is below the target margin.</p>}
        </div>
        <ErrorNote error={save.error ?? remove.error} />
        <div className="flex justify-between gap-2">
          {pkg ? <button type="button" className="btn-ghost h-8 text-micro text-blocked" disabled={remove.isPending} onClick={() => remove.mutate({ id: pkg.id })}><Trash2 className="size-3.5" />Delete</button> : <span />}
          <button type="submit" className="btn-primary h-8 text-micro" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save package'}</button>
        </div>
      </form>
    </Dialog>
  );
}

function money(cents: number, currency: string) {
  if (!Number.isFinite(cents)) return '—';
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);
}
