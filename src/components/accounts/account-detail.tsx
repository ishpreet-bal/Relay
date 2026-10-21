'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import {
  ArrowLeft, CopyCheck, Database, ExternalLink, Mail, MailCheck, Phone, PhoneCall, PhoneOff, Plus, Radio, RefreshCw, Sparkles,
  Star, Trash2, UserSearch, X,
} from 'lucide-react';
import type { AccountStatus, SignalType } from '@prisma/client';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/types';
import {
  ACCOUNT_STATUSES, ACCOUNT_STATUS_LABELS, MEETING_STATUS_LABELS, SENIORITY_LABELS, SIGNAL_LABELS, SIGNAL_TYPES, personName,
} from '@/lib/domain';
import { Topbar } from '@/components/shell/topbar';
import { PageBody, Section } from '@/components/ui/page';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Pill } from '@/components/ui/pill';
import { ErrorNote, Loading, NotConfigured } from '@/components/ui/states';
import { Ago, DateTime } from '@/components/ui/time';
import { ScoreBadge, ScoreParts, parseBreakdown } from '@/components/scoring/score';
import { AccountStatusPill, SignalPill, VerificationBadge } from '@/components/domain/pills';
import { ResearchPanel } from '@/components/research/research-panel';
import { EnrollDialog } from '@/components/campaigns/enroll-dialog';
import { Timeline } from './timeline';
import { ContactFormDialog } from './contact-form-dialog';
import { cn } from '@/lib/utils';

export interface AccountPermissions {
  write: boolean;
  override: boolean;
  remove: boolean;
  research: boolean;
  draft: boolean;
  call: boolean;
  enroll: boolean;
}

type Tab = 'research' | 'outreach' | 'activity';

export function AccountDetail({ id, can }: { id: string; can: AccountPermissions }) {
  const account = trpc.accounts.byId.useQuery({ id });
  const capabilities = trpc.session.capabilities.useQuery();
  const [tab, setTab] = useState<Tab>('research');
  const [dialog, setDialog] = useState<'contact' | 'signal' | 'override' | 'enroll' | 'status' | null>(null);

  if (account.isPending) return <><Topbar title="Account" showClientSwitcher={false} /><Loading /></>;
  if (account.error) {
    return (
      <>
        <Topbar title="Account" showClientSwitcher={false} />
        <PageBody><ErrorNote error={account.error} /><Link href="/accounts" className="btn-ghost mt-3">Back to accounts</Link></PageBody>
      </>
    );
  }
  const a = account.data;
  const breakdown = parseBreakdown(a.scoreBreakdown);
  const location = [a.city, a.region, a.country].filter(Boolean).join(', ');

  return (
    <>
      <Topbar title={a.name} showClientSwitcher={false} />
      <PageBody width="wide">
        <Link href="/accounts" className="inline-flex items-center gap-1 text-micro text-muted hover:text-ink mb-3">
          <ArrowLeft className="size-3.5" /> Accounts
        </Link>

        <header className="flex flex-col md:flex-row md:items-start gap-4 mb-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h2 className="text-xl font-semibold">{a.name}</h2>
              <AccountStatusPill status={a.status} />
              {a.doNotContact && <Pill tone="negative">Do not contact</Pill>}
              {a.temperature !== 'COLD' && <Pill tone={a.temperature === 'HOT' ? 'negative' : 'warning'}>{a.temperature.toLowerCase()}</Pill>}
            </div>
            <p className="text-micro text-muted">
              {a.client.name}
              {a.industry && <> · {a.industry}</>}
              {location && <> · {location}</>}
              {(a.employeeCount ?? a.employeeRange) && <> · <span className="num">{a.employeeCount ?? a.employeeRange}</span> employees</>}
              {a.websiteUrl && (
                <> · <a href={a.websiteUrl.startsWith('http') ? a.websiteUrl : `https://${a.websiteUrl}`} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 hover:text-accent">{a.domain ?? a.websiteUrl}<ExternalLink className="size-3" /></a></>
              )}
            </p>
            {a.researchSummary && <p className="text-sm mt-2 max-w-3xl">{a.researchSummary}</p>}
            <DuplicateBanner accountId={a.id} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {can.write && <button type="button" className="btn-outline h-8 text-micro" onClick={() => setDialog('status')}>Change status</button>}
            {can.enroll && <button type="button" className="btn-outline h-8 text-micro" onClick={() => setDialog('enroll')}>Add to campaign</button>}
            <AccountActions id={a.id} can={can} enrichable={!!capabilities.data?.companyData} />
          </div>
        </header>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-6">
          <div className="space-y-6 min-w-0">
            <Section title="Why this account"
                     hint={a.scoreOverride !== null ? `Score set to ${a.scoreOverride} by hand${a.scoreOverrideReason ? `: ${a.scoreOverrideReason}` : ''}.` : breakdown?.summary}
                     action={can.override && <button type="button" className="btn-ghost h-7 text-micro" onClick={() => setDialog('override')}>Adjust score</button>}>
              <div className="card p-4 grid sm:grid-cols-[auto_1fr] gap-5 items-start">
                <div>
                  <ScoreBadge score={a.score} breakdown={a.scoreBreakdown} overridden={a.scoreOverride !== null} size="lg" />
                  <p className="text-[11px] text-muted mt-1">{a.icp ? <>Scored against <span className="text-ink">{a.icp.name}</span></> : 'No matching ICP yet'}</p>
                  {a.scoredAt && <p className="text-[11px] text-muted">Updated <Ago date={a.scoredAt} /></p>}
                </div>
                {breakdown ? <ScoreParts breakdown={breakdown} /> : <p className="text-micro text-muted">This account hasn&apos;t been scored yet. Scores refresh within a few minutes of any change.</p>}
              </div>
            </Section>

            <Section title={`Signals (${a.signals.length})`} hint="Recent events that make now a good time to reach out."
                     action={can.write && <button type="button" className="btn-ghost h-7 text-micro" onClick={() => setDialog('signal')}><Plus className="size-3.5" /> Add signal</button>}>
              {a.signals.length === 0 ? (
                <p className="card p-4 text-micro text-muted">No signals yet. Research finds them on the company&apos;s own site; you can also add one you found elsewhere, with its source.</p>
              ) : (
                <ul className="card divide-y divide-hairline">
                  {a.signals.map((s) => <SignalRow key={s.id} signal={s} canWrite={can.write} accountId={a.id} />)}
                </ul>
              )}
            </Section>

            <div>
              <div role="tablist" aria-label="Account detail" className="flex gap-1 border-b border-hairline mb-4">
                {(['research', 'outreach', 'activity'] as const).map((t) => (
                  <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)}
                          className={cn('h-9 px-3 text-[13px] -mb-px border-b-2 transition-colors capitalize',
                            tab === t ? 'border-accent text-ink font-medium' : 'border-transparent text-muted hover:text-ink')}>
                    {t === 'activity' ? 'Activity & notes' : t}
                  </button>
                ))}
              </div>
              {tab === 'research' && <ResearchPanel accountId={a.id} canRun={can.research} hasWebsite={!!a.websiteUrl} />}
              {tab === 'outreach' && <Outreach accountId={a.id} />}
              {tab === 'activity' && <Timeline accountId={a.id} canWrite={can.write} />}
            </div>
          </div>

          <aside className="space-y-6 min-w-0">
            <Section title={`Contacts (${a.contacts.length})`} hint="Ranked by fit for this client's offer and how reachable they are."
                     action={can.write && <button type="button" className="btn-ghost h-7 text-micro" onClick={() => setDialog('contact')}><Plus className="size-3.5" /> Add</button>}>
              <ContactsList account={a} can={can} capabilities={capabilities.data} />
            </Section>

            {a.enrollments.length > 0 && (
              <Section title="In campaigns">
                <ul className="card divide-y divide-hairline">
                  {a.enrollments.map((e) => (
                    <li key={e.id} className="p-3 text-micro flex items-center gap-2">
                      <Link href={`/campaigns/${e.campaign.id}`} className="flex-1 truncate hover:text-accent">{e.campaign.name}</Link>
                      <span className="text-muted">step {e.currentStep + 1} · {e.status.toLowerCase()}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section title="Meetings">
              {a.meetings.length === 0 ? <p className="text-micro text-muted">None booked yet.</p> : (
                <ul className="card divide-y divide-hairline">
                  {a.meetings.map((m) => (
                    <li key={m.id} className="p-3 text-micro">
                      <p className="font-medium"><DateTime date={m.startsAt} /></p>
                      <p className="text-muted">{m.contact ? personName(m.contact) : 'No contact'} · {MEETING_STATUS_LABELS[m.status]}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Details">
              <dl className="card p-3 grid grid-cols-[110px_1fr] gap-y-1.5 text-micro">
                <Detail label="Phone" value={a.phone} />
                <Detail label="Address" value={[a.addressLine, a.postalCode].filter(Boolean).join(' ') || null} />
                <Detail label="Business model" value={a.businessModel} />
                <Detail label="Revenue" value={a.revenueRange} />
                <Detail label="Founded" value={a.foundedYear?.toString()} />
                {socialLinks(a.socialProfiles).length > 0 && (
                  <Detail label="Profiles" value={
                    <span className="flex flex-wrap gap-x-2">
                      {socialLinks(a.socialProfiles).map(([network, url]) => (
                        <a key={network} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 hover:text-accent capitalize">
                          {network}<ExternalLink className="size-3" />
                        </a>
                      ))}
                    </span>
                  } />
                )}
                {a.parent && <Detail label="Part of" value={<Link href={`/accounts/${a.parent.id}`} className="hover:text-accent">{a.parent.name}</Link>} />}
                {a.branches.length > 0 && (
                  <Detail label="Locations" value={
                    <span className="flex flex-col">
                      {a.branches.map((b) => <Link key={b.id} href={`/accounts/${b.id}`} className="hover:text-accent truncate">{b.city ?? b.name}</Link>)}
                    </span>
                  } />
                )}
                <Detail label="Verified" value={a.lastVerifiedAt ? <Ago date={a.lastVerifiedAt} /> : 'not yet'} />
                <Detail label="Source" value={a.source.toLowerCase().replace(/_/g, ' ')} />
                <Detail label="Owner" value={a.owner ? [a.owner.firstName, a.owner.lastName].filter(Boolean).join(' ') : null} />
                <Detail label="Added" value={<Ago date={a.createdAt} />} />
                <Detail label="Last touch" value={<Ago date={a.lastContactedAt} />} />
                {a.tags.length > 0 && <Detail label="Tags" value={a.tags.join(', ')} />}
              </dl>
              {a.description && <p className="text-micro text-muted mt-2">{a.description}</p>}
            </Section>
          </aside>
        </div>
      </PageBody>

      {dialog === 'contact' && <ContactFormDialog accountId={a.id} onClose={() => setDialog(null)} />}
      {dialog === 'signal' && <SignalDialog accountId={a.id} onClose={() => setDialog(null)} />}
      {dialog === 'override' && <OverrideDialog id={a.id} current={a.scoreOverride} computed={breakdown?.total ?? a.score} onClose={() => setDialog(null)} />}
      {dialog === 'status' && <StatusDialog id={a.id} current={a.status} onClose={() => setDialog(null)} />}
      {dialog === 'enroll' && <EnrollDialog accountIds={[a.id]} clientId={a.client.id} onClose={() => setDialog(null)} onEnrolled={() => account.refetch()} />}
    </>
  );
}

type AccountData = RouterOutputs['accounts']['byId'];

function socialLinks(value: unknown): Array<[string, string]> {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>)
    .filter((e): e is [string, string] => typeof e[1] === 'string' && /^https?:\/\//.test(e[1]));
}

/** A note when this account might be the same company as another one. */
function DuplicateBanner({ accountId }: { accountId: string }) {
  const dups = trpc.accounts.duplicatesOf.useQuery({ accountId });
  const first = dups.data?.[0];
  if (!first) return null;
  const other = first.account.id === accountId ? first.candidate : first.account;
  return (
    <p className="mt-3 inline-flex flex-wrap items-center gap-1.5 rounded-md border border-held/30 bg-held/10 px-2.5 py-1.5 text-micro">
      <CopyCheck className="size-3.5 text-held" />
      Might be the same company as <Link href={`/accounts/${other.id}`} className="font-medium hover:text-accent">{other.name}</Link>
      <span className="text-muted">({Math.round(first.score * 100)}% match{dups.data!.length > 1 ? `, +${dups.data!.length - 1} more` : ''})</span>
      <Link href="/duplicates" className="text-accent hover:underline">Review</Link>
    </p>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="truncate">{value || '—'}</dd>
    </>
  );
}

function AccountActions({ id, can, enrichable }: { id: string; can: AccountPermissions; enrichable: boolean }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const refresh = () => { utils.accounts.byId.invalidate({ id }); utils.accounts.timeline.invalidate(); };
  const rescore = trpc.accounts.rescore.useMutation({ onSuccess: refresh });
  const enrich = trpc.accounts.enrich.useMutation({ onSuccess: refresh });
  const archive = trpc.accounts.archive.useMutation({ onSuccess: () => router.push('/accounts') });
  const [message, setMessage] = useState<string | null>(null);

  return (
    <>
      {can.write && (
        <button type="button" className="btn-ghost h-8 text-micro" disabled={rescore.isPending} onClick={() => rescore.mutate({ id })} title="Recompute the score now">
          <RefreshCw className={cn('size-3.5', rescore.isPending && 'animate-spin')} /> Rescore
        </button>
      )}
      {can.write && enrichable && (
        <button type="button" className="btn-ghost h-8 text-micro" disabled={enrich.isPending}
                onClick={() => enrich.mutate({ id }, {
                  onSuccess: (r) => setMessage(r.status === 'SUCCESS'
                    ? (r.filled.length ? `Filled ${r.filled.join(', ')}.` : 'Nothing new found; existing values are never overwritten.')
                    : r.status === 'NOT_FOUND' ? 'The data provider has no record of this company.' : `Enrichment failed: ${r.error ?? 'unknown error'}`),
                })}>
          <Database className="size-3.5" /> {enrich.isPending ? 'Enriching…' : 'Enrich'}
        </button>
      )}
      {can.remove && (
        <button type="button" className="btn-ghost h-8 text-micro text-blocked" disabled={archive.isPending}
                onClick={() => { if (confirm('Archive this account? Its outreach history is kept for compliance.')) archive.mutate({ id }); }}>
          <Trash2 className="size-3.5" /> Archive
        </button>
      )}
      {(message || enrich.error) && <p className="basis-full text-[12px] text-muted">{message ?? enrich.error?.message}</p>}
    </>
  );
}

function SignalRow({ signal: s, canWrite, accountId }: { signal: AccountData['signals'][number]; canWrite: boolean; accountId: string }) {
  const utils = trpc.useUtils();
  const dismiss = trpc.accounts.dismissSignal.useMutation({ onSuccess: () => utils.accounts.byId.invalidate({ id: accountId }) });
  const when = s.eventDate ?? s.detectedAt;
  return (
    <li className="p-3 flex items-start gap-3">
      <Radio className="size-4 text-accent shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[13px] font-medium">{s.title}</p>
          <SignalPill type={s.type} />
          {s.evidenceStatus === 'VERIFIED' && <Pill tone="positive">verified</Pill>}
          {s.evidenceStatus === 'UNVERIFIED' && <Pill tone="warning" title="Not checked against a source; drafts won't cite it as fact">unverified</Pill>}
          {s.evidenceStatus === 'PROVIDER_REPORTED' && <Pill title={`Reported by ${s.provider ?? 'a data provider'}`}>provider</Pill>}
        </div>
        {s.summary && <p className="text-micro text-muted mt-0.5">{s.summary}</p>}
        {s.sourceQuote && <blockquote className="text-[11px] text-muted border-l-2 border-hairline pl-2 mt-1 italic line-clamp-2">“{s.sourceQuote}”</blockquote>}
        <p className="text-[11px] text-muted mt-1">
          {s.eventDate ? 'Happened' : 'Found'} {formatDistanceToNowStrict(when, { addSuffix: true })}
          {s.sourceUrl && <> · <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent inline-flex items-center gap-0.5">{s.sourceTitle ?? 'source'}<ExternalLink className="size-3" /></a></>}
        </p>
      </div>
      {canWrite && (
        <button type="button" className="btn-ghost size-7 p-0" aria-label="Dismiss signal" title="Dismiss — not relevant"
                disabled={dismiss.isPending} onClick={() => dismiss.mutate({ id: s.id, reason: null })}>
          <X className="size-3.5" />
        </button>
      )}
    </li>
  );
}

function ContactsList({ account: a, can, capabilities }: {
  account: AccountData;
  can: AccountPermissions;
  capabilities?: { contactData: boolean; emailFinder: boolean; ai: boolean };
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const refresh = () => utils.accounts.byId.invalidate({ id: a.id });
  const discover = trpc.accounts.discoverContacts.useMutation({
    onSuccess: (r) => {
      refresh();
      setNotice(r.status === 'SUCCESS' ? `${r.added} new contact${r.added === 1 ? '' : 's'} found.` : r.status === 'NOT_FOUND' ? 'No matching people found.' : `Lookup failed: ${r.error ?? 'unknown error'}`);
    },
  });

  return (
    <div className="space-y-2">
      {a.contacts.length === 0 ? (
        <p className="card p-3 text-micro text-muted">No contacts yet. Add the people this client should be talking to.</p>
      ) : (
        <ul className="card divide-y divide-hairline">
          {a.contacts.map((c, i) => (
            <ContactRow key={c.id} contact={c} rank={i} accountId={a.id} can={can} capabilities={capabilities}
                        onEdit={() => setEditing(c.id)} onNotice={setNotice} />
          ))}
        </ul>
      )}
      {can.write && (capabilities?.contactData ? (
        <button type="button" className="btn-outline h-8 text-micro w-full" disabled={discover.isPending || !a.domain}
                onClick={() => discover.mutate({ id: a.id, limit: 5 })} title={a.domain ? undefined : 'Needs a website to look people up'}>
          <UserSearch className="size-3.5" /> {discover.isPending ? 'Searching…' : 'Find contacts at this company'}
        </button>
      ) : capabilities && (
        <NotConfigured what="A contact data provider">Add people by hand or by CSV until one is connected.</NotConfigured>
      ))}
      {(notice || discover.error) && <p className="text-[12px] text-muted">{notice ?? discover.error?.message}</p>}
      {editing && (
        <ContactFormDialog accountId={a.id} contact={a.contacts.find((c) => c.id === editing)!} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function ContactRow({ contact: c, rank, accountId, can, capabilities, onEdit, onNotice }: {
  contact: AccountData['contacts'][number];
  rank: number;
  accountId: string;
  can: AccountPermissions;
  capabilities?: { contactData: boolean; emailFinder: boolean; ai: boolean };
  onEdit: () => void;
  onNotice: (s: string) => void;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const queue = trpc.calls.addToQueue.useMutation({ onSuccess: () => onNotice(`${personName(c)} is in the call queue.`), onError: (e) => onNotice(e.message) });
  const draft = trpc.messages.draft.useMutation({ onSuccess: () => router.push('/review'), onError: (e) => onNotice(e.message) });
  const reveal = trpc.contacts.revealEmail.useMutation({
    onSuccess: (r) => { utils.accounts.byId.invalidate({ id: accountId }); onNotice(r.email ? `Found ${r.email}.` : 'No email found.'); },
    onError: (e) => onNotice(e.message),
  });
  const phone = c.directPhone ?? c.mobilePhone ?? c.phone;
  const suppressed = c.doNotEmail && c.doNotCall;

  return (
    <li className={cn('p-3', suppressed && 'opacity-60')}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {rank === 0 && c.score > 0 && <Star className="size-3 text-held fill-held shrink-0" aria-label="Best contact" />}
            <Link href={`/contacts/${c.id}`} className="text-[13px] font-medium truncate hover:text-accent">{personName(c)}</Link>
            {c.isDecisionMaker && <Pill tone="accent">decision maker</Pill>}
          </div>
          <p className="text-[11px] text-muted truncate">
            {c.title ?? 'No title'}{c.seniority !== 'UNKNOWN' && ` · ${SENIORITY_LABELS[c.seniority]}`}
          </p>
        </div>
        <ScoreBadge score={c.score} breakdown={c.scoreBreakdown} />
      </div>
      <div className="mt-1.5 space-y-0.5 text-[11px]">
        {c.email ? (
          <p className={cn('flex items-center gap-1.5', c.doNotEmail ? 'text-blocked line-through' : 'text-muted')}>
            {c.emailVerification === 'VALID' ? <MailCheck className="size-3 text-cleared" /> : <Mail className="size-3" />}
            <span className="truncate">{c.email}</span>
            {c.emailVerification === 'RISKY' && <span className="text-held">risky</span>}
            {c.emailVerification === 'INVALID' && <span className="text-blocked">invalid</span>}
          </p>
        ) : can.write && capabilities?.emailFinder ? (
          <button type="button" className="text-accent hover:underline" disabled={reveal.isPending} onClick={() => reveal.mutate({ id: c.id })}>
            {reveal.isPending ? 'Looking up…' : 'Find email'}
          </button>
        ) : <p className="text-muted">No email</p>}
        {phone ? (
          <p className={cn('flex items-center gap-1.5', c.doNotCall ? 'text-blocked line-through' : 'text-muted')}>
            {c.doNotCall ? <PhoneOff className="size-3" /> : <Phone className="size-3" />}
            <a href={`tel:${phone}`} className="num hover:text-accent">{phone}</a>
            {c.directPhone ? <span>direct</span> : c.mobilePhone ? <span>mobile</span> : null}
          </p>
        ) : <p className="text-muted">No phone</p>}
        {c.lastContactedAt && <p className="text-muted">Last contacted <Ago date={c.lastContactedAt} /></p>}
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        {can.call && !c.doNotCall && phone && (
          <>
            <Link href={`/calls/${c.id}`} className="btn-ghost h-7 px-2 text-[11px]"><PhoneCall className="size-3" /> Call prep</Link>
            <button type="button" className="btn-ghost h-7 px-2 text-[11px]" disabled={queue.isPending} onClick={() => queue.mutate({ contactId: c.id })}>Queue call</button>
          </>
        )}
        {can.draft && capabilities?.ai && c.email && !c.doNotEmail && (
          <button type="button" className="btn-ghost h-7 px-2 text-[11px]" disabled={draft.isPending} onClick={() => draft.mutate({ contactId: c.id })}>
            <Sparkles className="size-3" /> {draft.isPending ? 'Drafting…' : 'Draft email'}
          </button>
        )}
        {can.write && <button type="button" className="btn-ghost h-7 px-2 text-[11px]" onClick={onEdit}>Edit</button>}
      </div>
    </li>
  );
}

function Outreach({ accountId }: { accountId: string }) {
  const messages = trpc.accounts.messages.useQuery({ accountId });
  if (messages.isPending) return <Loading />;
  if (!messages.data?.length) return <p className="text-sm text-muted py-6 text-center">No emails drafted or sent yet.</p>;
  return (
    <ul className="space-y-2">
      {messages.data.map((m) => (
        <li key={m.id} className={cn('card p-3', m.direction === 'INBOUND' && 'border-accent/40')}>
          <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted mb-1">
            <span className="font-medium text-ink">{m.direction === 'INBOUND' ? `Reply from ${m.contact ? personName(m.contact) : 'contact'}` : `To ${m.contact ? personName(m.contact) : 'contact'}`}</span>
            {m.campaign && <span>· {m.campaign.name}{m.stepOrder !== null && ` · step ${m.stepOrder + 1}`}</span>}
            <span>· {m.status.toLowerCase().replace(/_/g, ' ')}</span>
            {m.direction === 'OUTBOUND' && <VerificationBadge status={m.verificationStatus} score={m.verificationScore} />}
            {m.approvalSource === 'POLICY' && <Pill title="Approved automatically by the campaign's verification policy">auto-approved</Pill>}
            {m.replyClass && m.direction === 'INBOUND' && <Pill tone={m.replyClass === 'POSITIVE' ? 'positive' : m.replyClass === 'NEGATIVE' || m.replyClass === 'UNSUBSCRIBE' ? 'negative' : 'neutral'}>{m.replyClass.toLowerCase().replace(/_/g, ' ')}</Pill>}
            <span className="ml-auto"><Ago date={m.sentAt ?? m.createdAt} /></span>
          </div>
          {m.subject && <p className="text-[13px] font-medium">{m.subject}</p>}
          <p className="text-micro text-muted whitespace-pre-wrap line-clamp-6 mt-0.5">{m.bodyText}</p>
        </li>
      ))}
    </ul>
  );
}

function SignalDialog({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [type, setType] = useState<SignalType>('HIRING');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceQuote, setSourceQuote] = useState('');
  const [eventDate, setEventDate] = useState('');
  const add = trpc.accounts.addSignal.useMutation({ onSuccess: () => { utils.accounts.byId.invalidate({ id: accountId }); onClose(); } });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Add a signal"
            description="Signals added by hand are marked unverified. Drafts will not state them as fact unless their source is verified.">
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        add.mutate({
          accountId, type, title, summary: summary || undefined, sourceUrl: sourceUrl || undefined,
          sourceQuote: sourceQuote || undefined, eventDate: eventDate ? new Date(eventDate) : undefined,
        });
      }}>
        <Field label="Type">
          {(id) => (
            <select id={id} className="input" value={type} onChange={(e) => setType(e.target.value as SignalType)}>
              {SIGNAL_TYPES.map((t) => <option key={t} value={t}>{SIGNAL_LABELS[t]}</option>)}
            </select>
          )}
        </Field>
        <Field label="What happened">{(id) => <input id={id} required minLength={3} className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Hiring two AZ drivers in Mississauga" />}</Field>
        <Field label="Details">{(id) => <textarea id={id} className="input h-auto py-2" rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} />}</Field>
        <Field label="Source link" hint="Where you saw it. Signals with a source are worth more.">{(id) => <input id={id} type="url" className="input" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />}</Field>
        <Field label="Quote from the source">{(id) => <textarea id={id} className="input h-auto py-2" rows={2} value={sourceQuote} onChange={(e) => setSourceQuote(e.target.value)} />}</Field>
        <Field label="When it happened">{(id) => <input id={id} type="date" className="input" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />}</Field>
        <ErrorNote error={add.error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={add.isPending || title.trim().length < 3}>{add.isPending ? 'Saving…' : 'Add signal'}</button>
        </div>
      </form>
    </Dialog>
  );
}

function OverrideDialog({ id, current, computed, onClose }: { id: string; current: number | null; computed: number; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [score, setScore] = useState(String(current ?? computed));
  const [reason, setReason] = useState('');
  const override = trpc.accounts.overrideScore.useMutation({ onSuccess: () => { utils.accounts.byId.invalidate({ id }); onClose(); } });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Adjust score" width="sm"
            description="A manual score replaces the computed one for prioritization. The computed breakdown is kept, and the change is logged.">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); override.mutate({ id, score: Number(score), reason: reason || null }); }}>
        <Field label="Score (0–100)">{(fid) => <input id={fid} type="number" min={0} max={100} required className="input" value={score} onChange={(e) => setScore(e.target.value)} />}</Field>
        <Field label="Why">{(fid) => <input id={fid} required className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Client named them as a priority" />}</Field>
        <ErrorNote error={override.error} />
        <div className="flex justify-between gap-2">
          {current !== null ? (
            <button type="button" className="btn-ghost" disabled={override.isPending} onClick={() => override.mutate({ id, score: null, reason: null })}>Remove override</button>
          ) : <span />}
          <button type="submit" className="btn-primary" disabled={override.isPending || !reason.trim()}>Save</button>
        </div>
      </form>
    </Dialog>
  );
}

function StatusDialog({ id, current, onClose }: { id: string; current: AccountStatus; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<AccountStatus>(current);
  const [reason, setReason] = useState('');
  const set = trpc.accounts.setStatus.useMutation({ onSuccess: () => { utils.accounts.byId.invalidate({ id }); utils.accounts.timeline.invalidate(); onClose(); } });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Change status" width="sm">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); set.mutate({ id, status, reason: reason || undefined }); }}>
        <Field label="Status">
          {(fid) => (
            <select id={fid} className="input" value={status} onChange={(e) => setStatus(e.target.value as AccountStatus)}>
              {ACCOUNT_STATUSES.map((s) => <option key={s} value={s}>{ACCOUNT_STATUS_LABELS[s]}</option>)}
            </select>
          )}
        </Field>
        <Field label="Reason" hint={status === 'DISQUALIFIED' || status === 'LOST' ? 'Closing an account removes it from the call queue.' : undefined}>
          {(fid) => <input id={fid} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
        <ErrorNote error={set.error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={set.isPending || status === current}>Save</button>
        </div>
      </form>
    </Dialog>
  );
}
