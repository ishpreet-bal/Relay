'use client';

import { useState } from 'react';
import { CalendarCheck, Inbox, Mail, Phone, Globe } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/types';
import { Topbar } from '@/components/shell/topbar';
import { PageBody } from '@/components/ui/page';
import { Pill, type Tone } from '@/components/ui/pill';
import { EmptyState, ErrorNote, Loading } from '@/components/ui/states';
import { Ago } from '@/components/ui/time';
import { cn } from '@/lib/utils';
import { CATEGORIES, CATEGORY_LABELS, SERVICE_CHOICES } from '@/site/inquiry';
import { formatSlot } from '@/site/consultation';

type Inquiry = RouterOutputs['inquiries']['list']['items'][number];

const STATUSES = ['NEW', 'CONTACTED', 'BOOKED', 'QUALIFIED', 'CLOSED', 'SPAM'] as const;
const STATUS_LABEL: Record<string, string> = { NEW: 'New', CONTACTED: 'Contacted', BOOKED: 'Consultation booked', QUALIFIED: 'Qualified', CLOSED: 'Closed', SPAM: 'Spam' };
const STATUS_TONE: Record<string, Tone> = { NEW: 'accent', CONTACTED: 'neutral', BOOKED: 'positive', QUALIFIED: 'positive', CLOSED: 'neutral', SPAM: 'negative' };
const CATEGORY_TONE: Record<string, Tone> = { AUTOMATION: 'accent', ACQUISITION: 'warning', WEBSITE: 'positive', GENERAL: 'neutral' };

/**
 * Inquiries and consultation requests from the public website. Each one is
 * already an account and contact with a follow-up task; booking a time the
 * visitor suggested creates the meeting. Replies are sent by a person.
 */
export function WebsiteInquiries({ canEdit, canBook }: { canEdit: boolean; canBook: boolean }) {
  const [status, setStatus] = useState<(typeof STATUSES)[number] | null>('NEW');
  const list = trpc.inquiries.list.useQuery({ status, limit: 100 });
  const counts = list.data?.counts ?? {};
  return (
    <>
      <Topbar title="Website inquiries" />
      <PageBody width="wide" className="space-y-4">
        <p className="text-micro text-muted max-w-3xl">
          Sent through the contact form on the public website. Each inquiry becomes an account and a contact, with a task to reply. An inquiry is implied
          consent to reply and follow up about it for six months; marketing beyond that needs the opt-in, which is recorded when the visitor ticks it.
        </p>
        <div role="tablist" aria-label="Inquiry status" className="flex flex-wrap gap-1">
          <button type="button" role="tab" aria-selected={status === null} onClick={() => setStatus(null)} className={cn('btn-ghost h-8 text-micro', status === null && 'bg-raised text-ink')}>All but spam</button>
          {STATUSES.map((s) => (
            <button key={s} type="button" role="tab" aria-selected={status === s} onClick={() => setStatus(s)} className={cn('btn-ghost h-8 text-micro', status === s && 'bg-raised text-ink')}>
              {STATUS_LABEL[s]} <span className="num text-muted">{counts[s] ?? 0}</span>
            </button>
          ))}
        </div>
        <ErrorNote error={list.error} />
        {list.isPending ? <Loading /> : !list.data?.items.length ? (
          <EmptyState icon={Inbox} title={status ? `No ${STATUS_LABEL[status]!.toLowerCase()} inquiries` : 'No inquiries yet'}>
            Inquiries from the website&apos;s contact page appear here.
          </EmptyState>
        ) : (
          <ul className="space-y-2">{list.data.items.map((q) => <InquiryRow key={q.id} inquiry={q} canEdit={canEdit} canBook={canBook} />)}</ul>
        )}
      </PageBody>
    </>
  );
}

function InquiryRow({ inquiry: q, canEdit, canBook }: { inquiry: Inquiry; canEdit: boolean; canBook: boolean }) {
  const [open, setOpen] = useState(q.status === 'NEW');
  const utils = trpc.useUtils();
  const update = trpc.inquiries.update.useMutation({ onSuccess: () => utils.inquiries.list.invalidate() });
  const book = trpc.inquiries.book.useMutation({ onSuccess: () => utils.inquiries.list.invalidate() });
  const link = trpc.inquiries.link.useMutation({ onSuccess: () => utils.inquiries.list.invalidate() });
  const times = (q.preferredTimes as string[] | null) ?? [];
  const service = SERVICE_CHOICES.find((s) => s.value === q.service)?.label ?? q.service;
  return (
    <li className="card">
      <button type="button" className="w-full p-3 flex flex-wrap items-center gap-2 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="flex-1 min-w-[220px]">
          <span className="text-[13px] font-medium">{q.name}</span><span className="text-micro text-muted"> · {q.company}</span>
          <span className="block text-micro text-muted truncate">{q.message}</span>
        </span>
        <Pill tone={CATEGORY_TONE[q.category] ?? 'neutral'} title={q.categorySource === 'inferred' ? 'Worked out from the message' : q.categorySource === 'staff' ? 'Set by a person' : 'Chosen by the visitor'}>
          {CATEGORY_LABELS[q.category as keyof typeof CATEGORY_LABELS] ?? q.category}
        </Pill>
        {times.length > 0 && <Pill tone="warning"><CalendarCheck className="size-3" />{times.length} time{times.length === 1 ? '' : 's'} offered</Pill>}
        <Pill tone={STATUS_TONE[q.status] ?? 'neutral'}>{STATUS_LABEL[q.status] ?? q.status}</Pill>
        <span className="text-[11px] text-muted">received <Ago date={q.createdAt} /></span>
      </button>
      {open && (
        <div className="border-t border-hairline p-3 grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4">
          <div className="space-y-3">
            <p className="text-[13px] whitespace-pre-wrap leading-relaxed">{q.message}</p>
            <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-micro">
              <div><dt className="text-muted inline">Interested in </dt><dd className="inline">{service}</dd></div>
              {q.industry && <div><dt className="text-muted inline">Industry </dt><dd className="inline">{q.industry}</dd></div>}
              <div><dt className="text-muted inline">Updates by email </dt><dd className="inline">{q.marketingConsent ? 'Opted in' : 'Not opted in'}</dd></div>
              {q.sourcePath && <div><dt className="text-muted inline">Sent from </dt><dd className="inline num">{q.sourcePath}</dd></div>}
            </dl>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-micro">
              <a className="inline-flex items-center gap-1 text-accent hover:underline" href={`mailto:${q.email}`}><Mail className="size-3.5" />{q.email}</a>
              {q.phone && <a className="inline-flex items-center gap-1 text-accent hover:underline" href={`tel:${q.phone}`}><Phone className="size-3.5" />{q.phone}</a>}
              {q.website && <a className="inline-flex items-center gap-1 text-accent hover:underline" href={/^https?:/.test(q.website) ? q.website : `https://${q.website}`} target="_blank" rel="noopener noreferrer"><Globe className="size-3.5" />{q.website}</a>}
            </p>
            {q.spamReason && <p className="text-[11px] text-blocked">Held as likely spam: {q.spamReason}. Mark it as new if it is genuine.</p>}
            {q.accountId ? <a href={`/accounts/${q.accountId}`} className="text-micro text-accent hover:underline">Open the account</a> : canEdit && (
              <div>
                <button type="button" className="btn-outline h-8 text-micro" disabled={link.isPending} onClick={() => link.mutate({ id: q.id })}>
                  {link.isPending ? 'Adding…' : q.status === 'SPAM' ? 'Not spam: add to the CRM' : 'Add to the CRM'}
                </button>
                <ErrorNote error={link.error} className="mt-2" />
              </div>
            )}
          </div>
          <div className="space-y-3">
            {times.length > 0 && (
              <div>
                <p className="eyebrow mb-1.5">Times the visitor suggested</p>
                <ul className="space-y-1.5">
                  {times.map((t) => (
                    <li key={t} className="flex items-center justify-between gap-2 text-micro">
                      <span className="num">{formatSlot(t)}</span>
                      {canBook && !q.meetingId && q.accountId && (
                        <button type="button" className="btn-outline h-7 text-[11px]" disabled={book.isPending} onClick={() => book.mutate({ id: q.id, startsAt: t })}>Book this time</button>
                      )}
                    </li>
                  ))}
                </ul>
                {q.meetingId && <p className="text-[11px] text-cleared mt-1.5">Consultation booked. It is on the Meetings page.</p>}
                <ErrorNote error={book.error} className="mt-2" />
              </div>
            )}
            {canEdit && (
              <div className="grid grid-cols-2 gap-2">
                <label className="text-micro"><span className="text-muted">Status</span>
                  <select className="input mt-1 h-8 text-micro" value={q.status} onChange={(e) => update.mutate({ id: q.id, status: e.target.value as (typeof STATUSES)[number] })}>
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </label>
                <label className="text-micro"><span className="text-muted">Category</span>
                  <select className="input mt-1 h-8 text-micro" value={q.category} onChange={(e) => update.mutate({ id: q.id, category: e.target.value as (typeof CATEGORIES)[number] })}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                  </select>
                </label>
              </div>
            )}
            <ErrorNote error={update.error} />
            <p className="text-[11px] text-muted">Reply from your own mailbox. Nothing is sent automatically.</p>
          </div>
        </div>
      )}
    </li>
  );
}
