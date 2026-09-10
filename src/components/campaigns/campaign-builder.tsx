'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, AlertTriangle, GripVertical } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

interface Step { order: number; delayHours: number; purpose: string; instructions: string; stopOnReply: boolean }

const DAYS = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' }, { value: 7, label: 'Sun' },
];

const DELAY_PRESETS = [
  { label: 'Immediately', hours: 0 },
  { label: '3 days', hours: 72 },
  { label: '7 days', hours: 168 },
  { label: '14 days', hours: 336 },
  { label: '30 days', hours: 720 },
  { label: '45 days', hours: 1080 },
];

export function CampaignBuilder() {
  const router = useRouter();
  const mailboxes = trpc.campaigns.mailboxes.useQuery();
  const defaults = trpc.campaigns.defaultSteps.useQuery();

  const [name, setName] = useState('');
  const [offerBrief, setOfferBrief] = useState('');
  const [toneGuidelines, setToneGuidelines] = useState('');
  const [banned, setBanned] = useState('');
  const [mailboxId, setMailboxId] = useState('');
  const [sendDays, setSendDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startHour, setStartHour] = useState(8);
  const [endHour, setEndHour] = useState(16);
  const [dailyCap, setDailyCap] = useState(30);
  const [allowContextual, setAllowContextual] = useState(true);
  const [contextualDailyCap, setContextualDailyCap] = useState(10);
  const [steps, setSteps] = useState<Step[] | null>(null);

  const create = trpc.campaigns.create.useMutation({
    onSuccess: (campaign) => router.push(`/campaigns/${campaign.id}`),
  });

  const activeSteps = steps ?? (defaults.data as Step[] | undefined) ?? [];
  const selectedMailbox = mailboxes.data?.find((m) => m.id === mailboxId);
  const domainUnverified = selectedMailbox && (!selectedMailbox.spfVerified || !selectedMailbox.dkimVerified);

  const updateStep = (i: number, patch: Partial<Step>) => {
    const next = [...activeSteps];
    next[i] = { ...next[i]!, ...patch };
    setSteps(next);
  };

  const valid = name.trim() && offerBrief.trim() && activeSteps.length > 0 && sendDays.length > 0 && endHour > startHour;

  return (
    <div className="space-y-6">
      <Section title="Basics">
        <Field label="Campaign name" hint="Only you see this.">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)}
                 placeholder="Ontario dental clinics — Q3" />
        </Field>
        <Field
          label="What you're offering"
          hint="Written for the model, not the prospect. Be concrete about what you build and for whom."
        >
          <textarea className="input h-auto py-2 resize-y" rows={3} value={offerBrief}
                    onChange={(e) => setOfferBrief(e.target.value)}
                    placeholder="We build automations for small clinics — recall reminders, insurance verification, and intake forms that write straight into their practice software. Typical project is 2-4 weeks." />
        </Field>
        <Field label="Tone notes" hint="Optional. How you want to sound.">
          <input className="input" value={toneGuidelines} onChange={(e) => setToneGuidelines(e.target.value)}
                 placeholder="Direct, no jargon, sounds like a local firm not a software vendor" />
        </Field>
        <Field label="Never use these phrases" hint="Comma separated. Anything here becomes a hard blocker in review.">
          <input className="input" value={banned} onChange={(e) => setBanned(e.target.value)}
                 placeholder="game changer, revolutionize, synergy" />
        </Field>
      </Section>

      <Section title="Sending identity">
        {mailboxes.data?.length === 0 ? (
          <p className="text-micro text-held">
            No sending mailbox configured yet. Add one in Settings before this campaign can be activated.
          </p>
        ) : (
          <>
            <select className="input" value={mailboxId} onChange={(e) => setMailboxId(e.target.value)}
                    aria-label="Sending mailbox">
              <option value="">Choose a mailbox</option>
              {mailboxes.data?.map((m) => (
                <option key={m.id} value={m.id}>{m.fromName} — {m.fromEmail}</option>
              ))}
            </select>
            {domainUnverified && (
              <p className="flex items-start gap-1.5 text-[11px] text-held mt-2">
                <AlertTriangle className="size-3 mt-0.5 shrink-0" />
                SPF or DKIM isn&apos;t verified for this address. You can save the campaign, but it
                can&apos;t be activated until they are — sending before then damages deliverability
                for every future email from this domain.
              </p>
            )}
          </>
        )}
      </Section>

      <Section title="Sequence" hint="Each step generates a draft into your review queue. Nothing sends without your approval.">
        <ol className="space-y-3">
          {activeSteps.map((step, i) => (
            <li key={i} className="card p-3">
              <div className="flex items-center gap-2 mb-2">
                <GripVertical className="size-3.5 text-muted" />
                <span className="num text-[11px] text-muted">step {i + 1}</span>
                <input
                  className="input h-7 w-36 text-micro" value={step.purpose}
                  onChange={(e) => updateStep(i, { purpose: e.target.value })}
                  aria-label={`Step ${i + 1} purpose`}
                />
                {i > 0 && (
                  <select className="input h-7 w-32 text-micro" value={step.delayHours}
                          onChange={(e) => updateStep(i, { delayHours: Number(e.target.value) })}
                          aria-label={`Step ${i + 1} delay`}>
                    {DELAY_PRESETS.filter((d) => d.hours > 0).map((d) => (
                      <option key={d.hours} value={d.hours}>{d.label} later</option>
                    ))}
                  </select>
                )}
                <div className="flex-1" />
                {activeSteps.length > 1 && (
                  <button type="button" className="btn-ghost size-7 p-0" aria-label={`Remove step ${i + 1}`}
                          onClick={() => setSteps(activeSteps.filter((_, j) => j !== i).map((s, j) => ({ ...s, order: j })))}>
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
              <textarea
                className="input h-auto py-2 resize-y text-micro" rows={2} value={step.instructions}
                onChange={(e) => updateStep(i, { instructions: e.target.value })}
                aria-label={`Step ${i + 1} instructions`}
              />
              <label className="flex items-center gap-2 text-[11px] text-muted mt-2 cursor-pointer">
                <input type="checkbox" checked={step.stopOnReply} className="accent-accent"
                       onChange={(e) => updateStep(i, { stopOnReply: e.target.checked })} />
                Stop the sequence if they reply
              </label>
            </li>
          ))}
        </ol>

        {activeSteps.length < 6 && (
          <button type="button" className="btn-outline h-8 text-micro mt-3"
                  onClick={() => setSteps([...activeSteps, {
                    order: activeSteps.length, delayHours: 720, purpose: 'follow-up',
                    instructions: 'Add one new, concrete idea that was not in the previous email. Keep it shorter.',
                    stopOnReply: true,
                  }])}>
            <Plus className="size-3.5" /> Add step
          </button>
        )}
      </Section>

      <Section title="When it sends" hint="Drafts are only generated inside this window.">
        <div className="flex flex-wrap gap-1.5 mb-3">
          {DAYS.map((d) => {
            const on = sendDays.includes(d.value);
            return (
              <button key={d.value} type="button" aria-pressed={on}
                      onClick={() => setSendDays(on ? sendDays.filter((x) => x !== d.value) : [...sendDays, d.value].sort())}
                      className={cn('h-7 px-2.5 rounded-full text-micro border transition-colors',
                        on ? 'border-accent bg-accent-soft text-accent' : 'border-hairline text-muted hover:bg-raised')}>
                {d.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-end gap-3">
          <Field label="From">
            <input type="number" min={0} max={23} className="input num w-20" value={startHour}
                   onChange={(e) => setStartHour(Number(e.target.value))} />
          </Field>
          <Field label="Until">
            <input type="number" min={1} max={24} className="input num w-20" value={endHour}
                   onChange={(e) => setEndHour(Number(e.target.value))} />
          </Field>
          <Field label="Daily cap" hint="Across the whole campaign.">
            <input type="number" min={1} max={500} className="input num w-24" value={dailyCap}
                   onChange={(e) => setDailyCap(Number(e.target.value))} />
          </Field>
        </div>
        {endHour <= startHour && (
          <p className="text-[11px] text-blocked mt-2">The end hour has to be after the start hour.</p>
        )}
      </Section>

      <Section title="When research comes up empty">
        <label className="flex items-start gap-2 text-micro cursor-pointer">
          <input type="checkbox" checked={allowContextual} className="accent-accent mt-0.5"
                 onChange={(e) => setAllowContextual(e.target.checked)} />
          <span>
            Send industry-only emails to leads whose website couldn&apos;t be read.
            <span className="block text-[11px] text-muted mt-0.5">
              These reference the industry and city but make no claims about the business itself.
              They&apos;re labelled separately in review so you can approve or skip them as a batch.
            </span>
          </span>
        </label>
        {allowContextual && (
          <div className="mt-3">
            <Field label="Industry-only daily cap" hint="Separate ceiling, inside the overall cap.">
              <input type="number" min={0} max={200} className="input num w-24" value={contextualDailyCap}
                     onChange={(e) => setContextualDailyCap(Number(e.target.value))} />
            </Field>
          </div>
        )}
      </Section>

      <div className="flex items-center gap-2 pb-8">
        <button type="button" className="btn-primary" disabled={!valid || create.isPending}
                onClick={() => create.mutate({
                  name: name.trim(),
                  offerBrief: offerBrief.trim(),
                  toneGuidelines: toneGuidelines.trim() || undefined,
                  bannedPhrases: banned.split(',').map((s) => s.trim()).filter(Boolean),
                  mailboxId: mailboxId || undefined,
                  sendDays, sendStartHour: startHour, sendEndHour: endHour,
                  dailyCap, allowContextual, contextualDailyCap,
                  steps: activeSteps.map((s, i) => ({ ...s, order: i })),
                })}>
          {create.isPending ? 'Creating…' : 'Create campaign'}
        </button>
        <p className="text-[11px] text-muted">It starts paused. You activate it when you&apos;re ready.</p>
      </div>

      {create.error && <p className="text-micro text-blocked">{create.error.message}</p>}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="eyebrow mb-1">{title}</h2>
      {hint && <p className="text-[11px] text-muted mb-3">{hint}</p>}
      <div className={cn('space-y-3', !hint && 'mt-3')}>{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="eyebrow block mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}
    </div>
  );
}
