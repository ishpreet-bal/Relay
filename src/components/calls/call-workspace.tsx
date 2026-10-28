'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { format } from 'date-fns';
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, Phone } from 'lucide-react';
import type { CallOutcome, ObjectionType } from '@prisma/client';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/types';
import { CALL_OUTCOMES, OBJECTIONS, OBJECTION_LABELS, OUTCOME_LABELS, SENIORITY_LABELS, personName } from '@/lib/domain';
import { Topbar } from '@/components/shell/topbar';
import { PageBody, Section } from '@/components/ui/page';
import { Pill } from '@/components/ui/pill';
import { ChipSelect, Field } from '@/components/ui/field';
import { ErrorNote, Loading } from '@/components/ui/states';
import { Ago, DateTime } from '@/components/ui/time';
import { CallOutcomePill, SignalPill } from '@/components/domain/pills';
import { cn } from '@/lib/utils';

type Prep = RouterOutputs['calls']['prep'];
interface Fact { statement: string }
interface Angle { angle: string; reasoning: string }

/**
 * Everything a caller needs on one screen: who, why now, what to say, what
 * happened before, and a form to record what happened this time. Logging an
 * outcome updates the queue, the sequence and the account in one step.
 */
export function CallWorkspace({ contactId }: { contactId: string }) {
  const prep = trpc.calls.prep.useQuery({ contactId });
  if (prep.isPending) return <><Topbar title="Call" showClientSwitcher={false} /><Loading label="Preparing the call…" /></>;
  if (prep.error) return <><Topbar title="Call" showClientSwitcher={false} /><PageBody><ErrorNote error={prep.error} /></PageBody></>;
  const p = prep.data;
  const c = p.contact;

  return (
    <>
      <Topbar title={`Call ${personName(c)}`} showClientSwitcher={false} />
      <PageBody width="wide">
        <Link href="/calls" className="inline-flex items-center gap-1 text-micro text-muted hover:text-ink mb-3"><ArrowLeft className="size-3.5" /> Call queue</Link>
        <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
          <div className="space-y-6 min-w-0">
            <Header prep={p} />
            <WhyNow prep={p} />
            <Section title="Opener">
              <p className="card p-4 text-[14px] leading-relaxed">{p.opener}</p>
            </Section>
            <About prep={p} />
            <Guidance prep={p} />
            <History prep={p} />
          </div>
          <aside className="lg:sticky lg:top-4">
            <LogCall prep={p} />
          </aside>
        </div>
      </PageBody>
    </>
  );
}

function Header({ prep: p }: { prep: Prep }) {
  const c = p.contact;
  const numbers = [
    { label: 'Direct', value: c.directPhone }, { label: 'Mobile', value: c.mobilePhone }, { label: 'Phone', value: c.phone }, { label: 'Main line', value: p.account.phone },
  ].filter((n): n is { label: string; value: string } => !!n.value);
  return (
    <header className="card p-5">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold">{personName(c)}</h2>
          <p className="text-micro text-muted">
            {c.title ?? 'No title'}{c.seniority !== 'UNKNOWN' && ` · ${SENIORITY_LABELS[c.seniority]}`}
            {' at '}<Link href={`/accounts/${p.account.id}`} className="hover:text-accent">{p.account.name}</Link>
          </p>
          <p className="text-[11px] text-muted mt-1">
            Calling for {p.client.name}
            {c.timezone && <> · their time {new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: c.timezone }).format(new Date())}</>}
            {c.callAttempts > 0 && <> · {c.callAttempts} previous attempt{c.callAttempts === 1 ? '' : 's'}, last <Ago date={c.lastCalledAt} /></>}
          </p>
          {c.email && <p className="mt-3 text-sm break-all">{c.email}<span className="block text-xs text-muted mt-1">{c.doNotEmail ? 'Do not email' : `Email verification: ${c.emailVerification.toLowerCase().replaceAll('_', ' ')}`}</span></p>}
        </div>
        <ul className="space-y-1 sm:text-right">
          {numbers.length ? numbers.map((n) => (
            <li key={n.label}>
              <a href={`tel:${n.value}`} className="inline-flex items-center gap-1.5 num text-[15px] hover:text-accent"><Phone className="size-3.5" />{n.value}</a>
              <span className="block text-[11px] text-muted">{n.label}</span>
            </li>
          )) : <li className="text-micro text-muted">No phone number on file</li>}
        </ul>
      </div>
      {c.doNotCall && <p className="mt-3 text-[12px] text-blocked font-medium">Marked do-not-call. Don&apos;t dial.</p>}
    </header>
  );
}

function WhyNow({ prep: p }: { prep: Prep }) {
  if (!p.whyNow.length && !p.account.signals.length) return null;
  return (
    <Section title="Why call now">
      <div className="card p-4 space-y-3">
        {p.whyNow.length > 0 && (
          <ul className="space-y-1">
            {p.whyNow.map((r, i) => <li key={i} className="text-[13px] flex items-start gap-1.5"><ArrowRight className="size-3.5 mt-0.5 text-accent shrink-0" />{r.label}</li>)}
          </ul>
        )}
        {p.account.signals.length > 0 && (
          <ul className="space-y-2 border-t border-hairline pt-3">
            {p.account.signals.map((s) => (
              <li key={s.id} className="text-micro">
                <div className="flex items-center gap-2"><SignalPill type={s.type} /><span className="font-medium">{s.title}</span></div>
                <p className="text-[11px] text-muted mt-0.5">
                  {s.evidenceStatus === 'VERIFIED' ? 'Verified' : s.evidenceStatus === 'UNVERIFIED' ? 'Unverified — ask, don\'t assert' : 'From a data provider'}
                  {' · '}<Ago date={s.eventDate ?? s.detectedAt} />
                  {s.sourceUrl && <> · <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent inline-flex items-center gap-0.5">source<ExternalLink className="size-2.5" /></a></>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

function About({ prep: p }: { prep: Prep }) {
  const facts = (p.account.research?.facts ?? []) as unknown as Fact[];
  const angles = ((p.account.research?.relevance as unknown as { angles?: Angle[] } | null)?.angles ?? []);
  return (
    <Section title={`About ${p.account.name}`}>
      <div className="card p-4 space-y-3 text-micro">
        <p className="text-muted">
          {[p.account.industry, [p.account.city, p.account.region].filter(Boolean).join(', '), p.account.employeeCount ? `${p.account.employeeCount} employees` : p.account.employeeRange].filter(Boolean).join(' · ')}
        </p>
        {p.account.research?.companySummary ? <p className="text-[13px]">{p.account.research.companySummary}</p> : <p className="text-muted">Not researched yet.</p>}
        {angles.length > 0 && (
          <div>
            <p className="font-medium mb-1">Why they might care</p>
            <ul className="list-disc pl-4 space-y-0.5">{angles.slice(0, 3).map((a, i) => <li key={i}><span className="text-ink">{a.angle}</span> <span className="text-muted">— {a.reasoning}</span></li>)}</ul>
          </div>
        )}
        {facts.length > 0 && (
          <details>
            <summary className="cursor-pointer font-medium">Verified facts ({facts.length})</summary>
            <ul className="list-disc pl-4 mt-1 space-y-0.5 text-muted">{facts.map((f, i) => <li key={i}>{f.statement}</li>)}</ul>
          </details>
        )}
        {p.account.contacts.length > 0 && (
          <div>
            <p className="font-medium mb-1">Others at the company</p>
            <ul className="space-y-0.5">
              {p.account.contacts.map((o) => (
                <li key={o.id} className={cn(o.doNotCall && 'line-through text-muted')}>
                  <Link href={`/calls/${o.id}`} className="hover:text-accent">{personName(o)}</Link> <span className="text-muted">{o.title}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Section>
  );
}

function Guidance({ prep: p }: { prep: Prep }) {
  return (
    <Section title="What to cover" hint={p.playbook ? `From the ${p.playbook.name} playbook.` : 'No playbook for this client yet.'}>
      <div className="card p-4 space-y-4 text-micro">
        {p.offer && (
          <div>
            <p className="font-medium">The offer: {p.offer.name}</p>
            <p className="text-muted">{p.offer.summary}{p.offer.callToAction && ` Ask for: ${p.offer.callToAction.toLowerCase()}.`}</p>
          </div>
        )}
        {p.proofPoints.length > 0 && (
          <div>
            <p className="font-medium mb-1">Approved proof points</p>
            <ul className="list-disc pl-4 space-y-0.5">{p.proofPoints.map((pp) => <li key={pp.id}>{pp.statement}</li>)}</ul>
          </div>
        )}
        {!!p.playbook?.discoveryQuestions.length && (
          <div>
            <p className="font-medium mb-1">Discovery questions</p>
            <ol className="list-decimal pl-4 space-y-0.5">{p.playbook.discoveryQuestions.map((q, i) => <li key={i}>{q}</li>)}</ol>
          </div>
        )}
        {!!p.playbook?.qualificationCriteria.length && (
          <div>
            <p className="font-medium mb-1">Qualified if…</p>
            <ul className="list-disc pl-4 space-y-0.5">{p.playbook.qualificationCriteria.map((q, i) => <li key={i}>{q}</li>)}</ul>
          </div>
        )}
        {p.objectionHandling.length > 0 && (
          <div>
            <p className="font-medium mb-1">If they say…</p>
            <dl className="space-y-1.5">
              {p.objectionHandling.map((o, i) => (
                <div key={i}>
                  <dt className={cn('font-medium', p.previousObjections.includes(o.objection) && 'text-held')}>
                    {OBJECTION_LABELS[o.objection]}{p.previousObjections.includes(o.objection) && ' (raised before)'}
                  </dt>
                  <dd className="text-muted">{o.response}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {p.talkingPoints.length > 0 && (
          <div>
            <p className="font-medium mb-1">Talking points</p>
            <ul className="list-disc pl-4 space-y-0.5">{p.talkingPoints.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </div>
        )}
      </div>
    </Section>
  );
}

function History({ prep: p }: { prep: Prep }) {
  if (!p.calls.length && !p.messages.length && !p.meetings.length) return null;
  return (
    <Section title="What's happened so far">
      <div className="card divide-y divide-hairline">
        {p.calls.map((call) => (
          <div key={call.id} className="p-3 text-micro">
            <div className="flex items-center gap-2 flex-wrap">
              <CallOutcomePill outcome={call.outcome} />
              <span className="text-muted">{call.contact ? personName(call.contact) : ''} · <Ago date={call.startedAt} />{call.caller && ` · ${call.caller.firstName ?? ''}`}</span>
            </div>
            {call.objections.length > 0 && <p className="text-[11px] text-muted mt-0.5">Objections: {call.objections.map((o) => OBJECTION_LABELS[o]).join(', ')}</p>}
            {call.notes && <p className="mt-1 whitespace-pre-wrap">{call.notes}</p>}
          </div>
        ))}
        {p.messages.map((m) => (
          <div key={m.id} className="p-3 text-micro">
            <p className="text-[11px] text-muted">
              {m.direction === 'INBOUND' ? 'Reply received' : `Email sent${m.campaign ? ` (${m.campaign.name})` : ''}`} · <Ago date={m.sentAt ?? m.createdAt} />
              {m.direction === 'OUTBOUND' && m.openCount > 0 && ' · opened'}{m.clickCount > 0 && ' · clicked'}
            </p>
            {m.subject && <p className="font-medium">{m.subject}</p>}
            <p className="text-muted line-clamp-3 whitespace-pre-wrap">{m.bodyText}</p>
          </div>
        ))}
        {p.meetings.map((m) => (
          <div key={m.id} className="p-3 text-micro"><span className="font-medium">Meeting</span> <DateTime date={m.startsAt} className="text-muted" /> · {m.status.toLowerCase()}</div>
        ))}
      </div>
    </Section>
  );
}

const NEEDS_CONVERSATION: CallOutcome[] = ['CONNECTED', 'NOT_INTERESTED', 'CALL_BACK', 'REFERRED', 'INTERESTED', 'QUALIFIED', 'MEETING_BOOKED'];

function LogCall({ prep: p }: { prep: Prep }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [outcome, setOutcome] = useState<CallOutcome | ''>('');
  const [objections, setObjections] = useState<ObjectionType[]>([]);
  const [notes, setNotes] = useState('');
  const [callbackAt, setCallbackAt] = useState('');
  const [referral, setReferral] = useState({ firstName: '', lastName: '', title: '', email: '', phone: '' });
  const [meeting, setMeeting] = useState({ startsAt: '', durationMinutes: '30', meetingUrl: '', location: '', qualificationNotes: '', estimatedValue: '' });
  const log = trpc.calls.log.useMutation({ onSuccess: () => { utils.calls.queue.invalidate(); utils.calls.recent.invalidate(); } });

  if (log.data) {
    return (
      <div className="card p-5 text-center">
        <CheckCircle2 className="size-8 mx-auto text-cleared mb-2" strokeWidth={1.5} />
        <p className="font-medium mb-1">Logged: {outcome && OUTCOME_LABELS[outcome]}</p>
        <p className="text-micro text-muted mb-4">
          {log.data.meetingId ? 'The meeting is on the calendar and the client can see it in their portal.' : 'The queue and the account have been updated.'}
          {log.data.referredContactId && ' The person they referred you to was added as a contact.'}
        </p>
        <div className="flex flex-col gap-2">
          <button type="button" className="btn-primary" onClick={() => router.push('/calls')}>Back to the queue</button>
          {log.data.referredContactId && <Link href={`/calls/${log.data.referredContactId}`} className="btn-outline">Call the referral</Link>}
        </div>
      </div>
    );
  }

  const talked = outcome && NEEDS_CONVERSATION.includes(outcome);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!outcome) return;
    log.mutate({
      contactId: p.contact.id,
      outcome,
      objections: talked ? objections : [],
      notes: notes || null,
      callbackAt: outcome === 'CALL_BACK' && callbackAt ? new Date(callbackAt) : null,
      referredTo: outcome === 'REFERRED' || outcome === 'WRONG_PERSON'
        ? (referral.firstName || referral.lastName || referral.email || referral.phone ? { ...referral, email: referral.email || null } : null)
        : null,
      meeting: outcome === 'MEETING_BOOKED' && meeting.startsAt ? {
        startsAt: new Date(meeting.startsAt),
        durationMinutes: Number(meeting.durationMinutes) || 30,
        meetingUrl: meeting.meetingUrl || null,
        location: meeting.location || null,
        qualificationNotes: meeting.qualificationNotes || null,
        estimatedValueCents: meeting.estimatedValue ? Math.round(Number(meeting.estimatedValue) * 100) : null,
      } : null,
    });
  };

  return (
    <form onSubmit={submit} className="card p-4 space-y-4">
      <h2 className="text-[14px] font-semibold">Log this call</h2>
      <fieldset>
        <legend className="text-[12px] font-medium mb-1.5">What happened?</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {CALL_OUTCOMES.map((o) => (
            <button key={o} type="button" aria-pressed={outcome === o} onClick={() => setOutcome(o)}
                    className={cn('h-8 px-2 rounded-md text-[12px] border text-left transition-colors',
                      outcome === o ? 'border-accent bg-accent-soft text-accent font-medium' : 'border-hairline hover:bg-raised',
                      o === 'DO_NOT_CALL' && outcome !== o && 'text-blocked')}>
              {OUTCOME_LABELS[o]}
            </button>
          ))}
        </div>
      </fieldset>

      {outcome === 'DO_NOT_CALL' && (
        <p className="text-[12px] text-blocked">They&apos;ll be added to the do-not-call list for {p.client.name} and removed from every queue. This can&apos;t be undone from the app.</p>
      )}

      {outcome === 'CALL_BACK' && (
        <Field label="Call back at" hint={`Your local time. They're in ${p.contact.timezone ?? p.client.timezone}.`}>
          {(id) => <input id={id} type="datetime-local" required className="input" value={callbackAt} onChange={(e) => setCallbackAt(e.target.value)} min={format(new Date(), "yyyy-MM-dd'T'HH:mm")} />}
        </Field>
      )}

      {(outcome === 'REFERRED' || outcome === 'WRONG_PERSON') && (
        <fieldset className="space-y-2">
          <legend className="text-[12px] font-medium mb-1">Who should you talk to? <span className="text-muted font-normal">(optional)</span></legend>
          <div className="grid grid-cols-2 gap-2">
            <input aria-label="First name" placeholder="First name" className="input" value={referral.firstName} onChange={(e) => setReferral({ ...referral, firstName: e.target.value })} />
            <input aria-label="Last name" placeholder="Last name" className="input" value={referral.lastName} onChange={(e) => setReferral({ ...referral, lastName: e.target.value })} />
          </div>
          <input aria-label="Title" placeholder="Title" className="input" value={referral.title} onChange={(e) => setReferral({ ...referral, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input aria-label="Email" type="email" placeholder="Email" className="input" value={referral.email} onChange={(e) => setReferral({ ...referral, email: e.target.value })} />
            <input aria-label="Phone" placeholder="Phone" className="input" value={referral.phone} onChange={(e) => setReferral({ ...referral, phone: e.target.value })} />
          </div>
        </fieldset>
      )}

      {outcome === 'MEETING_BOOKED' && (
        <fieldset className="space-y-2">
          <legend className="text-[12px] font-medium mb-1">The meeting</legend>
          <div className="grid grid-cols-[1fr_90px] gap-2">
            <Field label="When">{(id) => <input id={id} type="datetime-local" required className="input" value={meeting.startsAt} onChange={(e) => setMeeting({ ...meeting, startsAt: e.target.value })} />}</Field>
            <Field label="Minutes">{(id) => <input id={id} type="number" min={5} max={480} className="input" value={meeting.durationMinutes} onChange={(e) => setMeeting({ ...meeting, durationMinutes: e.target.value })} />}</Field>
          </div>
          <input aria-label="Meeting link" type="url" placeholder="Meeting link (optional)" className="input" value={meeting.meetingUrl} onChange={(e) => setMeeting({ ...meeting, meetingUrl: e.target.value })} />
          <input aria-label="Location" placeholder="Or location / phone" className="input" value={meeting.location} onChange={(e) => setMeeting({ ...meeting, location: e.target.value })} />
          <Field label="What the client should know" hint="Shown to the client in their portal.">
            {(id) => <textarea id={id} rows={3} className="input h-auto py-2" value={meeting.qualificationNotes} onChange={(e) => setMeeting({ ...meeting, qualificationNotes: e.target.value })} placeholder="Ships 4–5 loads a week to Ohio; current carrier missing pickups." />}
          </Field>
          <Field label="Estimated value (optional)">{(id) => <input id={id} type="number" min={0} className="input" value={meeting.estimatedValue} onChange={(e) => setMeeting({ ...meeting, estimatedValue: e.target.value })} />}</Field>
          <p className="text-[11px] text-muted">No calendar is connected, so send the invite from your own calendar too.</p>
        </fieldset>
      )}

      {talked && (
        <Field label="Objections raised">{() => <ChipSelect options={OBJECTIONS} value={objections} onChange={setObjections} labels={OBJECTION_LABELS} />}</Field>
      )}

      <Field label="Notes">{(id) => <textarea id={id} rows={4} className="input h-auto py-2" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What did you learn?" />}</Field>

      <ErrorNote error={log.error} />
      <button type="submit" className="btn-primary w-full" disabled={!outcome || log.isPending}>{log.isPending ? 'Saving…' : 'Save outcome'}</button>
      {p.callTask && <p className="text-[11px] text-muted"><Pill>{p.callTask.status.toLowerCase()}</Pill> in the queue</p>}
    </form>
  );
}
