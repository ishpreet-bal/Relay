'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, ExternalLink, PhoneCall, ShieldBan, Sparkles } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { QUEUE_CATEGORY_LABELS, SENIORITY_LABELS, personName } from '@/lib/domain';
import { Topbar } from '@/components/shell/topbar';
import { PageBody, Section } from '@/components/ui/page';
import { Pill } from '@/components/ui/pill';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { ErrorNote, Loading } from '@/components/ui/states';
import { Ago } from '@/components/ui/time';
import { ScoreBadge, ScoreParts, parseBreakdown } from '@/components/scoring/score';
import { AccountStatusPill, VerificationBadge } from '@/components/domain/pills';
import { Timeline } from './timeline';
import { ContactFormDialog } from './contact-form-dialog';

export interface ContactPermissions { write: boolean; call: boolean; draft: boolean; suppress: boolean }

const FIELD_LABELS: Record<string, string> = {
  email: 'Email', phone: 'Phone', directPhone: 'Direct line', mobilePhone: 'Mobile', title: 'Title', linkedinUrl: 'LinkedIn',
  firstName: 'First name', lastName: 'Last name', city: 'City', region: 'Region', country: 'Country', seniority: 'Seniority',
  department: 'Department',
};

export function ContactDetail({ id, can }: { id: string; can: ContactPermissions }) {
  const router = useRouter();
  const contact = trpc.contacts.byId.useQuery({ id });
  const provenance = trpc.contacts.provenance.useQuery({ id });
  const messages = trpc.accounts.messages.useQuery({ contactId: id });
  const capabilities = trpc.session.capabilities.useQuery();
  const [dialog, setDialog] = useState<'edit' | 'suppress' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const queue = trpc.calls.addToQueue.useMutation({ onSuccess: () => { setNotice('Added to the call queue.'); contact.refetch(); }, onError: (e) => setNotice(e.message) });
  const draft = trpc.messages.draft.useMutation({ onSuccess: () => router.push('/review'), onError: (e) => setNotice(e.message) });
  const archive = trpc.contacts.archive.useMutation({ onSuccess: () => router.push(contact.data ? `/accounts/${contact.data.account.id}` : '/contacts') });

  if (contact.isPending) return <><Topbar title="Contact" showClientSwitcher={false} /><Loading /></>;
  if (contact.error) return <><Topbar title="Contact" showClientSwitcher={false} /><PageBody><ErrorNote error={contact.error} /></PageBody></>;
  const c = contact.data;
  const breakdown = parseBreakdown(c.scoreBreakdown);
  const phone = c.directPhone ?? c.mobilePhone ?? c.phone;

  return (
    <>
      <Topbar title={personName(c)} showClientSwitcher={false} />
      <PageBody width="wide">
        <Link href={`/accounts/${c.account.id}`} className="inline-flex items-center gap-1 text-micro text-muted hover:text-ink mb-3">
          <ArrowLeft className="size-3.5" /> {c.account.name}
        </Link>
        <header className="flex flex-col md:flex-row md:items-start gap-4 mb-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h2 className="text-xl font-semibold">{personName(c)}</h2>
              {c.isDecisionMaker && <Pill tone="accent">decision maker</Pill>}
              {c.doNotEmail && <Pill tone="negative">do not email</Pill>}
              {c.doNotCall && <Pill tone="negative">do not call</Pill>}
              {c.status !== 'ACTIVE' && <Pill tone="warning">{c.status.toLowerCase().replace(/_/g, ' ')}</Pill>}
            </div>
            <p className="text-micro text-muted">
              {c.title ?? 'No title'}{c.seniority !== 'UNKNOWN' && ` · ${SENIORITY_LABELS[c.seniority]}`}{c.department && ` · ${c.department}`}
              {' at '}<Link href={`/accounts/${c.account.id}`} className="hover:text-accent">{c.account.name}</Link> · {c.client.name}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {can.call && phone && !c.doNotCall && <Link href={`/calls/${c.id}`} className="btn-primary h-8 text-micro"><PhoneCall className="size-3.5" /> Call prep</Link>}
            {can.call && phone && !c.doNotCall && !c.callTask?.status.match(/OPEN|SNOOZED/) && (
              <button type="button" className="btn-outline h-8 text-micro" disabled={queue.isPending} onClick={() => queue.mutate({ contactId: c.id })}>Queue call</button>
            )}
            {can.draft && capabilities.data?.ai && c.email && !c.doNotEmail && (
              <button type="button" className="btn-outline h-8 text-micro" disabled={draft.isPending} onClick={() => draft.mutate({ contactId: c.id })}>
                <Sparkles className="size-3.5" /> {draft.isPending ? 'Drafting…' : 'Draft email'}
              </button>
            )}
            {can.write && <button type="button" className="btn-ghost h-8 text-micro" onClick={() => setDialog('edit')}>Edit</button>}
            {can.suppress && <button type="button" className="btn-ghost h-8 text-micro" onClick={() => setDialog('suppress')}><ShieldBan className="size-3.5" /> Do not contact</button>}
            {can.write && (
              <button type="button" className="btn-ghost h-8 text-micro text-blocked" disabled={archive.isPending}
                      onClick={() => { if (confirm('Remove this contact? Their history is kept.')) archive.mutate({ id: c.id }); }}>Remove</button>
            )}
          </div>
        </header>
        {notice && <p className="text-[12px] text-muted -mt-3 mb-4">{notice}</p>}

        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
          <div className="space-y-6 min-w-0">
            <Section title="Contact score" hint={breakdown?.summary}>
              <div className="card p-4 grid sm:grid-cols-[auto_1fr] gap-5 items-start">
                <ScoreBadge score={c.score} breakdown={c.scoreBreakdown} size="lg" />
                {breakdown ? <ScoreParts breakdown={breakdown} /> : <p className="text-micro text-muted">Not scored yet.</p>}
              </div>
            </Section>

            <Section title="Emails">
              {messages.isPending ? <Loading /> : !messages.data?.length ? <p className="text-micro text-muted">No emails yet.</p> : (
                <ul className="space-y-2">
                  {messages.data.map((m) => (
                    <li key={m.id} className="card p-3">
                      <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted mb-1">
                        <span className="font-medium text-ink">{m.direction === 'INBOUND' ? 'Reply' : m.campaign?.name ?? 'One-off email'}</span>
                        <span>· {m.status.toLowerCase().replace(/_/g, ' ')}</span>
                        {m.direction === 'OUTBOUND' && <VerificationBadge status={m.verificationStatus} score={m.verificationScore} />}
                        <span className="ml-auto"><Ago date={m.sentAt ?? m.createdAt} /></span>
                      </div>
                      {m.subject && <p className="text-[13px] font-medium">{m.subject}</p>}
                      <p className="text-micro text-muted whitespace-pre-wrap line-clamp-5">{m.bodyText}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Activity">
              <Timeline accountId={c.account.id} contactId={c.id} canWrite={can.write} />
            </Section>
          </div>

          <aside className="space-y-6">
            <Section title="Reach">
              <dl className="card p-3 grid grid-cols-[90px_1fr] gap-y-1.5 text-micro">
                <dt className="text-muted">Email</dt>
                <dd className="truncate">{c.email ? <>{c.email} <span className="text-muted">({c.emailVerification.toLowerCase().replace('_', ' ')})</span></> : '—'}</dd>
                <dt className="text-muted">Direct</dt><dd className="num">{c.directPhone ?? '—'}</dd>
                <dt className="text-muted">Mobile</dt><dd className="num">{c.mobilePhone ?? '—'}</dd>
                <dt className="text-muted">Other</dt><dd className="num">{c.phone ?? '—'}</dd>
                <dt className="text-muted">Phone status</dt><dd>{c.phoneStatus.toLowerCase().replace(/_/g, ' ')}</dd>
                <dt className="text-muted">LinkedIn</dt>
                <dd>{c.linkedinUrl ? <a href={c.linkedinUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent inline-flex items-center gap-0.5">profile <ExternalLink className="size-3" /></a> : '—'}</dd>
                <dt className="text-muted">Calls</dt><dd className="num">{c.callAttempts} · last <Ago date={c.lastCalledAt} /></dd>
                <dt className="text-muted">Consent</dt><dd>{c.consentBasis.toLowerCase().replace(/_/g, ' ')}</dd>
                {c.suppressReason && <><dt className="text-muted">Suppressed</dt><dd className="text-blocked">{c.suppressReason}</dd></>}
              </dl>
            </Section>

            {c.callTask && (
              <Section title="Call queue">
                <div className="card p-3 text-micro">
                  <p><span className="font-medium">{QUEUE_CATEGORY_LABELS[c.callTask.category]}</span> · {c.callTask.status.toLowerCase()}</p>
                  <ul className="text-muted mt-1 space-y-0.5 list-disc pl-4">
                    {(c.callTask.reasons as unknown as Array<{ label: string }>).slice(0, 4).map((r, i) => <li key={i}>{r.label}</li>)}
                  </ul>
                </div>
              </Section>
            )}

            <Section title="Account">
              <Link href={`/accounts/${c.account.id}`} className="card p-3 block hover:bg-raised/60">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium flex-1 truncate">{c.account.name}</span>
                  <AccountStatusPill status={c.account.status} />
                </div>
                <p className="text-[11px] text-muted">{[c.account.industry, c.account.city, c.account.region].filter(Boolean).join(' · ')}</p>
                <p className="text-[11px] text-muted num">score {c.account.score}</p>
              </Link>
            </Section>

            {c.enrollments.length > 0 && (
              <Section title="Campaigns">
                <ul className="card divide-y divide-hairline">
                  {c.enrollments.map((e) => (
                    <li key={e.id} className="p-3 text-micro flex gap-2">
                      <Link href={`/campaigns/${e.campaign.id}`} className="flex-1 truncate hover:text-accent">{e.campaign.name}</Link>
                      <span className="text-muted">{e.status.toLowerCase()}{e.exitReason && ` · ${e.exitReason.toLowerCase().replace(/_/g, ' ')}`}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section title="Where this data came from">
              {provenance.data && Object.keys(provenance.data).length > 0 ? (
                <ul className="card divide-y divide-hairline text-[11px]">
                  {Object.values(provenance.data).map((p) => (
                    <li key={p.id} className="p-2.5 flex gap-2">
                      <span className="w-20 shrink-0 text-muted">{FIELD_LABELS[p.field] ?? p.field}</span>
                      <span className="flex-1">
                        {p.source.toLowerCase().replace(/_/g, ' ')}{p.provider && ` · ${p.provider}`}
                        <span className="text-muted"> · <Ago date={p.retrievedAt} /></span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-micro text-muted">No source recorded.</p>}
            </Section>
          </aside>
        </div>
      </PageBody>

      {dialog === 'edit' && <ContactFormDialog accountId={c.account.id} contact={c} onClose={() => { setDialog(null); contact.refetch(); }} />}
      {dialog === 'suppress' && (
        <SuppressDialog clientId={c.client.id} email={c.email} phone={phone} onClose={() => { setDialog(null); contact.refetch(); }} />
      )}
    </>
  );
}

/** Records a do-not-contact request against this person's email and/or phone. */
function SuppressDialog({ clientId, email, phone, onClose }: { clientId: string; email: string | null; phone: string | null; onClose: () => void }) {
  const [channel, setChannel] = useState<'ALL' | 'EMAIL' | 'PHONE'>('ALL');
  const [note, setNote] = useState('');
  const add = trpc.suppression.add.useMutation();
  const submit = async () => {
    const reason = channel === 'PHONE' ? 'DO_NOT_CALL' as const : 'DO_NOT_CONTACT' as const;
    if (email && channel !== 'PHONE') await add.mutateAsync({ value: email, scope: 'EMAIL', channel, reason, clientId, note: note || undefined });
    if (phone && channel !== 'EMAIL') await add.mutateAsync({ value: phone, scope: 'PHONE', channel: 'PHONE', reason, clientId, note: note || undefined });
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Do not contact" width="sm"
            description="Recorded with the reason, source and time. Active sequences stop and the person leaves the call queue. Opt-outs cannot be undone from the app.">
      <div className="space-y-3">
        <Field label="Channel">
          {(id) => (
            <select id={id} className="input" value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
              <option value="ALL">Any contact (email and phone)</option>
              {email && <option value="EMAIL">Email only</option>}
              {phone && <option value="PHONE">Phone only (do not call)</option>}
            </select>
          )}
        </Field>
        <Field label="Note">{(id) => <input id={id} className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Asked on a call on 6 Oct" />}</Field>
        <ErrorNote error={add.error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={add.isPending || (!email && !phone)} onClick={() => void submit()}>Record</button>
        </div>
      </div>
    </Dialog>
  );
}
