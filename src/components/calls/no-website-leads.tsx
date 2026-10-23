'use client';

import { useState } from 'react';
import { ExternalLink, Phone, Store } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/types';
import { useActiveClient } from '@/components/shell/active-client';
import { Topbar } from '@/components/shell/topbar';
import { PageBody } from '@/components/ui/page';
import { Pill, type Tone } from '@/components/ui/pill';
import { Field } from '@/components/ui/field';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorNote, Loading } from '@/components/ui/states';
import { Ago, DateTime } from '@/components/ui/time';
import { cn } from '@/lib/utils';

type Lead = RouterOutputs['callLeads']['list']['items'][number];
type Listing = RouterOutputs['callLeads']['listing'];

const STATUSES = ['NEW', 'CALLBACK', 'CALLED', 'INTERESTED', 'NOT_INTERESTED', 'DO_NOT_CALL', 'CONVERTED'] as const;
const STATUS_LABEL: Record<string, string> = {
  NEW: 'New', CALLBACK: 'Call back', CALLED: 'Called', INTERESTED: 'Interested', NOT_INTERESTED: 'Not interested', DO_NOT_CALL: 'Do not call', CONVERTED: 'Account',
};
const STATUS_TONE: Record<string, Tone> = { NEW: 'neutral', CALLBACK: 'warning', CALLED: 'neutral', INTERESTED: 'positive', NOT_INTERESTED: 'neutral', DO_NOT_CALL: 'negative', CONVERTED: 'positive' };
const REASON_LABEL: Record<string, string> = { NO_WEBSITE: 'No website', SOCIAL_ONLY: 'Social page only', SITE_UNREACHABLE: 'Site did not load' };
const OUTCOMES = [
  ['NO_ANSWER', 'No answer'], ['LEFT_MESSAGE', 'Left a message'], ['CALLBACK', 'Call back later'], ['INTERESTED', 'Interested'],
  ['NOT_INTERESTED', 'Not interested'], ['DO_NOT_CALL', 'Asked not to be called'],
] as const;

/**
 * Businesses discovery found without a website of their own. Relay keeps
 * only each listing's Google id; opening a lead looks the listing up live.
 */
export function NoWebsiteLeads({ canLog, canConvert }: { canLog: boolean; canConvert: boolean }) {
  const { clientId } = useActiveClient();
  const [status, setStatus] = useState<(typeof STATUSES)[number] | null>('NEW');
  const list = trpc.callLeads.list.useQuery({ clientId, status, limit: 100 });
  const counts = list.data?.counts ?? {};
  return (
    <>
      <Topbar title="No-website leads" />
      <PageBody width="wide" className="space-y-4">
        <p className="text-micro text-muted max-w-3xl">
          Businesses found by discovery with no website of their own: none listed, only a social media page, or a site that didn&apos;t load.
          They can&apos;t be researched from a website, but they may need one, along with online booking, quote requests and a steady way to win customers.
          Google&apos;s terms let Relay keep only each listing&apos;s ID, so the name, phone number and address are looked up live when you open a lead.
          That is a billed Google lookup of about 2–3¢, counted in the discovery budget.
        </p>
        <p className="text-[11px] text-muted max-w-3xl">
          Calls to businesses are outside the National Do Not Call List, but the CRTC&apos;s telemarketing rules still apply: say who you are and that you are calling for Relay,
          and if they ask not to be called, choose <span className="text-ink">Asked not to be called</span>. Relay then never shows that business again.
        </p>

        <div role="tablist" aria-label="Lead status" className="flex flex-wrap gap-1">
          <button type="button" role="tab" aria-selected={status === null} onClick={() => setStatus(null)} className={cn('btn-ghost h-8 text-micro', status === null && 'bg-raised text-ink')}>All</button>
          {STATUSES.map((s) => (
            <button key={s} type="button" role="tab" aria-selected={status === s} onClick={() => setStatus(s)} className={cn('btn-ghost h-8 text-micro', status === s && 'bg-raised text-ink')}>
              {STATUS_LABEL[s]} <span className="num text-muted">{counts[s] ?? 0}</span>
            </button>
          ))}
        </div>

        <ErrorNote error={list.error} />
        {list.isPending ? <Loading /> : !list.data?.items.length ? (
          <EmptyState icon={Store} title={status ? `No ${STATUS_LABEL[status]!.toLowerCase()} leads` : 'No leads yet'}>
            Discovery adds a business here whenever it finds one without a website of its own.
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {list.data.items.map((lead) => <LeadRow key={lead.id} lead={lead} canLog={canLog} canConvert={canConvert} />)}
          </ul>
        )}
      </PageBody>
    </>
  );
}

function LeadRow({ lead, canLog, canConvert }: { lead: Lead; canLog: boolean; canConvert: boolean }) {
  const [open, setOpen] = useState(false);
  const [listing, setListing] = useState<Listing | null>(null);
  const [converting, setConverting] = useState(false);
  const lookup = trpc.callLeads.listing.useMutation({ onSuccess: setListing });
  const blocked = lead.status === 'DO_NOT_CALL';
  return (
    <li className="card">
      <button type="button" className="w-full p-3 flex flex-wrap items-center gap-2 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="flex-1 min-w-[200px]">
          <span className="text-[13px] font-medium capitalize">{lead.searchTerm ?? 'Business'}</span>
          <span className="text-micro text-muted">{lead.searchCity ? ` · ${lead.searchCity}` : ''}</span>
          {listing?.listing.name && <span className="block text-micro">{listing.listing.name}</span>}
        </span>
        <Pill>{REASON_LABEL[lead.reason] ?? lead.reason}</Pill>
        <Pill tone={STATUS_TONE[lead.status] ?? 'neutral'}>{STATUS_LABEL[lead.status] ?? lead.status}</Pill>
        {lead.callbackAt && <span className="text-[11px] text-held">call back <DateTime date={lead.callbackAt} /></span>}
        <span className="text-[11px] text-muted">{lead.calls ? `${lead.calls} call${lead.calls === 1 ? '' : 's'} · ` : ''}added <Ago date={lead.createdAt} /></span>
      </button>

      {open && (
        <div className="border-t border-hairline p-3 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
          <div className="space-y-3">
            {!listing ? (
              <div>
                <button type="button" className="btn-outline h-8 text-micro" disabled={blocked || lookup.isPending} onClick={() => lookup.mutate({ id: lead.id })}>
                  {lookup.isPending ? 'Looking up…' : 'Show listing'}
                </button>
                {blocked && <p className="text-[11px] text-muted mt-1">This business asked not to be called.</p>}
                <ErrorNote error={lookup.error} className="mt-2" />
              </div>
            ) : <ListingCard listing={listing} />}
            {lead.notes && <pre className="text-[11px] text-muted whitespace-pre-wrap font-sans">{lead.notes}</pre>}
            {lead.status === 'CONVERTED' && lead.accountId && <a href={`/accounts/${lead.accountId}`} className="text-micro text-accent hover:underline">Open the account</a>}
          </div>

          <div className="space-y-3">
            <TalkingPoints lead={lead} name={listing?.listing.name ?? null} />
            {canLog && !blocked && lead.status !== 'CONVERTED' && <LogCall lead={lead} />}
            {canConvert && !blocked && lead.status !== 'CONVERTED' && (
              <button type="button" className="btn-primary h-8 text-micro" onClick={() => setConverting(true)}>Interested: make it an account</button>
            )}
          </div>
        </div>
      )}
      {converting && <ConvertDialog lead={lead} suggestedName={listing?.listing.name ?? ''} suggestedPhone={listing?.listing.phone ?? ''} onClose={() => setConverting(false)} />}
    </li>
  );
}

function ListingCard({ listing: { listing, attribution } }: { listing: Listing }) {
  return (
    <div className="rounded-card border border-hairline p-3 text-micro space-y-1">
      <p className="text-[13px] font-medium">{listing.name ?? 'Unnamed listing'}</p>
      {listing.category && <p className="text-muted">{listing.category}</p>}
      {listing.phone && <a href={`tel:${listing.internationalPhone ?? listing.phone}`} className="inline-flex items-center gap-1 text-accent hover:underline"><Phone className="size-3.5" />{listing.phone}</a>}
      {listing.address && <p>{listing.address}</p>}
      {listing.rating !== null && <p className="text-muted">Rated {listing.rating.toFixed(1)} from {listing.ratingCount ?? 0} reviews</p>}
      {listing.websiteUrl && <p className="text-held">The listing now shows a website: {listing.websiteUrl}</p>}
      {listing.businessStatus && listing.businessStatus !== 'OPERATIONAL' && <p className="text-blocked">Google marks this business {listing.businessStatus.toLowerCase().replace(/_/g, ' ')}.</p>}
      <p className="text-[10px] text-muted pt-1 flex items-center gap-1">
        {attribution} · <a href={listing.mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 hover:text-ink">Open in Google Maps<ExternalLink className="size-3" /></a>
      </p>
    </div>
  );
}

/** A short, honest script: what we noticed, what we could do, what to ask. */
function TalkingPoints({ lead, name }: { lead: Lead; name: string | null }) {
  const business = name ?? 'the business';
  const kind = lead.searchTerm ?? 'business';
  const noticed = lead.reason === 'SOCIAL_ONLY' ? 'its listing links to a social media page rather than a website'
    : lead.reason === 'SITE_UNREACHABLE' ? 'the website on its listing did not load when we checked'
    : 'there is no website on its Google listing';
  return (
    <div className="rounded-card bg-raised/50 p-3 text-micro space-y-2">
      <p className="eyebrow">Talking points</p>
      <p>&ldquo;Hi, this is [your name] calling from Relay. I came across {business} on Google Maps and noticed {noticed}. Is the owner or manager available?&rdquo;</p>
      <p className="text-muted">What Relay could offer a {kind}: a simple website with online booking or quote requests that we set up and look after, automatic reminders and follow-up, and a steady way to find new customers.</p>
      <ul className="list-disc pl-4 text-muted space-y-0.5">
        <li>How do new customers usually find you today?</li>
        <li>How do people book, order or ask for a quote, and who handles it?</li>
        <li>Have you thought about a website or online booking? What has held it back?</li>
        <li>If one thing took less of your time each week, what would it be?</li>
      </ul>
    </div>
  );
}

function LogCall({ lead }: { lead: Lead }) {
  const utils = trpc.useUtils();
  const [outcome, setOutcome] = useState<(typeof OUTCOMES)[number][0]>('NO_ANSWER');
  const [notes, setNotes] = useState('');
  const [callbackAt, setCallbackAt] = useState('');
  const log = trpc.callLeads.logCall.useMutation({ onSuccess: () => { setNotes(''); setCallbackAt(''); void utils.callLeads.list.invalidate(); } });
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); log.mutate({ id: lead.id, outcome, notes: notes || null, callbackAt: callbackAt ? new Date(callbackAt) : null }); }}>
      <div className="grid sm:grid-cols-2 gap-2">
        <Field label="Call outcome">
          {(id) => (
            <select id={id} className="input" value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)}>
              {OUTCOMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          )}
        </Field>
        {outcome === 'CALLBACK' && (
          <Field label="Call back on">{(id) => <input id={id} type="datetime-local" className="input" value={callbackAt} onChange={(e) => setCallbackAt(e.target.value)} required />}</Field>
        )}
      </div>
      <Field label="Notes">{(id) => <textarea id={id} className="input min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Who you spoke to, what they said" />}</Field>
      <button type="submit" className="btn-outline h-8 text-micro" disabled={log.isPending}>Log call</button>
      <ErrorNote error={log.error} />
    </form>
  );
}

function ConvertDialog({ lead, suggestedName, suggestedPhone, onClose }: { lead: Lead; suggestedName: string; suggestedPhone: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [f, setF] = useState({ name: suggestedName, phone: suggestedPhone, contactFirstName: '', contactLastName: '', contactTitle: '', contactEmail: '', agreedToEmail: false });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: k === 'agreedToEmail' ? e.target.checked : e.target.value });
  const convert = trpc.callLeads.convert.useMutation({ onSuccess: (r) => { void utils.callLeads.list.invalidate(); window.location.href = `/accounts/${r.accountId}`; } });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Make it an account"
            description="Use what the business told you on the call. Check the name and number with them rather than relying on the listing.">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); convert.mutate({ id: lead.id, ...f, contactEmail: f.contactEmail || null }); }}>
        <Field label="Business name">{(id) => <input id={id} className="input" value={f.name} onChange={set('name')} required />}</Field>
        <Field label="Phone">{(id) => <input id={id} className="input" value={f.phone} onChange={set('phone')} />}</Field>
        <div className="grid sm:grid-cols-2 gap-2">
          <Field label="Contact first name">{(id) => <input id={id} className="input" value={f.contactFirstName} onChange={set('contactFirstName')} />}</Field>
          <Field label="Last name">{(id) => <input id={id} className="input" value={f.contactLastName} onChange={set('contactLastName')} />}</Field>
        </div>
        <Field label="Their title">{(id) => <input id={id} className="input" value={f.contactTitle} onChange={set('contactTitle')} placeholder="Owner" />}</Field>
        <Field label="Email they gave you">{(id) => <input id={id} type="email" className="input" value={f.contactEmail} onChange={set('contactEmail')} />}</Field>
        <label className="flex items-start gap-2 text-micro">
          <input type="checkbox" className="mt-0.5" checked={f.agreedToEmail} onChange={set('agreedToEmail')} />
          <span>They agreed on the call to receive email from Relay. Recorded as express consent under CASL with today&apos;s date.</span>
        </label>
        <ErrorNote error={convert.error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost h-8 text-micro" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary h-8 text-micro" disabled={convert.isPending}>Create account</button>
        </div>
      </form>
    </Dialog>
  );
}
