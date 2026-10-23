'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, CheckCircle2, Circle, ExternalLink, Pencil, Plus } from 'lucide-react';
import type { Seniority, SignalType } from '@prisma/client';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/types';
import { ROLE_LABELS } from '@/lib/rbac';
import { SENIORITIES, SENIORITY_LABELS, SIGNAL_LABELS, SIGNAL_TYPES, humanize } from '@/lib/domain';
import { formatMoney, cn } from '@/lib/utils';
import { Topbar } from '@/components/shell/topbar';
import { PageBody } from '@/components/ui/page';
import { Pill } from '@/components/ui/pill';
import { Dialog } from '@/components/ui/dialog';
import { ChipSelect, Field, ListInput } from '@/components/ui/field';
import { EmptyState, ErrorNote, Loading } from '@/components/ui/states';
import { ClientProfileForm, profilePayload, profileValuesFrom } from './client-profile-form';

type Client = RouterOutputs['clients']['byId'];
type Tab = 'profile' | 'offers' | 'icps' | 'proof' | 'playbooks' | 'people';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'profile', label: 'Profile' }, { id: 'offers', label: 'Offers' }, { id: 'icps', label: 'Ideal customers' },
  { id: 'proof', label: 'Proof points' }, { id: 'playbooks', label: 'Playbooks' }, { id: 'people', label: 'Client team' },
];

export function ClientDetail({ id, canEdit, canManage, canPortal }: { id: string; canEdit: boolean; canManage: boolean; canPortal: boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) ?? 'profile');
  const client = trpc.clients.byId.useQuery({ id });
  const utils = trpc.useUtils();
  const update = trpc.clients.update.useMutation({ onSuccess: () => { utils.clients.invalidate(); router.refresh(); } });
  const archive = trpc.clients.archive.useMutation({ onSuccess: () => { router.push('/clients'); router.refresh(); } });

  if (client.isPending) return <><Topbar title="Client" showClientSwitcher={false} /><Loading /></>;
  if (client.error) return <><Topbar title="Client" showClientSwitcher={false} /><PageBody><ErrorNote error={client.error} /></PageBody></>;
  const c = client.data;

  const checklist = [
    { done: !!c.description && c.productsServices.length > 0, label: 'Business profile', tab: 'profile' as Tab },
    { done: c.offers.some((o) => o.isActive), label: 'An offer', tab: 'offers' as Tab },
    { done: c.icps.some((i) => i.isActive), label: 'An ideal customer profile', tab: 'icps' as Tab },
    { done: c.proofPoints.some((p) => p.approvedForOutreach), label: 'An approved proof point', tab: 'proof' as Tab },
    { done: c.playbooks.length > 0, label: 'A playbook', tab: 'playbooks' as Tab },
    { done: !!c.senderName, label: 'A sender name', tab: 'profile' as Tab },
  ];

  return (
    <>
      <Topbar title={c.name} showClientSwitcher={false} />
      <PageBody width="wide">
        <Link href="/clients" className="inline-flex items-center gap-1 text-micro text-muted hover:text-ink mb-3"><ArrowLeft className="size-3.5" /> Clients</Link>
        <header className="flex flex-col md:flex-row md:items-start gap-4 mb-5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xl font-semibold">{c.name}</h2>
              {c.kind === 'INTERNAL' && <Pill>internal</Pill>}
              <Pill tone={c.status === 'ACTIVE' ? 'positive' : c.status === 'ONBOARDING' ? 'warning' : 'neutral'}>{c.status.toLowerCase()}</Pill>
            </div>
            {c.kind === 'INTERNAL' && (
              <p className="text-micro text-muted mb-1">Our own company, set up as the first client of our lead generation: Relay finds and contacts prospects for it like any client, but it is never billed and has no client portal.</p>
            )}
            <p className="text-micro text-muted">
              {c.websiteUrl && <a href={c.websiteUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent inline-flex items-center gap-0.5">{c.websiteUrl.replace(/^https?:\/\//, '')}<ExternalLink className="size-3" /></a>}
              {c.serviceAreas.length > 0 && <> · {c.serviceAreas.join(', ')}</>}
              {c.averageDealValueCents && <> · average deal {formatMoney(c.averageDealValueCents, c.currency)}</>}
            </p>
          </div>
          <div className="flex gap-2">
            {canPortal && <Link href={`/portal?clientId=${c.id}`} className="btn-outline h-8 text-micro">View their portal</Link>}
            {canManage && (
              <button type="button" className="btn-ghost h-8 text-micro text-blocked" disabled={archive.isPending}
                      onClick={() => { if (confirm(`Archive ${c.name}? Their users lose access; data is kept.`)) archive.mutate({ id: c.id }); }}>Archive</button>
            )}
          </div>
        </header>

        {checklist.some((i) => !i.done) && (
          <div className="card p-4 mb-5">
            <p className="eyebrow mb-2">Ready to run outreach?</p>
            <ul className="grid sm:grid-cols-3 gap-x-4 gap-y-1">
              {checklist.map((item) => (
                <li key={item.label}>
                  <button type="button" onClick={() => setTab(item.tab)} className={cn('flex items-center gap-1.5 text-micro', item.done ? 'text-muted' : 'text-ink hover:text-accent')}>
                    {item.done ? <CheckCircle2 className="size-3.5 text-cleared" /> : <Circle className="size-3.5 text-held" />}
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div role="tablist" aria-label="Client setup" className="flex gap-1 border-b border-hairline mb-5 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                    className={cn('h-9 px-3 text-[13px] -mb-px border-b-2 whitespace-nowrap', tab === t.id ? 'border-accent font-medium' : 'border-transparent text-muted hover:text-ink')}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'profile' && (
          <div className="card p-5 max-w-3xl">
            {canEdit ? (
              <ClientProfileForm key={c.updatedAt.toString()} initial={profileValuesFrom(c, true)} internal submitLabel="Save profile"
                                 pending={update.isPending} error={update.error}
                                 onSubmit={(v) => update.mutate({ id: c.id, data: profilePayload(v) })} />
            ) : <p className="text-sm text-muted">{c.description ?? 'No profile yet.'}</p>}
            {update.isSuccess && <p className="text-[12px] text-cleared mt-2">Saved.</p>}
          </div>
        )}
        {tab === 'offers' && <Offers client={c} canEdit={canEdit} />}
        {tab === 'icps' && <Icps client={c} canEdit={canEdit} />}
        {tab === 'proof' && <ProofPoints client={c} canEdit={canEdit} />}
        {tab === 'playbooks' && <ClientPlaybooks client={c} />}
        {tab === 'people' && <People client={c} />}
      </PageBody>
    </>
  );
}

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------

type Offer = Client['offers'][number];

function Offers({ client, canEdit }: { client: Client; canEdit: boolean }) {
  const [editing, setEditing] = useState<Offer | 'new' | null>(null);
  return (
    <div className="space-y-3 max-w-3xl">
      <p className="text-micro text-muted">What the client sells to prospects — research asks &ldquo;why would this company care about this offer?&rdquo;, and every email ends with its call to action.</p>
      {client.offers.length === 0 ? <EmptyState title="No offers yet">Add the service the client most wants to sell.</EmptyState> : (
        <ul className="space-y-2">
          {client.offers.map((o) => (
            <li key={o.id} className={cn('card p-4', !o.isActive && 'opacity-60')}>
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <p className="text-[13px] font-semibold">{o.name} {!o.isActive && <Pill>inactive</Pill>}</p>
                  <p className="text-micro text-muted">{o.summary}</p>
                </div>
                {canEdit && <button type="button" className="btn-ghost size-7 p-0" aria-label={`Edit ${o.name}`} onClick={() => setEditing(o)}><Pencil className="size-3.5" /></button>}
              </div>
              {o.valueProposition && <p className="text-micro mt-2">{o.valueProposition}</p>}
              <p className="text-[11px] text-muted mt-2">Call to action: {o.callToAction}{o.typicalDealValueCents ? ` · typical deal ${formatMoney(o.typicalDealValueCents, client.currency)}` : ''}</p>
            </li>
          ))}
        </ul>
      )}
      {canEdit && <button type="button" className="btn-outline h-8 text-micro" onClick={() => setEditing('new')}><Plus className="size-3.5" /> Add offer</button>}
      {editing && <OfferDialog clientId={client.id} offer={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function OfferDialog({ clientId, offer, onClose }: { clientId: string; offer: Offer | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const done = () => { utils.clients.byId.invalidate({ id: clientId }); onClose(); };
  const create = trpc.clients.createOffer.useMutation({ onSuccess: done });
  const update = trpc.clients.updateOffer.useMutation({ onSuccess: done });
  const [v, setV] = useState({
    name: offer?.name ?? '', summary: offer?.summary ?? '', description: offer?.description ?? '',
    valueProposition: offer?.valueProposition ?? '', callToAction: offer?.callToAction ?? 'A 15-minute call',
    dealValue: offer?.typicalDealValueCents ? String(offer.typicalDealValueCents / 100) : '', isActive: offer?.isActive ?? true,
  });
  const t = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name: v.name, summary: v.summary, description: v.description || null, valueProposition: v.valueProposition || null,
      callToAction: v.callToAction, typicalDealValueCents: v.dealValue ? Math.round(Number(v.dealValue) * 100) : null, isActive: v.isActive,
    };
    if (offer) update.mutate({ id: offer.id, data }); else create.mutate({ clientId, data });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={offer ? 'Edit offer' : 'Add offer'} width="lg">
      <form className="space-y-3" onSubmit={submit}>
        <Field label="Name">{(id) => <input id={id} required className="input" value={v.name} onChange={t('name')} placeholder="Cross-border dedicated lanes" />}</Field>
        <Field label="One-line summary" hint="How you'd describe it in one sentence to a prospect.">{(id) => <input id={id} required minLength={3} className="input" value={v.summary} onChange={t('summary')} />}</Field>
        <Field label="Value to the buyer" hint="The outcome for the prospect, in their terms.">{(id) => <textarea id={id} rows={2} className="input h-auto py-2" value={v.valueProposition} onChange={t('valueProposition')} />}</Field>
        <Field label="Details">{(id) => <textarea id={id} rows={3} className="input h-auto py-2" value={v.description} onChange={t('description')} />}</Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Call to action">{(id) => <input id={id} required className="input" value={v.callToAction} onChange={t('callToAction')} />}</Field>
          <Field label="Typical deal value">{(id) => <input id={id} type="number" min={0} className="input" value={v.dealValue} onChange={t('dealValue')} />}</Field>
        </div>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={v.isActive} onChange={(e) => setV((s) => ({ ...s, isActive: e.target.checked }))} /> Active</label>
        <ErrorNote error={create.error ?? update.error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={create.isPending || update.isPending}>Save</button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Ideal customer profiles
// ---------------------------------------------------------------------------

type Icp = Client['icps'][number];

function Icps({ client, canEdit }: { client: Client; canEdit: boolean }) {
  const [editing, setEditing] = useState<Icp | 'new' | null>(null);
  return (
    <div className="space-y-3 max-w-3xl">
      <p className="text-micro text-muted">Who the client sells to. Every account is scored against each active profile, and contacts are ranked by how well their role matches. Changes rescore accounts within a few minutes.</p>
      {client.icps.length === 0 ? <EmptyState title="No ideal customer profile yet">Describe the companies and people this client wins with.</EmptyState> : (
        <ul className="space-y-2">
          {client.icps.map((i) => (
            <li key={i.id} className={cn('card p-4', !i.isActive && 'opacity-60')}>
              <div className="flex items-start gap-2 mb-2">
                <p className="text-[13px] font-semibold flex-1">{i.name} {!i.isActive && <Pill>inactive</Pill>}</p>
                {canEdit && <button type="button" className="btn-ghost size-7 p-0" aria-label={`Edit ${i.name}`} onClick={() => setEditing(i)}><Pencil className="size-3.5" /></button>}
              </div>
              <dl className="grid sm:grid-cols-[140px_1fr] gap-x-3 gap-y-1 text-micro">
                <IcpLine label="Industries" value={[...i.industries, ...i.industryKeywords].join(', ')} />
                <IcpLine label="Excluded" value={i.excludedIndustries.join(', ')} />
                <IcpLine label="Company size" value={i.employeeMin || i.employeeMax ? `${i.employeeMin ?? 0}–${i.employeeMax ?? 'any'} employees` : ''} />
                <IcpLine label="Locations" value={i.locations.join(', ')} />
                <IcpLine label="Target titles" value={i.targetTitles.join(', ')} />
                <IcpLine label="Seniority" value={i.targetSeniorities.map((s) => SENIORITY_LABELS[s]).join(', ')} />
                <IcpLine label="Small companies" value={i.smallCompanyMaxEmployees ? `Under ${i.smallCompanyMaxEmployees} staff, target ${i.smallCompanyTitles.join(', ') || 'the owner'}` : ''} />
                <IcpLine label="Useful signals" value={i.preferredSignals.map((s) => SIGNAL_LABELS[s]).join(', ')} />
                <IcpLine label="Must be true" value={i.requiredAttributes.join('; ')} />
              </dl>
            </li>
          ))}
        </ul>
      )}
      {canEdit && <button type="button" className="btn-outline h-8 text-micro" onClick={() => setEditing('new')}><Plus className="size-3.5" /> Add profile</button>}
      {editing && <IcpDialog clientId={client.id} icp={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function IcpLine({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return <><dt className="text-muted">{label}</dt><dd>{value}</dd></>;
}

function IcpDialog({ clientId, icp, onClose }: { clientId: string; icp: Icp | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const done = () => { utils.clients.byId.invalidate({ id: clientId }); onClose(); };
  const create = trpc.clients.createIcp.useMutation({ onSuccess: done });
  const update = trpc.clients.updateIcp.useMutation({ onSuccess: done });
  const [v, setV] = useState({
    name: icp?.name ?? '', description: icp?.description ?? '',
    industries: icp?.industries ?? [], industryKeywords: icp?.industryKeywords ?? [], excludedIndustries: icp?.excludedIndustries ?? [],
    employeeMin: icp?.employeeMin?.toString() ?? '', employeeMax: icp?.employeeMax?.toString() ?? '',
    locations: icp?.locations ?? [], requiredAttributes: icp?.requiredAttributes ?? [],
    targetTitles: icp?.targetTitles ?? [], targetDepartments: icp?.targetDepartments ?? [],
    targetSeniorities: (icp?.targetSeniorities ?? []) as Seniority[],
    smallCompanyMaxEmployees: icp?.smallCompanyMaxEmployees?.toString() ?? '', smallCompanyTitles: icp?.smallCompanyTitles ?? [],
    preferredSignals: (icp?.preferredSignals ?? []) as SignalType[], signalKeywords: icp?.signalKeywords ?? [],
    isActive: icp?.isActive ?? true,
  });
  const list = (k: keyof typeof v) => (next: string[]) => setV((s) => ({ ...s, [k]: next }));
  const num = (s: string) => (s ? Number(s) : null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      ...v, description: v.description || null,
      employeeMin: num(v.employeeMin), employeeMax: num(v.employeeMax), smallCompanyMaxEmployees: num(v.smallCompanyMaxEmployees),
    };
    if (icp) update.mutate({ id: icp.id, data }); else create.mutate({ clientId, data });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={icp ? 'Edit ideal customer profile' : 'Add ideal customer profile'} width="lg">
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Name">{(id) => <input id={id} required className="input" value={v.name} onChange={(e) => setV((s) => ({ ...s, name: e.target.value }))} placeholder="Ontario manufacturers shipping to the US" />}</Field>
        <fieldset className="space-y-3">
          <legend className="eyebrow mb-1">Companies</legend>
          <Field label="Industries" hint="Matched against the account's industry.">{(id) => <ListInput id={id} value={v.industries} onChange={list('industries')} placeholder="Manufacturing, Food processing…" />}</Field>
          <Field label="Industry keywords" hint="Matched against industry and description, e.g. 'metal fabrication'.">{(id) => <ListInput id={id} value={v.industryKeywords} onChange={list('industryKeywords')} />}</Field>
          <Field label="Exclude industries">{(id) => <ListInput id={id} value={v.excludedIndustries} onChange={list('excludedIndustries')} />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Min employees">{(id) => <input id={id} type="number" min={0} className="input" value={v.employeeMin} onChange={(e) => setV((s) => ({ ...s, employeeMin: e.target.value }))} />}</Field>
            <Field label="Max employees">{(id) => <input id={id} type="number" min={0} className="input" value={v.employeeMax} onChange={(e) => setV((s) => ({ ...s, employeeMax: e.target.value }))} />}</Field>
          </div>
          <Field label="Locations" hint="Cities, provinces, states or countries.">{(id) => <ListInput id={id} value={v.locations} onChange={list('locations')} placeholder="Ontario, Michigan, Ohio…" />}</Field>
          <Field label="Must be true" hint="Checked during research, e.g. 'Ships products to the US'.">{(id) => <ListInput id={id} value={v.requiredAttributes} onChange={list('requiredAttributes')} />}</Field>
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="eyebrow mb-1">People</legend>
          <Field label="Target titles">{(id) => <ListInput id={id} value={v.targetTitles} onChange={list('targetTitles')} placeholder="Logistics Manager, Shipping Manager…" />}</Field>
          <Field label="Target departments">{(id) => <ListInput id={id} value={v.targetDepartments} onChange={list('targetDepartments')} placeholder="Operations, Supply chain…" />}</Field>
          <Field label="Seniority">{() => <ChipSelect options={SENIORITIES} value={v.targetSeniorities} onChange={(next) => setV((s) => ({ ...s, targetSeniorities: next }))} labels={SENIORITY_LABELS} />}</Field>
          <div className="grid sm:grid-cols-[160px_1fr] gap-3">
            <Field label="Small company under" hint="Employees">{(id) => <input id={id} type="number" min={1} className="input" value={v.smallCompanyMaxEmployees} onChange={(e) => setV((s) => ({ ...s, smallCompanyMaxEmployees: e.target.value }))} />}</Field>
            <Field label="…then target" hint="At small companies the owner often makes this call.">{(id) => <ListInput id={id} value={v.smallCompanyTitles} onChange={list('smallCompanyTitles')} placeholder="Owner, President" />}</Field>
          </div>
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="eyebrow mb-1">Timing</legend>
          <Field label="Signals that matter">{() => <ChipSelect options={SIGNAL_TYPES} value={v.preferredSignals} onChange={(next) => setV((s) => ({ ...s, preferredSignals: next }))} labels={SIGNAL_LABELS} />}</Field>
          <Field label="Signal keywords" hint="e.g. 'AZ driver', 'new facility'.">{(id) => <ListInput id={id} value={v.signalKeywords} onChange={list('signalKeywords')} />}</Field>
        </fieldset>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={v.isActive} onChange={(e) => setV((s) => ({ ...s, isActive: e.target.checked }))} /> Active</label>
        <ErrorNote error={create.error ?? update.error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={create.isPending || update.isPending}>Save</button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Proof points
// ---------------------------------------------------------------------------

type ProofPoint = Client['proofPoints'][number];
const PROOF_KINDS = ['CASE_STUDY', 'TESTIMONIAL', 'CUSTOMER', 'RESULT', 'CERTIFICATION', 'CAPABILITY', 'OTHER'] as const;

function ProofPoints({ client, canEdit }: { client: Client; canEdit: boolean }) {
  const [editing, setEditing] = useState<ProofPoint | 'new' | null>(null);
  const utils = trpc.useUtils();
  const approve = trpc.clients.approveProofPoint.useMutation({ onSuccess: () => utils.clients.byId.invalidate({ id: client.id }) });
  return (
    <div className="space-y-3 max-w-3xl">
      <p className="text-micro text-muted">
        Claims about the client that emails may use — customers, results, certifications. A draft can only cite a proof point once it is
        approved; unapproved ones are never sent.
      </p>
      {client.proofPoints.length === 0 ? <EmptyState title="No proof points yet">Add results or customers the client is happy to have mentioned.</EmptyState> : (
        <ul className="space-y-2">
          {client.proofPoints.map((p) => (
            <li key={p.id} className={cn('card p-4', !p.isActive && 'opacity-60')}>
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <p className="text-[13px] font-semibold flex items-center gap-2 flex-wrap">
                    {p.title} <Pill>{humanize(p.kind)}</Pill>
                    {p.approvedForOutreach ? <Pill tone="positive">approved for outreach</Pill> : <Pill tone="warning">not approved</Pill>}
                  </p>
                  <p className="text-micro mt-1">{p.statement}</p>
                  {(p.customerName || p.sourceUrl || p.evidenceNote) && (
                    <p className="text-[11px] text-muted mt-1">
                      {p.customerName}{p.sourceUrl && <> · <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent">source</a></>}{p.evidenceNote && ` · ${p.evidenceNote}`}
                    </p>
                  )}
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <button type="button" className="btn-outline h-7 text-[11px]" disabled={approve.isPending}
                            onClick={() => approve.mutate({ id: p.id, approved: !p.approvedForOutreach })}>
                      {p.approvedForOutreach ? 'Withdraw' : 'Approve'}
                    </button>
                    <button type="button" className="btn-ghost size-7 p-0" aria-label={`Edit ${p.title}`} onClick={() => setEditing(p)}><Pencil className="size-3.5" /></button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canEdit && <button type="button" className="btn-outline h-8 text-micro" onClick={() => setEditing('new')}><Plus className="size-3.5" /> Add proof point</button>}
      {editing && <ProofPointDialog clientId={client.id} point={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ProofPointDialog({ clientId, point, onClose }: { clientId: string; point: ProofPoint | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const done = () => { utils.clients.byId.invalidate({ id: clientId }); onClose(); };
  const create = trpc.clients.createProofPoint.useMutation({ onSuccess: done });
  const update = trpc.clients.updateProofPoint.useMutation({ onSuccess: done });
  const [v, setV] = useState({
    kind: point?.kind ?? 'CAPABILITY', title: point?.title ?? '', statement: point?.statement ?? '', customerName: point?.customerName ?? '',
    industry: point?.industry ?? '', sourceUrl: point?.sourceUrl ?? '', evidenceNote: point?.evidenceNote ?? '', isActive: point?.isActive ?? true,
  });
  const t = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      kind: v.kind as (typeof PROOF_KINDS)[number], title: v.title, statement: v.statement, customerName: v.customerName || null,
      industry: v.industry || null, sourceUrl: v.sourceUrl, evidenceNote: v.evidenceNote || null, isActive: v.isActive,
    };
    if (point) update.mutate({ id: point.id, data }); else create.mutate({ clientId, data });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={point ? 'Edit proof point' : 'Add proof point'} width="lg"
            description={point?.approvedForOutreach ? 'Editing the statement withdraws approval until it is approved again.' : undefined}>
      <form className="space-y-3" onSubmit={submit}>
        <div className="grid sm:grid-cols-[180px_1fr] gap-3">
          <Field label="Kind">
            {(id) => (
              <select id={id} className="input" value={v.kind} onChange={t('kind')}>
                {PROOF_KINDS.map((k) => <option key={k} value={k}>{humanize(k)}</option>)}
              </select>
            )}
          </Field>
          <Field label="Title">{(id) => <input id={id} required className="input" value={v.title} onChange={t('title')} />}</Field>
        </div>
        <Field label="Statement" hint="Exactly what an email may say. Keep it specific and true.">{(id) => <textarea id={id} required minLength={5} rows={3} className="input h-auto py-2" value={v.statement} onChange={t('statement')} placeholder="We run daily Toronto–Detroit lanes with our own trucks." />}</Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Customer (if any)">{(id) => <input id={id} className="input" value={v.customerName} onChange={t('customerName')} />}</Field>
          <Field label="Industry">{(id) => <input id={id} className="input" value={v.industry} onChange={t('industry')} />}</Field>
        </div>
        <Field label="Source link">{(id) => <input id={id} type="url" className="input" value={v.sourceUrl} onChange={t('sourceUrl')} />}</Field>
        <Field label="Evidence note" hint="Where this came from, e.g. 'Confirmed by Sam on the onboarding call'.">{(id) => <input id={id} className="input" value={v.evidenceNote} onChange={t('evidenceNote')} />}</Field>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={v.isActive} onChange={(e) => setV((s) => ({ ...s, isActive: e.target.checked }))} /> Active</label>
        <ErrorNote error={create.error ?? update.error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={create.isPending || update.isPending}>Save</button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Playbooks and people
// ---------------------------------------------------------------------------

function ClientPlaybooks({ client }: { client: Client }) {
  const router = useRouter();
  const templates = trpc.playbooks.list.useQuery({ clientId: null });
  const copy = trpc.playbooks.copyToClient.useMutation({ onSuccess: (p) => router.push(`/playbooks/${p.id}`) });
  const shared = (templates.data ?? []).filter((p) => !p.clientId);
  return (
    <div className="space-y-4 max-w-3xl">
      <p className="text-micro text-muted">A playbook holds the industry knowledge: who to target, what signals matter, messaging angles, the sequence, and call guidance. Start from a template and adapt it to this client.</p>
      {client.playbooks.length > 0 ? (
        <ul className="card divide-y divide-hairline">
          {client.playbooks.map((p) => (
            <li key={p.id} className="p-3 flex items-center gap-2">
              <Link href={`/playbooks/${p.id}`} className="text-[13px] font-medium flex-1 hover:text-accent">{p.name}</Link>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted">No playbook for this client yet.</p>}
      {shared.length > 0 && (
        <div>
          <p className="eyebrow mb-2">Start from a template</p>
          <ul className="grid sm:grid-cols-2 gap-2">
            {shared.map((t) => (
              <li key={t.id} className="card p-3">
                <p className="text-[13px] font-medium">{t.name}</p>
                <p className="text-[11px] text-muted line-clamp-2 mb-2">{t.description}</p>
                <button type="button" className="btn-outline h-7 text-[11px]" disabled={copy.isPending} onClick={() => copy.mutate({ id: t.id, clientId: client.id })}>Use for {client.name}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ErrorNote error={copy.error} />
    </div>
  );
}

function People({ client }: { client: Client }) {
  return (
    <div className="space-y-3 max-w-3xl">
      <p className="text-micro text-muted">People at the client who can sign in to their portal. Invite them from <Link href="/team" className="text-accent hover:underline">Team</Link>.</p>
      {client.memberships.length === 0 ? <p className="text-sm text-muted">Nobody from the client has access yet.</p> : (
        <ul className="card divide-y divide-hairline">
          {client.memberships.map((m) => (
            <li key={m.id} className="p-3 flex items-center gap-2 text-[13px]">
              <span className="flex-1">{[m.user.firstName, m.user.lastName].filter(Boolean).join(' ') || m.user.email}<span className="block text-[11px] text-muted">{m.user.email}</span></span>
              <Pill>{ROLE_LABELS[m.role]}</Pill>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
