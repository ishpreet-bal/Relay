'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, CheckCircle2, FileSignature, Hammer, PlayCircle, XCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/types';
import { Topbar } from '@/components/shell/topbar';
import { PageBody, Section } from '@/components/ui/page';
import { Pill } from '@/components/ui/pill';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { ErrorNote, Loading } from '@/components/ui/states';
import { Ago } from '@/components/ui/time';
import { formatMoney } from '@/lib/utils';
import { OPP_STATUS_LABEL, OPP_STATUS_TONE, REUSE_LABEL, REUSE_TONE } from './opportunity-ui';

type Detail = RouterOutputs['delivery']['opportunity'];
export interface OpportunityCaps { write: boolean; review: boolean; demo: boolean; propose: boolean; send: boolean; convert: boolean }

const SOURCES = [
  ['stated_by_prospect', 'Stated by the prospect'], ['observed', 'Observed'], ['research_estimate', 'Research estimate'], ['our_assumption', 'Our assumption'],
] as const;

export function OpportunityDetail({ id, caps }: { id: string; caps: OpportunityCaps }) {
  const q = trpc.delivery.opportunity.useQuery({ id });
  if (q.isPending) return <><Topbar title="Opportunity" showClientSwitcher={false} /><Loading /></>;
  if (!q.data) return <><Topbar title="Opportunity" showClientSwitcher={false} /><PageBody><ErrorNote error={q.error ?? { message: 'Not found' }} /></PageBody></>;
  return <Loaded d={q.data} caps={caps} />;
}

function Loaded({ d, caps }: { d: Detail; caps: OpportunityCaps }) {
  const o = d.opportunity;
  const utils = trpc.useUtils();
  const refresh = () => { utils.delivery.opportunity.invalidate({ id: o.id }); utils.delivery.opportunities.invalidate(); };
  const reviewM = trpc.delivery.review.useMutation({ onSuccess: refresh });
  const lost = trpc.delivery.markLost.useMutation({ onSuccess: refresh });
  const [note, setNote] = useState('');
  const open = ['PROPOSED', 'QUALIFIED', 'REJECTED'].includes(o.status);
  return (
    <>
      <Topbar title={o.title} showClientSwitcher={false} />
      <PageBody width="wide" className="space-y-8">
        <div>
          <Link href="/opportunities" className="text-micro text-muted hover:text-ink inline-flex items-center gap-1"><ArrowLeft className="size-3.5" /> Opportunities</Link>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-micro">
            <Pill tone={OPP_STATUS_TONE[o.status] ?? 'neutral'}>{OPP_STATUS_LABEL[o.status] ?? o.status}</Pill>
            {d.account && <Link href={`/accounts/${d.account.id}`} className="hover:underline">{d.account.name}</Link>}
            <span className="text-muted">· {o.source === 'DEEP_RESEARCH' ? `from deep research v${d.researchVersion?.version ?? '?'}` : 'added by hand'} · updated <Ago date={o.updatedAt} /></span>
          </div>
          {o.reviewNote && <p className="text-micro text-muted mt-1">Review note: {o.reviewNote}</p>}
        </div>

        <div className="grid lg:grid-cols-[1fr_360px] gap-8">
          <div className="space-y-8">
            <Section title="The opportunity">
              <div className="card p-4 space-y-3 text-micro">
                <div><p className="eyebrow mb-0.5">Problem today</p><p>{o.problem}</p></div>
                <div><p className="eyebrow mb-0.5">What would be automated</p><p>{o.proposedAutomation}</p></div>
                {o.howToValidate && <div><p className="eyebrow mb-0.5">How to validate</p><p>{o.howToValidate}</p></div>}
                {!!o.integrationBarriers.length && <div><p className="eyebrow mb-0.5">Integration barriers</p><ul className="list-disc pl-4">{o.integrationBarriers.map((b) => <li key={b}>{b}</li>)}</ul></div>}
                {o.confidence !== null && <p className="text-muted">Research confidence {Math.round(o.confidence * 100)}%.</p>}
              </div>
              {!!d.evidence.length && (
                <div className="mt-3">
                  <p className="eyebrow mb-1">Verified facts it rests on</p>
                  <ul className="card divide-y divide-hairline">{d.evidence.map((f) => <li key={f.id} className="p-2.5 text-[12px]"><span className="font-mono text-[11px] text-muted mr-2">{f.id}</span>{f.statement}</li>)}</ul>
                </div>
              )}
            </Section>
            <Match d={d} caps={caps} onChange={refresh} />
            <AssessmentForm d={d} canEdit={caps.write && !['WON', 'LOST'].includes(o.status)} onChange={refresh} />
          </div>

          <div className="space-y-8">
            <Section title="Decision">
              <div className="card p-4 space-y-2 text-micro">
                {caps.review && open ? (
                  <>
                    <p className="text-muted">Qualify it to allow a demo and a proposal. It needs an assessment first.</p>
                    <input className="input" placeholder="Note (why)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
                    <div className="flex gap-2">
                      <button type="button" className="btn-primary h-8 text-micro" disabled={reviewM.isPending || o.status === 'QUALIFIED'} onClick={() => reviewM.mutate({ id: o.id, decision: 'QUALIFIED', note: note || null })}><CheckCircle2 className="size-3.5" /> Qualify</button>
                      <button type="button" className="btn-outline h-8 text-micro" disabled={reviewM.isPending || o.status === 'REJECTED'} onClick={() => reviewM.mutate({ id: o.id, decision: 'REJECTED', note: note || null })}><XCircle className="size-3.5" /> Reject</button>
                    </div>
                  </>
                ) : <p className="text-muted">{o.reviewedAt ? <>Reviewed <Ago date={o.reviewedAt} />.</> : 'Waiting for review.'}</p>}
                {caps.write && !['WON', 'LOST', 'REJECTED'].includes(o.status) && (
                  <button type="button" className="btn-ghost h-7 text-[11px]" disabled={lost.isPending}
                          onClick={() => { const n = prompt('Why was it lost?'); if (n && n.trim().length >= 3) lost.mutate({ id: o.id, note: n.trim() }); }}>Mark lost</button>
                )}
                <ErrorNote error={reviewM.error ?? lost.error} />
              </div>
            </Section>
            <DemoPanel d={d} caps={caps} onChange={refresh} />
            <ProposalPanel d={d} caps={caps} onChange={refresh} />
          </div>
        </div>
      </PageBody>
    </>
  );
}

function Match({ d, caps, onChange }: { d: Detail; caps: OpportunityCaps; onChange: () => void }) {
  const o = d.opportunity;
  const [editing, setEditing] = useState(false);
  const clear = trpc.delivery.clearOverride.useMutation({ onSuccess: onChange });
  const reasons = (o.reusabilityReasons as { reasons?: string[]; automatic?: boolean } | null) ?? {};
  const basis = (o.estimateBasis as { basis?: string[]; hoursSaved?: number } | null) ?? {};
  return (
    <Section title="Solution and reuse" hint="Matched by the words describing the work and the industry. Estimates are estimates until finished projects calibrate them."
             action={caps.write && !['WON', 'LOST'].includes(o.status) && (
               <div className="flex gap-1">
                 {o.matchOverridden && <button type="button" className="btn-ghost h-7 text-[11px]" disabled={clear.isPending} onClick={() => clear.mutate({ id: o.id })}>Use automatic match</button>}
                 <button type="button" className="btn-outline h-7 text-[11px]" onClick={() => setEditing(true)}>Change</button>
               </div>
             )}>
      <div className="card p-4 text-micro space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {o.reusability && <Pill tone={REUSE_TONE[o.reusability] ?? 'neutral'}>{REUSE_LABEL[o.reusability]}</Pill>}
          <span className="font-medium">{d.template ? `${d.template.name} · ${d.template.industry}` : 'No template'}</span>
          {o.matchScore !== null && <span className="text-muted num">score {o.matchScore}</span>}
          {o.matchOverridden && <Pill>set by a person</Pill>}
        </div>
        {!!reasons.reasons?.length && <ul className="list-disc pl-4 text-muted">{reasons.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
        {o.estimatedBuildHours !== null && (
          <dl className="grid grid-cols-3 gap-3">
            <div><dt className="eyebrow">With reuse</dt><dd className="num text-lg">{o.estimatedBuildHours} h</dd></div>
            <div><dt className="eyebrow">From scratch</dt><dd className="num text-lg">{o.fromScratchHours} h</dd></div>
            <div><dt className="eyebrow">Saved by reuse</dt><dd className="num text-lg">{basis.hoursSaved ?? '—'} h</dd></div>
          </dl>
        )}
        {!!basis.basis?.length && <ul className="text-[11px] text-muted space-y-0.5">{basis.basis.map((b) => <li key={b}>{b}</li>)}</ul>}
        <p className="text-[11px] text-muted">Price at the current rate card: setup {formatMoney(d.price.setupCents)} ({formatMoney(d.price.hourlyCents)}/h), monthly {formatMoney(d.price.monthlyCents)}.</p>
        <ErrorNote error={clear.error} />
      </div>
      {editing && <OverrideDialog d={d} onClose={() => setEditing(false)} onSaved={onChange} />}
    </Section>
  );
}

function OverrideDialog({ d, onClose, onSaved }: { d: Detail; onClose: () => void; onSaved: () => void }) {
  const templates = trpc.studio.templates.useQuery();
  const [templateId, setTemplateId] = useState(d.opportunity.templateId ?? '');
  const [reusability, setReusability] = useState(d.opportunity.reusability ?? 'CONFIGURATION');
  const [note, setNote] = useState('');
  const save = trpc.delivery.overrideMatch.useMutation({ onSuccess: () => { onSaved(); onClose(); } });
  return (
    <Dialog open onOpenChange={(x) => !x && onClose()} title="Change the match" description="Your choice stays until you switch back to the automatic match.">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate({ id: d.opportunity.id, templateId: templateId || null, reusability: reusability as 'EXACT', note }); }}>
        <Field label="Template">{(id) => (
          <select id={id} className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">None (custom build)</option>
            {templates.data?.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.industry}</option>)}
          </select>
        )}</Field>
        <Field label="Reuse">{(id) => (
          <select id={id} className="input" value={reusability} onChange={(e) => setReusability(e.target.value)}>
            {Object.entries(REUSE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}</Field>
        <Field label="Why" hint="Kept with the opportunity.">{(id) => <input id={id} className="input" value={note} onChange={(e) => setNote(e.target.value)} required minLength={3} maxLength={1000} />}</Field>
        <ErrorNote error={save.error} />
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={save.isPending}>Save</button></div>
      </form>
    </Dialog>
  );
}

type Src = (typeof SOURCES)[number][0];
interface Input<T> { value: T; source: Src }
interface AssessmentState {
  tasksPerWeek: Input<number>; minutesPerTask: Input<number>; automatableShare: Input<{ low: number; high: number }>; hourlyCostCents: Input<number>;
  errorRatePct?: Input<number>; costPerErrorCents?: Input<number>; risks: string[]; notes?: string;
}

function AssessmentForm({ d, canEdit, onChange }: { d: Detail; canEdit: boolean; onChange: () => void }) {
  const o = d.opportunity;
  const initial = (o.assessment as AssessmentState | null) ?? {
    tasksPerWeek: { value: 20, source: 'our_assumption' }, minutesPerTask: { value: 15, source: 'our_assumption' },
    automatableShare: { value: { low: 0.4, high: 0.7 }, source: 'our_assumption' }, hourlyCostCents: { value: 4375, source: 'our_assumption' }, risks: [],
  };
  const [a, setA] = useState<AssessmentState>(initial);
  const save = trpc.delivery.assess.useMutation({ onSuccess: onChange });
  const p = o.projection;
  const num = (k: 'tasksPerWeek' | 'minutesPerTask', label: string, step = 1) => (
    <Row label={label} source={a[k].source} onSource={(s) => setA({ ...a, [k]: { ...a[k], source: s } })} disabled={!canEdit}>
      <input type="number" min={0} step={step} className="input" value={a[k].value} disabled={!canEdit} onChange={(e) => setA({ ...a, [k]: { ...a[k], value: Number(e.target.value) } })} />
    </Row>
  );
  return (
    <Section title="Assessment and projected value" hint="Every input says where it came from. The projection is a scenario from these inputs; realised savings come only from a live application's own data.">
      <form className="card p-4 space-y-3 text-micro" onSubmit={(e) => { e.preventDefault(); save.mutate({ id: o.id, assessment: a }); }}>
        {num('tasksPerWeek', 'Tasks per week')}
        {num('minutesPerTask', 'Minutes per task today')}
        <Row label="Share automatable (low–high %)" source={a.automatableShare.source} onSource={(s) => setA({ ...a, automatableShare: { ...a.automatableShare, source: s } })} disabled={!canEdit}>
          <div className="flex gap-2">
            {(['low', 'high'] as const).map((k) => (
              <input key={k} type="number" min={0} max={100} className="input" disabled={!canEdit} value={Math.round(a.automatableShare.value[k] * 100)}
                     onChange={(e) => setA({ ...a, automatableShare: { ...a.automatableShare, value: { ...a.automatableShare.value, [k]: Number(e.target.value) / 100 } } })} aria-label={`${k} share`} />
            ))}
          </div>
        </Row>
        <Row label="Loaded hourly cost ($)" source={a.hourlyCostCents.source} onSource={(s) => setA({ ...a, hourlyCostCents: { ...a.hourlyCostCents, source: s } })} disabled={!canEdit}>
          <input type="number" min={0} step={0.5} className="input" disabled={!canEdit} value={a.hourlyCostCents.value / 100} onChange={(e) => setA({ ...a, hourlyCostCents: { ...a.hourlyCostCents, value: Math.round(Number(e.target.value) * 100) } })} />
        </Row>
        <Row label="Errors per 100 tasks (optional)" source={a.errorRatePct?.source ?? 'our_assumption'} onSource={(s) => a.errorRatePct && setA({ ...a, errorRatePct: { ...a.errorRatePct, source: s } })} disabled={!canEdit}>
          <input type="number" min={0} max={100} className="input" disabled={!canEdit} value={a.errorRatePct?.value ?? ''} placeholder="—"
                 onChange={(e) => setA({ ...a, errorRatePct: e.target.value === '' ? undefined : { value: Number(e.target.value), source: a.errorRatePct?.source ?? 'stated_by_prospect' } })} />
        </Row>
        <Row label="Cost of one error ($, optional)" source={a.costPerErrorCents?.source ?? 'our_assumption'} onSource={(s) => a.costPerErrorCents && setA({ ...a, costPerErrorCents: { ...a.costPerErrorCents, source: s } })} disabled={!canEdit}>
          <input type="number" min={0} className="input" disabled={!canEdit} value={a.costPerErrorCents ? a.costPerErrorCents.value / 100 : ''} placeholder="—"
                 onChange={(e) => setA({ ...a, costPerErrorCents: e.target.value === '' ? undefined : { value: Math.round(Number(e.target.value) * 100), source: a.costPerErrorCents?.source ?? 'stated_by_prospect' } })} />
        </Row>
        <Field label="Notes">{(id) => <textarea id={id} className="input h-16 py-2" disabled={!canEdit} value={a.notes ?? ''} onChange={(e) => setA({ ...a, notes: e.target.value || undefined })} maxLength={2000} />}</Field>
        <ErrorNote error={save.error} />
        {canEdit && <div className="flex justify-end"><button type="submit" className="btn-primary h-8 text-micro" disabled={save.isPending}>Save and project</button></div>}
      </form>
      {p && (
        <div className="card p-4 mt-3 text-micro">
          <p className="eyebrow mb-2">Projected (scenario) · today ≈ {p.hoursPerMonthToday} h/month on this work</p>
          <div className="grid grid-cols-2 gap-3">
            {(['low', 'high'] as const).map((k) => (
              <div key={k}>
                <p className="text-muted capitalize">{k}</p>
                <p className="num text-lg">{formatMoney(p[k].monthlyValueCents)}<span className="text-micro text-muted">/month</span></p>
                <p className="text-[11px] text-muted">{p[k].hoursPerMonth} h/month · {p[k].paybackMonths ? `payback ~${p[k].paybackMonths} months` : 'no payback at this price'}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted mt-2">{p.note}</p>
        </div>
      )}
    </Section>
  );
}

function Row({ label, source, onSource, disabled, children }: { label: string; source: Src; onSource: (s: Src) => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_170px] gap-2 items-end">
      <label className="block"><span className="block text-[12px] font-medium mb-1">{label}</span>{children}</label>
      <select className="input text-[12px]" aria-label={`${label}: source`} value={source} disabled={disabled} onChange={(e) => onSource(e.target.value as Src)}>
        {SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

function DemoPanel({ d, caps, onChange }: { d: Detail; caps: OpportunityCaps; onChange: () => void }) {
  const o = d.opportunity;
  const build = trpc.delivery.buildDemo.useMutation({ onSuccess: onChange });
  const canBuild = caps.demo && ['QUALIFIED', 'DEMO'].includes(o.status) && !!o.templateVersionId && !['CUSTOM', 'NOT_FEASIBLE'].includes(o.reusability ?? '');
  return (
    <Section title="Demo" hint="Built in the demo sandbox from the matched template, branded with the company's public name, on synthetic records only.">
      <div className="card p-4 text-micro space-y-2">
        {d.demos.map((demo) => (
          <p key={demo.id}><Link href={`/studio/apps/${demo.applicationId}`} className="hover:underline font-medium">Open demo application</Link> <span className="text-muted">· {demo.sampleRuns} synthetic runs · <Ago date={demo.createdAt} /></span></p>
        ))}
        {!d.demos.length && <p className="text-muted">{o.status === 'PROPOSED' ? 'Qualify the opportunity first.' : 'No demo yet.'}</p>}
        {canBuild && <button type="button" className="btn-outline h-8 text-micro" disabled={build.isPending} onClick={() => build.mutate({ id: o.id })}><PlayCircle className="size-3.5" /> {build.isPending ? 'Building…' : d.demos.length ? 'Build another' : 'Build demo'}</button>}
        <ErrorNote error={build.error} />
      </div>
    </Section>
  );
}

function ProposalPanel({ d, caps, onChange }: { d: Detail; caps: OpportunityCaps; onChange: () => void }) {
  const o = d.opportunity;
  const p = d.proposal;
  const draft = trpc.delivery.draftProposal.useMutation({ onSuccess: onChange });
  const approve = trpc.delivery.approveProposal.useMutation({ onSuccess: onChange });
  const convert = trpc.delivery.convert.useMutation({ onSuccess: onChange });
  const [accepting, setAccepting] = useState(false);
  const project = d.projects[0];
  return (
    <Section title="Proposal and customer">
      <div className="card p-4 text-micro space-y-2">
        {!p ? (
          <>
            <p className="text-muted">Priced from the rate card and the effort estimate. It stays a draft until someone approves it.</p>
            {caps.propose && ['QUALIFIED', 'DEMO'].includes(o.status) && <button type="button" className="btn-outline h-8 text-micro" disabled={draft.isPending} onClick={() => draft.mutate({ id: o.id })}><FileSignature className="size-3.5" /> Draft proposal</button>}
          </>
        ) : (
          <>
            <p><span className="font-medium">Proposal {p.number}</span> <Pill tone={p.status === 'ACCEPTED' ? 'positive' : 'neutral'}>{p.status.toLowerCase()}</Pill></p>
            <p className="text-muted">{formatMoney(p.totalCents)} setup · {formatMoney(p.recurringMonthlyCents)}/month · {p.approvedAt ? <>approved <Ago date={p.approvedAt} /></> : 'not approved'}</p>
            {p.approvedAt && <p className="text-[11px] break-all"><span className="text-muted">Share link: </span><span className="font-mono">/p/{p.shareToken}</span></p>}
            {p.acceptanceEvidence && <p className="text-[11px] text-muted">Accepted by {p.signatureName}: {p.acceptanceEvidence}</p>}
            {p.status === 'ACCEPTED' && !p.acceptanceEvidence && p.signatureName && <p className="text-[11px] text-muted">Signed through the share link by {p.signatureName}.</p>}
            <div className="flex flex-wrap gap-2">
              {caps.send && !p.approvedAt && p.status === 'DRAFT' && <button type="button" className="btn-primary h-8 text-micro" disabled={approve.isPending} onClick={() => approve.mutate({ proposalId: p.id })}>Approve</button>}
              {caps.send && p.approvedAt && p.status !== 'ACCEPTED' && <button type="button" className="btn-outline h-8 text-micro" onClick={() => setAccepting(true)}>Record acceptance</button>}
            </div>
          </>
        )}
        {p?.status === 'ACCEPTED' && (
          o.customerClientId ? (
            <div className="border-t border-hairline pt-2 space-y-1">
              <p className="text-cleared font-medium">Customer created.</p>
              {project?.applicationId && <p><Link href={`/studio/apps/${project.applicationId}`} className="hover:underline">Their application (draft; test and deploy in Studio)</Link></p>}
              {project && <p><Link href="/projects" className="hover:underline">Delivery project: {project.estimatedHours} h estimated</Link></p>}
            </div>
          ) : caps.convert ? (
            <button type="button" className="btn-primary h-8 text-micro" disabled={convert.isPending} onClick={() => { if (confirm('Create the customer, a delivery project and a draft application?')) convert.mutate({ id: o.id }); }}>
              <Hammer className="size-3.5" /> Create customer and project
            </button>
          ) : <p className="text-muted">An admin creates the customer from here.</p>
        )}
        <ErrorNote error={draft.error ?? approve.error ?? convert.error} />
      </div>
      {accepting && p && <AcceptanceDialog proposalId={p.id} onClose={() => setAccepting(false)} onSaved={onChange} />}
    </Section>
  );
}

function AcceptanceDialog({ proposalId, onClose, onSaved }: { proposalId: string; onClose: () => void; onSaved: () => void }) {
  const [signedBy, setSignedBy] = useState('');
  const [evidence, setEvidence] = useState('');
  const save = trpc.delivery.recordAcceptance.useMutation({ onSuccess: () => { onSaved(); onClose(); } });
  return (
    <Dialog open onOpenChange={(x) => !x && onClose()} title="Record the customer's acceptance" description="For authorisation received outside the share link: a signed SOW, a purchase order, an email. Keep the evidence where you can find it.">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate({ proposalId, signedBy, evidence }); }}>
        <Field label="Accepted by">{(id) => <input id={id} className="input" value={signedBy} onChange={(e) => setSignedBy(e.target.value)} required minLength={2} maxLength={120} placeholder="Name and title" />}</Field>
        <Field label="Evidence">{(id) => <textarea id={id} className="input h-20 py-2" value={evidence} onChange={(e) => setEvidence(e.target.value)} required minLength={5} maxLength={1000} placeholder="e.g. Signed SOW received by email on 21 Oct, filed in Drive › Customers" />}</Field>
        <ErrorNote error={save.error} />
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={save.isPending}>Record</button></div>
      </form>
    </Dialog>
  );
}
