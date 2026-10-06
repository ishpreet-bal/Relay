'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CalendarCheck, ExternalLink } from 'lucide-react';
import type { MeetingOutcome, MeetingStatus } from '@prisma/client';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/types';
import { useActiveClient } from '@/components/shell/active-client';
import { MEETING_OUTCOMES, MEETING_OUTCOME_LABELS, MEETING_STATUSES, MEETING_STATUS_LABELS, personName } from '@/lib/domain';
import { Topbar } from '@/components/shell/topbar';
import { PageBody } from '@/components/ui/page';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { EmptyState, ErrorNote, Loading } from '@/components/ui/states';
import { DateTime } from '@/components/ui/time';
import { MeetingOutcomePill, MeetingStatusPill } from '@/components/domain/pills';
import { cn, formatMoney } from '@/lib/utils';

type Meeting = RouterOutputs['meetings']['list'][number];

/**
 * Meetings are the product. Every one records how it was booked and, after
 * it happens, whether it was attended and what it turned into — which is
 * what the funnel and the client's portal report on.
 */
export function MeetingsList({ canWrite, initialRange = 'upcoming' }: { canWrite: boolean; initialRange?: 'upcoming' | 'past' | 'all' }) {
  const { clientId } = useActiveClient();
  const [range, setRange] = useState<'upcoming' | 'past' | 'all'>(initialRange);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const meetings = trpc.meetings.list.useQuery({ clientId, range });

  const needsOutcome = (m: Meeting) => m.startsAt < new Date() && (m.status === 'BOOKED' || m.status === 'CONFIRMED' || m.status === 'RESCHEDULED');

  return (
    <>
      <Topbar title="Meetings" />
      <PageBody>
        <div role="group" aria-label="Range" className="inline-flex rounded-md border border-hairline overflow-hidden mb-5">
          {(['upcoming', 'past', 'all'] as const).map((r) => (
            <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}
                    className={cn('h-8 px-3 text-micro capitalize', range === r ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-raised')}>{r}</button>
          ))}
        </div>
        <ErrorNote error={meetings.error} />
        {meetings.isPending ? <Loading /> : !meetings.data?.length ? (
          <EmptyState icon={CalendarCheck} title={range === 'upcoming' ? 'No upcoming meetings' : 'No meetings'}>
            Meetings are booked from the call workspace, or recorded when a prospect replies asking for a time.
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {meetings.data.map((m) => (
              <li key={m.id} className={cn('card p-4', needsOutcome(m) && 'border-held/50')}>
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <div className="sm:w-40 shrink-0">
                    <p className="text-[13px] font-medium"><DateTime date={m.startsAt} pattern="EEE d MMM" /></p>
                    <p className="text-micro text-muted"><DateTime date={m.startsAt} pattern="h:mm a" /> · {Math.round((m.endsAt.getTime() - m.startsAt.getTime()) / 60000)} min</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium">
                      <Link href={`/accounts/${m.account.id}`} className="hover:text-accent">{m.account.name}</Link>
                      {m.contact && <span className="text-muted font-normal"> · {personName(m.contact)}{m.contact.title && `, ${m.contact.title}`}</span>}
                    </p>
                    <p className="text-[11px] text-muted">
                      {m.client.name} · booked {m.source.toLowerCase().replace(/_/g, ' ')}{m.bookedBy && ` by ${m.bookedBy.firstName ?? ''}`}
                      {m.campaign && ` · ${m.campaign.name}`}
                      {m.estimatedValueCents ? ` · est. ${formatMoney(m.estimatedValueCents)}` : ''}
                    </p>
                    {m.qualificationNotes && <p className="text-micro mt-1.5">{m.qualificationNotes}</p>}
                    {m.notes && <p className="text-[11px] text-muted mt-1">Internal: {m.notes}</p>}
                    {needsOutcome(m) && <p className="text-[11px] text-held mt-1.5">This meeting has passed. Record whether it happened and how it went.</p>}
                  </div>
                  <div className="flex sm:flex-col items-center sm:items-end gap-1.5">
                    <MeetingStatusPill status={m.status} />
                    {m.outcome !== 'PENDING' && <MeetingOutcomePill outcome={m.outcome} />}
                    {m.meetingUrl && <a href={m.meetingUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-accent inline-flex items-center gap-0.5">Join<ExternalLink className="size-3" /></a>}
                    {canWrite && <button type="button" className="btn-ghost h-7 text-[11px]" onClick={() => setEditing(m)}>Update</button>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PageBody>
      {editing && <UpdateDialog meeting={editing} onClose={() => { setEditing(null); meetings.refetch(); }} />}
    </>
  );
}

function UpdateDialog({ meeting: m, onClose }: { meeting: Meeting; onClose: () => void }) {
  const [status, setStatus] = useState<MeetingStatus>(m.status);
  const [outcome, setOutcome] = useState<MeetingOutcome>(m.outcome);
  const [qualificationNotes, setQualification] = useState(m.qualificationNotes ?? '');
  const [notes, setNotes] = useState(m.notes ?? '');
  const [actualValue, setActualValue] = useState(m.actualValueCents ? String(m.actualValueCents / 100) : '');
  const [cancelledReason, setCancelledReason] = useState('');
  const update = trpc.meetings.update.useMutation({ onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Update meeting" description={`${m.account.name}${m.contact ? ` · ${personName(m.contact)}` : ''}`}>
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        update.mutate({
          id: m.id,
          data: {
            status, outcome, qualificationNotes: qualificationNotes || null, notes: notes || null,
            actualValueCents: actualValue ? Math.round(Number(actualValue) * 100) : null,
            ...(status === 'CANCELLED' ? { cancelledReason: cancelledReason || null } : {}),
          },
        });
      }}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            {(id) => <select id={id} className="input" value={status} onChange={(e) => setStatus(e.target.value as MeetingStatus)}>{MEETING_STATUSES.map((s) => <option key={s} value={s}>{MEETING_STATUS_LABELS[s]}</option>)}</select>}
          </Field>
          <Field label="Outcome">
            {(id) => <select id={id} className="input" value={outcome} onChange={(e) => setOutcome(e.target.value as MeetingOutcome)}>{MEETING_OUTCOMES.map((o) => <option key={o} value={o}>{MEETING_OUTCOME_LABELS[o]}</option>)}</select>}
          </Field>
        </div>
        {status === 'CANCELLED' && <Field label="Why was it cancelled?">{(id) => <input id={id} className="input" value={cancelledReason} onChange={(e) => setCancelledReason(e.target.value)} />}</Field>}
        <Field label="Notes for the client" hint="Visible in the client's portal.">{(id) => <textarea id={id} rows={3} className="input h-auto py-2" value={qualificationNotes} onChange={(e) => setQualification(e.target.value)} />}</Field>
        <Field label="Internal notes" hint="Only Relay staff see these.">{(id) => <textarea id={id} rows={2} className="input h-auto py-2" value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
        {outcome === 'WON' && <Field label="Deal value">{(id) => <input id={id} type="number" min={0} className="input" value={actualValue} onChange={(e) => setActualValue(e.target.value)} />}</Field>}
        <ErrorNote error={update.error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={update.isPending}>Save</button>
        </div>
      </form>
    </Dialog>
  );
}
