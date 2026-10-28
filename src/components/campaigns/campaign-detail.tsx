'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, Pause, Play, ShieldCheck } from 'lucide-react';
import type { ClaimType } from '@prisma/client';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/types';
import { CLAIM_TYPES, CLAIM_TYPE_LABELS, personName } from '@/lib/domain';
import { Topbar } from '@/components/shell/topbar';
import { PageBody, Section } from '@/components/ui/page';
import { Pill } from '@/components/ui/pill';
import { Kpi, pct } from '@/components/ui/kpi';
import { Dialog } from '@/components/ui/dialog';
import { ChipSelect, Field } from '@/components/ui/field';
import { Table, Th, Td } from '@/components/ui/table';
import { EmptyState, ErrorNote, Loading } from '@/components/ui/states';
import { Ago } from '@/components/ui/time';
import { AccountStatusPill } from '@/components/domain/pills';
import { SequenceDiagram } from './sequence-diagram';

type Campaign = RouterOutputs['campaigns']['byId'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function CampaignDetail({ id, can }: { id: string; can: { write: boolean; activate: boolean } }) {
  const campaign = trpc.campaigns.byId.useQuery({ id });
  const stats = trpc.campaigns.stats.useQuery({ id });
  const enrollments = trpc.campaigns.enrollments.useQuery({ campaignId: id });
  const [editingPolicy, setEditingPolicy] = useState(false);

  if (campaign.isPending) return <><Topbar title="Campaign" showClientSwitcher={false} /><Loading /></>;
  if (campaign.error) return <><Topbar title="Campaign" showClientSwitcher={false} /><PageBody><ErrorNote error={campaign.error} /></PageBody></>;
  const c = campaign.data;
  const s = stats.data;

  return (
    <>
      <Topbar title={c.name} showClientSwitcher={false} />
      <PageBody>
        <Link href="/campaigns" className="inline-flex items-center gap-1 text-micro text-muted hover:text-ink mb-3"><ArrowLeft className="size-3.5" /> Campaigns</Link>
        <header className="mb-4">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h2 className="text-xl font-semibold">{c.name}</h2>
            <Pill tone={c.status === 'ACTIVE' ? 'positive' : c.status === 'PAUSED' ? 'warning' : 'neutral'}>{c.status.toLowerCase().replace(/_/g, ' ')}</Pill>
          </div>
          <p className="text-micro text-muted">
            {c.client.name}{c.offer && <> · offer: {c.offer.name}</>}{c.icp && <> · ICP: {c.icp.name}</>}
            {c.playbook && <> · playbook: <Link href={`/playbooks/${c.playbook.id}`} className="hover:text-accent">{c.playbook.name}</Link></>}
          </p>
        </header>

        <StatusControls campaign={c} canActivate={can.activate} onChange={() => campaign.refetch()} />

        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-6">
          <Kpi label="In review" value={s?.inReview ?? '—'} caption={<Link href={`/review?campaign=${c.id}`} className="hover:text-accent">Open review queue →</Link>} />
          <Kpi label="Sent" value={s?.sent ?? '—'} caption={s ? `${s.autoApproved} approved by policy` : undefined} />
          <Kpi label="Replies" value={s?.replies ?? '—'} caption={s ? `${pct(s.replyRate)} · ${s.positiveReplies} positive` : undefined} />
          <Kpi label="Meetings" value={s?.meetings ?? '—'} caption={s ? `${s.calls} calls logged` : undefined} tone={s && s.meetings > 0 ? 'positive' : undefined} />
        </section>
        {s && s.bounceRate > 0.03 && (
          <p className="flex items-center gap-1.5 text-[12px] text-blocked mb-6">
            <AlertTriangle className="size-3.5" /> Bounce rate is {pct(s.bounceRate)}. Above 3% hurts deliverability — check the list&apos;s email quality.
          </p>
        )}

        <Section title="Sequence" className="mb-6">
          <SequenceDiagram steps={c.steps} />
        </Section>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div className="card p-4">
            <div className="flex items-center mb-2">
              <h3 className="eyebrow flex-1">Approval policy</h3>
              {can.write && <button type="button" className="btn-ghost h-7 text-micro" onClick={() => setEditingPolicy(true)}>Change</button>}
            </div>
            <p className="text-micro flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-accent" />Every draft requires a person’s approval before sending.</p>
          </div>
          <div className="card p-4">
            <h3 className="eyebrow mb-2">Sending</h3>
            <p className="text-micro">
              {c.mailbox ? <>{c.mailbox.fromName} &lt;{c.mailbox.fromEmail}&gt;</> : <span className="text-held">No mailbox chosen</span>}
            </p>
            <p className="text-micro text-muted mt-1">
              {c.sendDays.map((d) => DAYS[d - 1]).join(', ')} · <span className="num">{String(c.sendStartHour).padStart(2, '0')}:00–{String(c.sendEndHour).padStart(2, '0')}:00</span> {c.timezone ?? c.client.timezone}
            </p>
            <p className="text-micro text-muted">Up to <span className="num">{c.dailyCap}</span> a day · {c.maxContactsPerAccount} per company · calls {c.callFollowUp ? 'follow up on engagement' : 'off'}</p>
          </div>
        </div>

        <Section title={`People (${c._count.enrollments})`} hint="Add accounts from the Accounts list; each company's best-matching contacts are enrolled.">
          {enrollments.isPending ? <Loading /> : !enrollments.data?.length ? (
            <EmptyState title="Nobody enrolled yet" action={<Link href="/accounts" className="btn-outline">Choose accounts</Link>}>
              Select accounts on the Accounts page and choose &ldquo;Add to campaign&rdquo;.
            </EmptyState>
          ) : (
            <Table>
              <thead><tr><Th>Person</Th><Th>Account</Th><Th>Step</Th><Th>Status</Th><Th className="hidden md:table-cell">Next action</Th>{can.write && <Th />}</tr></thead>
              <tbody>
                {enrollments.data.map((e) => <EnrollmentRow key={e.id} e={e} canWrite={can.write} onChange={() => enrollments.refetch()} />)}
              </tbody>
            </Table>
          )}
        </Section>
      </PageBody>
      {editingPolicy && <PolicyDialog campaign={c} onClose={() => { setEditingPolicy(false); campaign.refetch(); }} />}
    </>
  );
}

function StatusControls({ campaign: c, canActivate, onChange }: { campaign: Campaign; canActivate: boolean; onChange: () => void }) {
  const setStatus = trpc.campaigns.setStatus.useMutation({ onSuccess: onChange });
  const blocked = c.activationProblems.length > 0;
  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-micro text-muted flex-1 min-w-[220px]">
          {c.status === 'ACTIVE' ? 'Running. Drafts are written on schedule; verified ones send per the policy, the rest wait for review.'
            : c.status === 'PAUSED' ? 'Paused. Nothing new is drafted and nothing waiting will send.'
              : c.status === 'COMPLETED' ? 'Completed.' : 'Draft. Add people, then activate.'}
        </p>
        {canActivate && c.status !== 'ACTIVE' && c.status !== 'COMPLETED' && (
          <button type="button" className="btn-primary h-8 text-micro" disabled={setStatus.isPending || blocked} onClick={() => setStatus.mutate({ id: c.id, status: 'ACTIVE' })}>
            <Play className="size-3.5" /> Activate
          </button>
        )}
        {canActivate && c.status === 'ACTIVE' && (
          <>
            <button type="button" className="btn-outline h-8 text-micro" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: c.id, status: 'PAUSED' })}><Pause className="size-3.5" /> Pause</button>
            <button type="button" className="btn-ghost h-8 text-micro" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: c.id, status: 'COMPLETED' })}><Check className="size-3.5" /> Complete</button>
          </>
        )}
      </div>
      {blocked && c.status !== 'ACTIVE' && (
        <ul className="text-[12px] text-held space-y-0.5">
          {c.activationProblems.map((p) => <li key={p} className="flex items-start gap-1.5"><AlertTriangle className="size-3.5 shrink-0 mt-0.5" /> {p}</li>)}
        </ul>
      )}
      <ErrorNote error={setStatus.error} />
    </div>
  );
}

function EnrollmentRow({ e, canWrite, onChange }: { e: RouterOutputs['campaigns']['enrollments'][number]; canWrite: boolean; onChange: () => void }) {
  const remove = trpc.campaigns.removeContact.useMutation({ onSuccess: onChange });
  const live = ['PENDING', 'ACTIVE', 'PAUSED'].includes(e.status);
  return (
    <tr>
      <Td>
        {e.contact ? (
          <><Link href={`/contacts/${e.contact.id}`} className="hover:text-accent">{personName(e.contact)}</Link><span className="block text-[11px] text-muted">{e.contact.title}</span></>
        ) : <span className="text-muted">Contact removed</span>}
      </Td>
      <Td><Link href={`/accounts/${e.account.id}`} className="hover:text-accent">{e.account.name}</Link><span className="block"><AccountStatusPill status={e.account.status} /></span></Td>
      <Td className="num">{e.currentStep + 1}</Td>
      <Td className="text-micro">{e.status.toLowerCase()}{e.exitReason && <span className="block text-[11px] text-muted">{e.exitReason.toLowerCase().replace(/_/g, ' ')}</span>}</Td>
      <Td className="hidden md:table-cell text-micro text-muted">{live ? <Ago date={e.nextActionAt} /> : '—'}</Td>
      {canWrite && (
        <Td>{live && e.contact && <button type="button" className="btn-ghost h-7 text-[11px]" disabled={remove.isPending} onClick={() => remove.mutate({ contactId: e.contact!.id })}>Remove</button>}</Td>
      )}
    </tr>
  );
}

function PolicyDialog({ campaign: c, onClose }: { campaign: Campaign; onClose: () => void }) {
  const [mode, setMode] = useState<'REVIEW_ALL' | 'AUTO_APPROVE_VERIFIED'>('REVIEW_ALL');
  const [threshold, setThreshold] = useState(c.autoApproveThreshold);
  const [types, setTypes] = useState<ClaimType[]>(c.approvedClaimTypes);
  const [dailyCap, setDailyCap] = useState(c.dailyCap);
  const update = trpc.campaigns.update.useMutation({ onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Approval policy" width="lg" description="Changes are recorded in the audit log.">
      <div className="space-y-4">
        <Field label="Mode">
          {(id) => (
            <select id={id} className="input" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="REVIEW_ALL">Review every email</option>
              <option value="AUTO_APPROVE_VERIFIED" disabled>Automatic sending is disabled</option>
            </select>
          )}
        </Field>
        {mode === 'AUTO_APPROVE_VERIFIED' && (
          <>
            <Field label="Claims that may go out without review">{() => <ChipSelect options={CLAIM_TYPES} value={types} onChange={setTypes} labels={CLAIM_TYPE_LABELS} />}</Field>
            <Field label="Minimum verification score">{(id) => <input id={id} type="number" step={0.01} min={0.5} max={1} className="input w-28" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />}</Field>
          </>
        )}
        <Field label="Daily cap">{(id) => <input id={id} type="number" min={1} max={500} className="input w-28" value={dailyCap} onChange={(e) => setDailyCap(Number(e.target.value))} />}</Field>
        <ErrorNote error={update.error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={update.isPending}
                  onClick={() => update.mutate({ id: c.id, data: { approvalMode: mode, autoApproveThreshold: threshold, approvedClaimTypes: types, dailyCap } })}>Save</button>
        </div>
      </div>
    </Dialog>
  );
}
