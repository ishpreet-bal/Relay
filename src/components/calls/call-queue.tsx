'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatDistanceToNowStrict, isPast } from 'date-fns';
import { ArrowRight, CalendarClock, MessageSquareReply, PhoneCall, Radio, RefreshCw, Sparkles, Star, UserPlus } from 'lucide-react';
import type { CallTaskCategory } from '@prisma/client';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/types';
import { useActiveClient } from '@/components/shell/active-client';
import { QUEUE_CATEGORY_LABELS, personName } from '@/lib/domain';
import { Topbar } from '@/components/shell/topbar';
import { PageBody, Section } from '@/components/ui/page';
import { EmptyState, ErrorNote, Loading } from '@/components/ui/states';
import { DateTime } from '@/components/ui/time';
import { cn } from '@/lib/utils';

type Task = RouterOutputs['calls']['queue']['items'][number];
interface Reason { code: string; label: string; points: number }

const SECTIONS: Array<{ category: CallTaskCategory; title: string; hint: string; icon: typeof PhoneCall }> = [
  { category: 'CALLBACK_DUE', title: 'Callbacks due', hint: 'They asked you to call back. Keep the promise.', icon: CalendarClock },
  { category: 'REPLIED', title: 'Replied to an email', hint: 'A reply is the warmest reason to call.', icon: MessageSquareReply },
  { category: 'ENGAGED', title: 'Engaged', hint: 'Opened or clicked recently, or had a good conversation.', icon: Sparkles },
  { category: 'SIGNAL', title: 'Fresh signals', hint: 'Something just happened at the company.', icon: Radio },
  { category: 'HIGH_FIT', title: 'New high-fit accounts', hint: 'Strong match to the profile, not yet called.', icon: Star },
  { category: 'MANUAL', title: 'Added by hand', hint: 'Queued by someone on the team.', icon: UserPlus },
];

export function CallQueue({ canAssign }: { canAssign: boolean }) {
  const { clientId } = useActiveClient();
  const [assignee, setAssignee] = useState<'me' | 'unassigned' | 'all'>('me');
  const queue = trpc.calls.queue.useQuery({ clientId, assignee }, { refetchInterval: 60_000 });
  const utils = trpc.useUtils();
  const refresh = trpc.calls.refresh.useMutation({ onSuccess: () => utils.calls.queue.invalidate() });

  const items = queue.data?.items ?? [];
  const next = items[0];
  const rest = items.slice(1);

  return (
    <>
      <Topbar title="Call queue"
              actions={
                <button type="button" className="btn-ghost h-8 text-micro" disabled={refresh.isPending} onClick={() => refresh.mutate({ clientId })} title="Recompute priorities now">
                  <RefreshCw className={cn('size-3.5', refresh.isPending && 'animate-spin')} /> Refresh
                </button>
              } />
      <PageBody>
        <div className="flex flex-wrap items-center gap-2 mb-5">
          {canAssign && (
            <div role="group" aria-label="Whose calls" className="flex rounded-md border border-hairline overflow-hidden">
              {(['me', 'unassigned', 'all'] as const).map((a) => (
                <button key={a} type="button" aria-pressed={assignee === a} onClick={() => setAssignee(a)}
                        className={cn('h-8 px-3 text-micro', assignee === a ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-raised')}>
                  {a === 'me' ? 'Mine + unassigned' : a === 'unassigned' ? 'Unassigned' : 'Everyone'}
                </button>
              ))}
            </div>
          )}
          <span className="flex-1" />
          {queue.data && (
            <p className="text-micro text-muted"><span className="num text-ink">{items.length}</span> to call{queue.data.snoozed > 0 && <> · {queue.data.snoozed} snoozed</>}</p>
          )}
        </div>

        <ErrorNote error={queue.error ?? refresh.error} />
        {queue.isPending ? <Loading label="Building your queue…" /> : !items.length ? (
          <EmptyState icon={PhoneCall} title="No calls waiting">
            The queue fills itself from replies, engagement, fresh signals, callbacks and high-fit accounts with a phone number.
            It refreshes every hour; use Refresh to recompute now.
          </EmptyState>
        ) : (
          <div className="space-y-8">
            {next && <CallNext task={next} />}
            {SECTIONS.map((s) => {
              const group = rest.filter((t) => t.category === s.category);
              if (!group.length) return null;
              const Icon = s.icon;
              return (
                <Section key={s.category} title={`${s.title} (${group.length})`} hint={s.hint}>
                  <ul className="card divide-y divide-hairline">
                    {group.map((t) => <QueueRow key={t.id} task={t} icon={Icon} />)}
                  </ul>
                </Section>
              );
            })}
          </div>
        )}

        {!!queue.data?.upcomingCallbacks.length && (
          <Section title="Scheduled callbacks" className="mt-8">
            <ul className="card divide-y divide-hairline">
              {queue.data.upcomingCallbacks.map((t) => (
                <li key={t.id} className="px-4 py-2.5 flex items-center gap-3 text-micro">
                  <CalendarClock className="size-3.5 text-muted" />
                  <Link href={`/calls/${t.contact.id}`} className="flex-1 truncate hover:text-accent">{personName(t.contact)} · {t.account.name}</Link>
                  <DateTime date={t.dueAt} className="text-muted" />
                </li>
              ))}
            </ul>
          </Section>
        )}
      </PageBody>
    </>
  );
}

function phoneOf(t: Task) {
  return t.contact.directPhone ?? t.contact.mobilePhone ?? t.contact.phone ?? t.account.phone;
}

function CallNext({ task: t }: { task: Task }) {
  const reasons = (t.reasons ?? []) as unknown as Reason[];
  const phone = phoneOf(t);
  return (
    <section aria-labelledby="call-next" className="card p-5 border-accent/40">
      <p id="call-next" className="eyebrow text-accent mb-2">Call next</p>
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold">{personName(t.contact)}</h2>
          <p className="text-micro text-muted">
            {t.contact.title ?? 'No title'} · <Link href={`/accounts/${t.account.id}`} className="hover:text-accent">{t.account.name}</Link>
            {(t.account.city || t.account.region) && <> · {[t.account.city, t.account.region].filter(Boolean).join(', ')}</>}
            {' · '}{t.client.name}
          </p>
          <p className="text-micro mt-3 font-medium">Why now</p>
          <ul className="mt-1 space-y-0.5">
            {reasons.slice(0, 4).map((r, i) => <li key={i} className="text-[13px] flex items-start gap-1.5"><ArrowRight className="size-3.5 mt-0.5 text-accent shrink-0" />{r.label}</li>)}
          </ul>
        </div>
        <div className="flex flex-col gap-2 sm:items-end shrink-0">
          {phone && <a href={`tel:${phone}`} className="num text-[15px] hover:text-accent">{phone}</a>}
          <p className="text-[11px] text-muted">{t.contact.callAttempts ? `${t.contact.callAttempts} previous attempt${t.contact.callAttempts === 1 ? '' : 's'}` : 'First call'}</p>
          <Link href={`/calls/${t.contact.id}`} className="btn-primary"><PhoneCall className="size-4" /> Open call prep</Link>
        </div>
      </div>
    </section>
  );
}

function QueueRow({ task: t, icon: Icon }: { task: Task; icon: typeof PhoneCall }) {
  const reasons = (t.reasons ?? []) as unknown as Reason[];
  const overdue = t.dueAt && isPast(t.dueAt);
  return (
    <li>
      <Link href={`/calls/${t.contact.id}`} className="px-4 py-3 flex items-start gap-3 hover:bg-raised/60">
        <Icon className="size-4 text-muted shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium truncate">{personName(t.contact)} <span className="text-muted font-normal">· {t.account.name}</span></p>
          <p className="text-[11px] text-muted truncate">{reasons.slice(0, 2).map((r) => r.label).join(' · ') || QUEUE_CATEGORY_LABELS[t.category]}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="num text-[12px]">{t.priority}</p>
          {t.dueAt && <p className={cn('text-[11px]', overdue ? 'text-blocked' : 'text-muted')}>{overdue ? 'due ' : ''}{formatDistanceToNowStrict(t.dueAt, { addSuffix: true })}</p>}
          {t.assignee && <p className="text-[11px] text-muted">{t.assignee.firstName}</p>}
        </div>
      </Link>
    </li>
  );
}
