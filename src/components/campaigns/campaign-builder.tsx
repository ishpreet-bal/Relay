'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Plus, ShieldCheck, Trash2 } from 'lucide-react';
import type { ClaimType } from '@prisma/client';
import { trpc } from '@/lib/trpc/client';
import { useActiveClient } from '@/components/shell/active-client';
import { CLAIM_TYPES, CLAIM_TYPE_LABELS } from '@/lib/domain';
import { ChipSelect, Field } from '@/components/ui/field';
import { ErrorNote, NotConfigured } from '@/components/ui/states';
import { Section } from '@/components/ui/page';
import { cn } from '@/lib/utils';

interface Step { order: number; delayHours: number; purpose: string; instructions: string; stopOnReply: boolean }
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * A campaign ties one client's ICP, offer and playbook to a sequence and a
 * sending policy. The policy is explicit: review everything, or let drafts
 * whose every claim is verified (and of an approved type) send on their own.
 */
export function CampaignBuilder() {
  const router = useRouter();
  const { clientId: activeClientId, clients } = useActiveClient();
  const [clientId, setClientId] = useState(activeClientId ?? '');
  const client = trpc.clients.byId.useQuery({ id: clientId }, { enabled: !!clientId });
  const playbooks = trpc.playbooks.list.useQuery({ clientId: clientId || null }, { enabled: !!clientId });
  const mailboxes = trpc.campaigns.mailboxes.useQuery();
  const defaults = trpc.campaigns.defaultSteps.useQuery();

  const [name, setName] = useState('');
  const [icpId, setIcpId] = useState('');
  const [offerId, setOfferId] = useState('');
  const [playbookId, setPlaybookId] = useState('');
  const [mailboxId, setMailboxId] = useState('');
  const [sendDays, setSendDays] = useState([1, 2, 3, 4, 5]);
  const [sendStartHour, setStart] = useState(8);
  const [sendEndHour, setEnd] = useState(16);
  const [dailyCap, setDailyCap] = useState(30);
  const [approvalMode, setApprovalMode] = useState<'REVIEW_ALL' | 'AUTO_APPROVE_VERIFIED'>('REVIEW_ALL');
  const [threshold, setThreshold] = useState(0.92);
  const [claimTypes, setClaimTypes] = useState<ClaimType[]>([]);
  const [maxContacts, setMaxContacts] = useState(1);
  const [callFollowUp, setCallFollowUp] = useState(true);
  const [toneGuidelines, setTone] = useState('');
  const [steps, setSteps] = useState<Step[]>([]);

  const playbookSteps = trpc.campaigns.playbookSteps.useQuery({ playbookId }, { enabled: !!playbookId });

  // Sensible defaults as choices are made.
  useEffect(() => { if (!steps.length && defaults.data) setSteps(defaults.data.map((s) => ({ ...s }))); }, [defaults.data, steps.length]);
  useEffect(() => {
    if (!client.data) return;
    setIcpId(client.data.icps.find((i) => i.isActive)?.id ?? '');
    setOfferId(client.data.offers.find((o) => o.isActive)?.id ?? '');
  }, [client.data]);
  useEffect(() => {
    const own = playbooks.data?.find((p) => p.clientId === clientId);
    if (own) setPlaybookId(own.id);
  }, [playbooks.data, clientId]);
  useEffect(() => {
    if (!playbookSteps.data) return;
    setSteps(playbookSteps.data.steps.map((s) => ({ ...s })));
    setClaimTypes(playbookSteps.data.approvedClaimTypes as ClaimType[]);
    setThreshold(playbookSteps.data.autoApproveThreshold);
  }, [playbookSteps.data]);
  useEffect(() => { if (!mailboxId && mailboxes.data?.[0]) setMailboxId(mailboxes.data[0].id); }, [mailboxes.data, mailboxId]);

  const create = trpc.campaigns.create.useMutation({ onSuccess: (c) => router.push(`/campaigns/${c.id}`) });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate({
      clientId, name, icpId: icpId || null, offerId: offerId || null, playbookId: playbookId || null,
      mailboxId: mailboxId || null, timezone: client.data?.timezone ?? null,
      sendDays, sendStartHour, sendEndHour, dailyCap, approvalMode, autoApproveThreshold: threshold,
      approvedClaimTypes: claimTypes, maxContactsPerAccount: maxContacts, callFollowUp,
      toneGuidelines: toneGuidelines || undefined,
      steps: steps.map((s, i) => ({ ...s, order: i })),
    });
  };

  return (
    <form onSubmit={submit} className="space-y-8">
      <Section title="Who and what">
        <div className="card p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Client">
              {(id) => (
                <select id={id} required className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                  <option value="">Choose a client…</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </Field>
            <Field label="Campaign name">{(id) => <input id={id} required className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Q4 — Ontario manufacturers" />}</Field>
          </div>
          {client.data && (
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Ideal customer profile" hint={!client.data.icps.length ? 'Add one on the client first.' : undefined}>
                {(id) => (
                  <select id={id} className="input" value={icpId} onChange={(e) => setIcpId(e.target.value)}>
                    <option value="">None</option>
                    {client.data!.icps.filter((i) => i.isActive).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Offer" hint={!client.data.offers.length ? 'Add one on the client first.' : undefined}>
                {(id) => (
                  <select id={id} className="input" value={offerId} onChange={(e) => setOfferId(e.target.value)}>
                    <option value="">None</option>
                    {client.data!.offers.filter((o) => o.isActive).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Playbook" hint="Sets the steps, claim types and threshold below.">
                {(id) => (
                  <select id={id} className="input" value={playbookId} onChange={(e) => setPlaybookId(e.target.value)}>
                    <option value="">None (default steps)</option>
                    {(playbooks.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.clientId ? '' : ' (template)'}</option>)}
                  </select>
                )}
              </Field>
            </div>
          )}
          <Field label="Tone notes (optional)" hint="Anything the writer should know about voice, e.g. 'plain, no jargon, Canadian spelling'.">
            {(id) => <textarea id={id} rows={2} className="input h-auto py-2" value={toneGuidelines} onChange={(e) => setTone(e.target.value)} />}
          </Field>
        </div>
      </Section>

      <Section title="Sequence" hint="Drafts for each step are written from verified facts only. A reply stops the sequence for that person.">
        <div className="space-y-2">
          {steps.map((s, i) => (
            <div key={i} className="card p-3 grid gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="eyebrow w-14">Step {i + 1}</span>
                <label className="flex items-center gap-1.5 text-micro">
                  {i === 0 ? 'Send after' : 'Wait'}
                  <input type="number" min={0} max={180} className="input h-8 w-16" value={Math.round(s.delayHours / 24)}
                         onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, delayHours: Number(e.target.value) * 24 } : x)))} />
                  days
                </label>
                <input aria-label="Purpose" className="input h-8 flex-1 min-w-[140px]" value={s.purpose}
                       onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, purpose: e.target.value } : x)))} />
                <button type="button" className="btn-ghost size-8 p-0" aria-label="Remove step" disabled={steps.length === 1}
                        onClick={() => setSteps(steps.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></button>
              </div>
              <textarea aria-label="Instructions" rows={2} className="input h-auto py-2 text-micro" value={s.instructions}
                        onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, instructions: e.target.value } : x)))} />
            </div>
          ))}
          {steps.length < 8 && (
            <button type="button" className="btn-outline h-8 text-micro"
                    onClick={() => setSteps([...steps, { order: steps.length, delayHours: 72, purpose: 'Follow-up', instructions: 'A short, useful follow-up.', stopOnReply: true }])}>
              <Plus className="size-3.5" /> Add step
            </button>
          )}
        </div>
      </Section>

      <Section title="Sending">
        <div className="card p-4 space-y-4">
          {mailboxes.data && !mailboxes.data.length ? (
            <NotConfigured what="A sending mailbox">Add one in Settings before this campaign can be activated. You can still create it now.</NotConfigured>
          ) : (
            <Field label="From">
              {(id) => (
                <select id={id} className="input" value={mailboxId} onChange={(e) => setMailboxId(e.target.value)}>
                  {(mailboxes.data ?? []).map((m) => (
                    <option key={m.id} value={m.id}>{m.fromName} &lt;{m.fromEmail}&gt;{!(m.spfVerified && m.dkimVerified) ? ' — domain not verified' : ''}</option>
                  ))}
                </select>
              )}
            </Field>
          )}
          <div className="flex flex-wrap gap-4 items-end">
            <fieldset>
              <legend className="text-[12px] font-medium mb-1.5">Days</legend>
              <div className="flex gap-1">
                {DAYS.map((d, i) => (
                  <button key={d} type="button" aria-pressed={sendDays.includes(i + 1)}
                          onClick={() => setSendDays(sendDays.includes(i + 1) ? sendDays.filter((x) => x !== i + 1) : [...sendDays, i + 1].sort())}
                          className={cn('h-8 w-10 rounded-md text-micro border', sendDays.includes(i + 1) ? 'border-accent bg-accent-soft text-accent' : 'border-hairline text-muted')}>
                    {d}
                  </button>
                ))}
              </div>
            </fieldset>
            <Field label="From hour">{(id) => <input id={id} type="number" min={0} max={23} className="input w-20" value={sendStartHour} onChange={(e) => setStart(Number(e.target.value))} />}</Field>
            <Field label="Until hour">{(id) => <input id={id} type="number" min={1} max={24} className="input w-20" value={sendEndHour} onChange={(e) => setEnd(Number(e.target.value))} />}</Field>
            <Field label="Per day">{(id) => <input id={id} type="number" min={1} max={500} className="input w-24" value={dailyCap} onChange={(e) => setDailyCap(Number(e.target.value))} />}</Field>
            <Field label="People per company">{(id) => <input id={id} type="number" min={1} max={5} className="input w-20" value={maxContacts} onChange={(e) => setMaxContacts(Number(e.target.value))} />}</Field>
          </div>
          <p className="text-[11px] text-muted">Hours are in the client&apos;s time zone ({client.data?.timezone ?? 'choose a client'}).</p>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={callFollowUp} onChange={(e) => setCallFollowUp(e.target.checked)} />
            Put engaged people in the call queue
          </label>
        </div>
      </Section>

      <Section title="Approval policy">
        <div className="card p-4 space-y-4">
          <div className="grid sm:grid-cols-2 gap-2">
            <PolicyOption active={approvalMode === 'REVIEW_ALL'} onClick={() => setApprovalMode('REVIEW_ALL')} title="Review every email"
                          body="Every draft waits in the review queue. Best for a new client or a new playbook." />
            <PolicyOption active={approvalMode === 'AUTO_APPROVE_VERIFIED'} onClick={() => setApprovalMode('AUTO_APPROVE_VERIFIED')} title="Send verified drafts automatically"
                          body="A draft sends without review only if every claim is verified against evidence, every claim type is approved below, and it scores at or above the threshold. Anything else goes to review." />
          </div>
          {approvalMode === 'AUTO_APPROVE_VERIFIED' && (
            <>
              <Field label="Claims that may go out without review">{() => <ChipSelect options={CLAIM_TYPES} value={claimTypes} onChange={setClaimTypes} labels={CLAIM_TYPE_LABELS} />}</Field>
              <Field label="Minimum verification score" hint="0.92 by default. Raise it to send less without review.">
                {(id) => <input id={id} type="number" step={0.01} min={0.5} max={1} className="input w-28" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />}
              </Field>
            </>
          )}
        </div>
      </Section>

      <ErrorNote error={create.error} />
      <div className="flex justify-end gap-2">
        <button type="submit" className="btn-primary" disabled={!clientId || !name.trim() || !steps.length || create.isPending}>
          {create.isPending ? 'Creating…' : 'Create campaign'}
        </button>
      </div>
      <p className="text-[11px] text-muted text-right -mt-6">Created as a draft. Add accounts, then activate.</p>
    </form>
  );
}

function PolicyOption({ active, onClick, title, body }: { active: boolean; onClick: () => void; title: string; body: string }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
            className={cn('text-left rounded-card border p-3 transition-colors', active ? 'border-accent bg-accent-soft/50' : 'border-hairline hover:bg-raised')}>
      <p className="text-[13px] font-medium flex items-center gap-1.5">{active && <ShieldCheck className="size-3.5 text-accent" />}{title}</p>
      <p className="text-[11px] text-muted mt-1">{body}</p>
    </button>
  );
}
