'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import type { ClaimType, ObjectionType, SignalType } from '@prisma/client';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/types';
import { CLAIM_TYPES, CLAIM_TYPE_LABELS, OBJECTIONS, OBJECTION_LABELS, SIGNAL_LABELS, SIGNAL_TYPES } from '@/lib/domain';
import { Topbar } from '@/components/shell/topbar';
import { PageBody, Section } from '@/components/ui/page';
import { Pill } from '@/components/ui/pill';
import { ChipSelect, Field, ListInput } from '@/components/ui/field';
import { ErrorNote, Loading } from '@/components/ui/states';

type Playbook = RouterOutputs['playbooks']['byId'];
interface Angle { key?: string; name: string; description: string }
interface Step { delayDays: number; purpose: string; instructions: string }
interface Objection { objection: ObjectionType; response: string }

function valuesFrom(p: Playbook) {
  return {
    name: p.name,
    description: p.description ?? '',
    industryFocus: p.industryFocus ?? '',
    targetAccountTypes: p.targetAccountTypes,
    targetTitles: p.targetTitles,
    targetDepartments: p.targetDepartments,
    usefulSignals: p.usefulSignals as SignalType[],
    signalKeywords: p.signalKeywords,
    approvedClaimTypes: p.approvedClaimTypes as ClaimType[],
    messagingAngles: (Array.isArray(p.messagingAngles) ? p.messagingAngles : []) as unknown as Angle[],
    sequenceTemplate: (Array.isArray(p.sequenceTemplate) ? p.sequenceTemplate : []) as unknown as Step[],
    callOpener: p.callOpener ?? '',
    discoveryQuestions: p.discoveryQuestions,
    objectionHandling: (Array.isArray(p.objectionHandling) ? p.objectionHandling : []) as unknown as Objection[],
    qualificationCriteria: p.qualificationCriteria,
    autoApproveThreshold: p.autoApproveThreshold,
  };
}

export function PlaybookEditor({ id, canWrite }: { id: string; canWrite: boolean }) {
  const playbook = trpc.playbooks.byId.useQuery({ id });
  if (playbook.isPending) return <><Topbar title="Playbook" showClientSwitcher={false} /><Loading /></>;
  if (playbook.error) return <><Topbar title="Playbook" showClientSwitcher={false} /><PageBody><ErrorNote error={playbook.error} /></PageBody></>;
  return <Editor key={playbook.data.updatedAt.toString()} playbook={playbook.data} canWrite={canWrite} />;
}

function Editor({ playbook, canWrite }: { playbook: Playbook; canWrite: boolean }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [v, setV] = useState(() => valuesFrom(playbook));
  const [saved, setSaved] = useState(false);
  const update = trpc.playbooks.update.useMutation({ onSuccess: () => { setSaved(true); utils.playbooks.invalidate(); } });
  const archive = trpc.playbooks.archive.useMutation({ onSuccess: () => router.push('/playbooks') });
  const set = <K extends keyof typeof v>(k: K) => (value: (typeof v)[K]) => { setSaved(false); setV((s) => ({ ...s, [k]: value })); };

  const save = () => update.mutate({
    id: playbook.id,
    data: {
      ...v,
      description: v.description || null,
      industryFocus: v.industryFocus || null,
      callOpener: v.callOpener || null,
      messagingAngles: v.messagingAngles.filter((a) => a.name.trim()),
      sequenceTemplate: v.sequenceTemplate.filter((s) => s.purpose.trim() && s.instructions.trim()),
      objectionHandling: v.objectionHandling.filter((o) => o.response.trim()),
    },
  });

  return (
    <>
      <Topbar title={playbook.name} showClientSwitcher={false}
              actions={canWrite && (
                <div className="flex items-center gap-2">
                  {saved && <span className="text-[12px] text-cleared">Saved</span>}
                  <button type="button" className="btn-primary h-8 text-micro" disabled={update.isPending} onClick={save}>{update.isPending ? 'Saving…' : 'Save'}</button>
                </div>
              )} />
      <PageBody width="narrow">
        <Link href="/playbooks" className="inline-flex items-center gap-1 text-micro text-muted hover:text-ink mb-3"><ArrowLeft className="size-3.5" /> Playbooks</Link>
        <div className="flex items-center gap-2 mb-6">
          {playbook.isTemplate ? <Pill>template</Pill> : <Pill tone="accent">client playbook</Pill>}
          {playbook.isTemplate && <p className="text-micro text-muted">Edits change the template for future copies, not existing client playbooks.</p>}
        </div>
        <ErrorNote error={update.error} className="mb-4" />

        <fieldset disabled={!canWrite} className="space-y-8">
          <Section title="Overview">
            <div className="space-y-3">
              <Field label="Name">{(id) => <input id={id} className="input" value={v.name} onChange={(e) => set('name')(e.target.value)} />}</Field>
              <Field label="Description">{(id) => <textarea id={id} rows={2} className="input h-auto py-2" value={v.description} onChange={(e) => set('description')(e.target.value)} />}</Field>
              <Field label="Industry focus">{(id) => <input id={id} className="input" value={v.industryFocus} onChange={(e) => set('industryFocus')(e.target.value)} />}</Field>
            </div>
          </Section>

          <Section title="Who to target">
            <div className="space-y-3">
              <Field label="Account types">{(id) => <ListInput id={id} value={v.targetAccountTypes} onChange={set('targetAccountTypes')} />}</Field>
              <Field label="Titles">{(id) => <ListInput id={id} value={v.targetTitles} onChange={set('targetTitles')} />}</Field>
              <Field label="Departments">{(id) => <ListInput id={id} value={v.targetDepartments} onChange={set('targetDepartments')} />}</Field>
            </div>
          </Section>

          <Section title="Signals that make now a good time">
            <div className="space-y-3">
              <ChipSelect options={SIGNAL_TYPES} value={v.usefulSignals} onChange={set('usefulSignals')} labels={SIGNAL_LABELS} />
              <Field label="Signal keywords">{(id) => <ListInput id={id} value={v.signalKeywords} onChange={set('signalKeywords')} />}</Field>
            </div>
          </Section>

          <Section title="Messaging angles" hint="The reasons a prospect might care. Drafts choose one per email, and analytics compare them.">
            <div className="space-y-2">
              {v.messagingAngles.map((a, i) => (
                <div key={i} className="card p-3 grid gap-2">
                  <div className="flex gap-2">
                    <input aria-label="Angle name" className="input" value={a.name} placeholder="Reliability on cross-border lanes"
                           onChange={(e) => set('messagingAngles')(v.messagingAngles.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    <button type="button" className="btn-ghost size-9 p-0" aria-label="Remove angle" onClick={() => set('messagingAngles')(v.messagingAngles.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></button>
                  </div>
                  <textarea aria-label="Angle description" rows={2} className="input h-auto py-2" value={a.description}
                            onChange={(e) => set('messagingAngles')(v.messagingAngles.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                </div>
              ))}
              {v.messagingAngles.length < 10 && (
                <button type="button" className="btn-outline h-8 text-micro" onClick={() => set('messagingAngles')([...v.messagingAngles, { name: '', description: '' }])}><Plus className="size-3.5" /> Add angle</button>
              )}
            </div>
          </Section>

          <Section title="Email sequence" hint="New campaigns using this playbook start with these steps.">
            <div className="space-y-2">
              {v.sequenceTemplate.map((s, i) => (
                <div key={i} className="card p-3 grid gap-2">
                  <div className="flex gap-2 items-center">
                    <span className="eyebrow w-14">Step {i + 1}</span>
                    <label className="flex items-center gap-1.5 text-micro">Day
                      <input type="number" min={0} max={90} className="input h-8 w-16" value={s.delayDays}
                             onChange={(e) => set('sequenceTemplate')(v.sequenceTemplate.map((x, j) => (j === i ? { ...x, delayDays: Number(e.target.value) } : x)))} />
                    </label>
                    <input aria-label="Purpose" className="input h-8 flex-1" value={s.purpose} placeholder="Introduction"
                           onChange={(e) => set('sequenceTemplate')(v.sequenceTemplate.map((x, j) => (j === i ? { ...x, purpose: e.target.value } : x)))} />
                    <button type="button" className="btn-ghost size-8 p-0" aria-label="Remove step" onClick={() => set('sequenceTemplate')(v.sequenceTemplate.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></button>
                  </div>
                  <textarea aria-label="Instructions for the writer" rows={2} className="input h-auto py-2" value={s.instructions}
                            onChange={(e) => set('sequenceTemplate')(v.sequenceTemplate.map((x, j) => (j === i ? { ...x, instructions: e.target.value } : x)))} />
                </div>
              ))}
              {v.sequenceTemplate.length < 8 && (
                <button type="button" className="btn-outline h-8 text-micro"
                        onClick={() => set('sequenceTemplate')([...v.sequenceTemplate, { delayDays: (v.sequenceTemplate.at(-1)?.delayDays ?? -3) + 3, purpose: '', instructions: '' }])}>
                  <Plus className="size-3.5" /> Add step
                </button>
              )}
            </div>
          </Section>

          <Section title="Automatic sending" hint="Factual claims of these types may go out without review when every claim is verified and the draft scores at or above the threshold. Everything else waits for a person.">
            <div className="space-y-3">
              <ChipSelect options={CLAIM_TYPES} value={v.approvedClaimTypes} onChange={set('approvedClaimTypes')} labels={CLAIM_TYPE_LABELS} />
              <Field label="Verification threshold" hint="0.92 is a sensible default. Higher sends less without review.">
                {(id) => <input id={id} type="number" step={0.01} min={0.5} max={1} className="input w-28" value={v.autoApproveThreshold} onChange={(e) => set('autoApproveThreshold')(Number(e.target.value))} />}
              </Field>
            </div>
          </Section>

          <Section title="Calls">
            <div className="space-y-3">
              <Field label="Opener">{(id) => <textarea id={id} rows={3} className="input h-auto py-2" value={v.callOpener} onChange={(e) => set('callOpener')(e.target.value)} />}</Field>
              <Field label="Discovery questions">{(id) => <ListInput id={id} value={v.discoveryQuestions} onChange={set('discoveryQuestions')} max={15} />}</Field>
              <Field label="A qualified opportunity has…">{(id) => <ListInput id={id} value={v.qualificationCriteria} onChange={set('qualificationCriteria')} max={10} />}</Field>
              <div>
                <p className="text-[12px] font-medium mb-1.5">Objection handling</p>
                <div className="space-y-2">
                  {v.objectionHandling.map((o, i) => (
                    <div key={i} className="card p-3 grid gap-2">
                      <div className="flex gap-2">
                        <select aria-label="Objection" className="input h-8" value={o.objection}
                                onChange={(e) => set('objectionHandling')(v.objectionHandling.map((x, j) => (j === i ? { ...x, objection: e.target.value as ObjectionType } : x)))}>
                          {OBJECTIONS.map((ob) => <option key={ob} value={ob}>{OBJECTION_LABELS[ob]}</option>)}
                        </select>
                        <button type="button" className="btn-ghost size-8 p-0" aria-label="Remove" onClick={() => set('objectionHandling')(v.objectionHandling.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></button>
                      </div>
                      <textarea aria-label="Response" rows={2} className="input h-auto py-2" value={o.response}
                                onChange={(e) => set('objectionHandling')(v.objectionHandling.map((x, j) => (j === i ? { ...x, response: e.target.value } : x)))} />
                    </div>
                  ))}
                  {v.objectionHandling.length < 15 && (
                    <button type="button" className="btn-outline h-8 text-micro" onClick={() => set('objectionHandling')([...v.objectionHandling, { objection: 'TOO_EXPENSIVE', response: '' }])}><Plus className="size-3.5" /> Add objection</button>
                  )}
                </div>
              </div>
            </div>
          </Section>
        </fieldset>

        {canWrite && (
          <div className="mt-10 pt-4 border-t border-hairline">
            <button type="button" className="btn-ghost text-blocked h-8 text-micro" disabled={archive.isPending}
                    onClick={() => { if (confirm('Archive this playbook? Campaigns using it keep their steps.')) archive.mutate({ id: playbook.id }); }}>
              Archive playbook
            </button>
          </div>
        )}
      </PageBody>
    </>
  );
}
