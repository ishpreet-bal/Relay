'use client';

import { useState } from 'react';
import { CalendarCheck, ExternalLink, Mail, Phone } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { personName, MEETING_OUTCOME_LABELS } from '@/lib/domain';
import { formatMoney, cn } from '@/lib/utils';
import { Section } from '@/components/ui/page';
import { Kpi } from '@/components/ui/kpi';
import { Pill } from '@/components/ui/pill';
import { EmptyState, ErrorNote, Loading } from '@/components/ui/states';
import { DateTime } from '@/components/ui/time';
import { MeetingStatusPill } from '@/components/domain/pills';
import { MeetingsTrend } from '@/components/analytics/meetings-trend';
import { WindowSelect } from '@/components/analytics/funnel-view';
import { ClientProfileForm, profilePayload, profileValuesFrom } from '@/components/clients/client-profile-form';

/** `clientId` is set only when staff view a client's portal; client users get their own. */
type Props = { clientId: string | null };

export function PortalOverview({ clientId }: Props) {
  const [days, setDays] = useState(30);
  const overview = trpc.portal.overview.useQuery({ clientId, days });
  if (overview.isPending) return <Loading />;
  if (overview.error) return <ErrorNote error={overview.error} />;
  const { numbers: n, client, trend, upcoming, allTime } = overview.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{client.name}</h1>
          <p className="text-micro text-muted">What outbound has done for you in the last {days} days.</p>
        </div>
        <WindowSelect days={days} onChange={setDays} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Meetings booked" value={n.meetingsBooked} tone={n.meetingsBooked ? 'positive' : undefined} caption={`${n.meetingsHeld} held`} />
        <Kpi label="Conversations" value={n.conversations} caption={`${n.calls} calls made`} />
        <Kpi label="Positive replies" value={n.positiveReplies} caption={`${n.emailsSent} emails sent`} />
        <Kpi label="Prospects identified" value={n.prospectsIdentified} caption={`${n.contactsFound} decision makers found`} />
      </div>
      {(n.pipelineCents > 0 || n.revenueCents > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <Kpi label="Open pipeline" value={formatMoney(n.pipelineCents, client.currency)} caption="Estimated value of meetings not yet won or lost" />
          <Kpi label="Won" value={formatMoney(n.revenueCents, client.currency)} caption={`${n.dealsWon} deal${n.dealsWon === 1 ? '' : 's'} in this period`} tone={n.revenueCents ? 'positive' : undefined} />
        </div>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
        <Section title="Meetings booked per week" hint={`${allTime.meetings} meetings since we started.`}>
          <div className="card p-4"><MeetingsTrend data={trend} /></div>
        </Section>
        <Section title="Coming up">
          {!upcoming.length ? <p className="text-micro text-muted">No meetings scheduled right now.</p> : (
            <ul className="card divide-y divide-hairline">
              {upcoming.map((m) => (
                <li key={m.id} className="p-3 text-micro">
                  <p className="font-medium"><DateTime date={m.startsAt} /></p>
                  <p className="text-muted">{m.account.name}{m.contact && ` · ${personName(m.contact)}`}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

export function PortalMeetings({ clientId }: Props) {
  const [range, setRange] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const meetings = trpc.portal.meetings.useQuery({ clientId, range });
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold flex-1">Meetings</h1>
        <div role="group" aria-label="Range" className="inline-flex rounded-md border border-hairline overflow-hidden">
          {(['upcoming', 'past', 'all'] as const).map((r) => (
            <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}
                    className={cn('h-8 px-3 text-micro capitalize', range === r ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-raised')}>{r}</button>
          ))}
        </div>
      </div>
      <ErrorNote error={meetings.error} />
      {meetings.isPending ? <Loading /> : !meetings.data?.length ? (
        <EmptyState icon={CalendarCheck} title={range === 'upcoming' ? 'No upcoming meetings' : 'No meetings yet'}>
          Meetings we book for you appear here with who they are with and what we learned.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {meetings.data.map((m) => (
            <li key={m.id} className="card p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="sm:w-40 shrink-0">
                  <p className="text-[13px] font-medium"><DateTime date={m.startsAt} pattern="EEE d MMM" /></p>
                  <p className="text-micro text-muted"><DateTime date={m.startsAt} pattern="h:mm a" /></p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <MeetingStatusPill status={m.status} />
                    {m.outcome !== 'PENDING' && <Pill>{MEETING_OUTCOME_LABELS[m.outcome]}</Pill>}
                  </div>
                </div>
                <div className="flex-1 min-w-0 text-micro">
                  <p className="text-[14px] font-semibold">{m.account.name}</p>
                  <p className="text-muted">{[m.account.industry, [m.account.city, m.account.region].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</p>
                  {m.contact && (
                    <div className="mt-2">
                      <p className="font-medium">{personName(m.contact)}{m.contact.title && <span className="text-muted font-normal">, {m.contact.title}</span>}</p>
                      <p className="flex flex-wrap gap-x-3 text-muted">
                        {m.contact.email && <a href={`mailto:${m.contact.email}`} className="inline-flex items-center gap-1 hover:text-accent"><Mail className="size-3" />{m.contact.email}</a>}
                        {(m.contact.directPhone ?? m.contact.phone) && <a href={`tel:${m.contact.directPhone ?? m.contact.phone}`} className="inline-flex items-center gap-1 hover:text-accent num"><Phone className="size-3" />{m.contact.directPhone ?? m.contact.phone}</a>}
                      </p>
                    </div>
                  )}
                  {m.qualificationNotes && (
                    <div className="mt-2 rounded-md bg-raised p-2.5">
                      <p className="eyebrow mb-1">What we learned</p>
                      <p className="whitespace-pre-wrap">{m.qualificationNotes}</p>
                    </div>
                  )}
                  <p className="mt-2 flex flex-wrap gap-x-3 text-muted">
                    {m.meetingUrl && <a href={m.meetingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent">Join link<ExternalLink className="size-3" /></a>}
                    {m.location && <span>{m.location}</span>}
                    {m.estimatedValueCents ? <span>Estimated value {formatMoney(m.estimatedValueCents, m.currency)}</span> : null}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PortalCampaigns({ clientId }: Props) {
  const campaigns = trpc.portal.campaigns.useQuery({ clientId });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Campaigns</h1>
      <ErrorNote error={campaigns.error} />
      {campaigns.isPending ? <Loading /> : !campaigns.data?.length ? (
        <EmptyState title="No campaigns yet">Campaigns appear here once we start reaching out on your behalf.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {campaigns.data.map((c) => (
            <li key={c.id} className="card p-4">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-[14px] font-semibold flex-1">{c.name}</h2>
                <Pill tone={c.status === 'ACTIVE' ? 'positive' : 'neutral'}>{c.status === 'ACTIVE' ? 'running' : c.status.toLowerCase().replace(/_/g, ' ')}</Pill>
              </div>
              <p className="text-micro text-muted mb-3">{[c.offer, c.audience && `for ${c.audience}`].filter(Boolean).join(' ')}{c.startedAt && <> · started <DateTime date={c.startedAt} pattern="d MMM yyyy" /></>}</p>
              <dl className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center">
                {[['Prospects', c.prospects], ['Emails sent', c.emailsSent], ['Replies', c.replies], ['Positive', c.positiveReplies], ['Meetings', c.meetings]].map(([label, value]) => (
                  <div key={label as string} className="rounded-md bg-raised py-2">
                    <dd className="num text-[15px]">{value}</dd>
                    <dt className="text-[10px] text-muted">{label}</dt>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PortalProfile({ clientId, canEdit }: Props & { canEdit: boolean }) {
  const settings = trpc.portal.settings.useQuery({ clientId });
  const utils = trpc.useUtils();
  const update = trpc.portal.updateProfile.useMutation({ onSuccess: () => utils.portal.settings.invalidate() });
  if (settings.isPending) return <Loading />;
  if (settings.error) return <ErrorNote error={settings.error} />;
  const s = settings.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Your business</h1>
        <p className="text-micro text-muted">This is what we tell prospects about you. Keep it accurate — every email is checked against it.</p>
      </div>
      <div className="card p-5">
        {canEdit ? (
          <ClientProfileForm initial={profileValuesFrom(s, false)} internal={false} submitLabel="Save changes" pending={update.isPending} error={update.error}
                             onSubmit={(v) => update.mutate({ clientId, data: profilePayload(v) })} />
        ) : (
          <div className="text-micro space-y-2">
            <p className="text-[13px]">{s.description ?? 'No description yet.'}</p>
            {s.productsServices.length > 0 && <p><span className="text-muted">Products and services:</span> {s.productsServices.join(', ')}</p>}
            {s.serviceAreas.length > 0 && <p><span className="text-muted">Service areas:</span> {s.serviceAreas.join(', ')}</p>}
            <p className="text-[11px] text-muted">Ask your company&apos;s admin on Relay to make changes.</p>
          </div>
        )}
        {update.isSuccess && <p className="text-[12px] text-cleared mt-2">Saved.</p>}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Section title="What we offer prospects">
          <ul className="card divide-y divide-hairline">
            {s.offers.map((o) => <li key={o.id} className="p-3 text-micro"><p className="font-medium">{o.name}</p><p className="text-muted">{o.summary}</p></li>)}
            {!s.offers.length && <li className="p-3 text-micro text-muted">Being set up.</li>}
          </ul>
        </Section>
        <Section title="Who we target">
          <ul className="card divide-y divide-hairline">
            {s.icps.map((i) => (
              <li key={i.id} className="p-3 text-micro">
                <p className="font-medium">{i.name}</p>
                <p className="text-muted">{[i.industries.join(', '), i.locations.join(', '), i.targetTitles.slice(0, 4).join(', ')].filter(Boolean).join(' · ')}</p>
              </li>
            ))}
            {!s.icps.length && <li className="p-3 text-micro text-muted">Being set up.</li>}
          </ul>
        </Section>
      </div>

      <Section title="Claims we may make about you" hint="Only approved statements are ever used in outreach. Tell us if anything is out of date.">
        <ul className="card divide-y divide-hairline">
          {s.proofPoints.map((p) => (
            <li key={p.id} className="p-3 text-micro flex items-start gap-2">
              <span className="flex-1"><span className="font-medium">{p.title}.</span> {p.statement}</span>
              <Pill tone={p.approvedForOutreach ? 'positive' : 'neutral'}>{p.approvedForOutreach ? 'in use' : 'not yet approved'}</Pill>
            </li>
          ))}
          {!s.proofPoints.length && <li className="p-3 text-micro text-muted">None yet.</li>}
        </ul>
      </Section>

      <Section title="Your team on Relay">
        <ul className="card divide-y divide-hairline">
          {s.memberships.map((m) => (
            <li key={m.user.email} className="p-3 text-micro flex gap-2">
              <span className="flex-1">{[m.user.firstName, m.user.lastName].filter(Boolean).join(' ') || m.user.email}</span>
              <span className="text-muted">{m.role === 'CLIENT_ADMIN' ? 'Admin' : 'Member'}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
