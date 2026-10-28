'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useActiveClient } from '@/components/shell/active-client';
import { Topbar } from '@/components/shell/topbar';
import { PageBody } from '@/components/ui/page';
import { EmptyState, ErrorNote, Loading } from '@/components/ui/states';
import { DateTime } from '@/components/ui/time';
import { personName } from '@/lib/domain';
import { Pill } from '@/components/ui/pill';

export function EmailHistory() {
  const { clientId } = useActiveClient();
  const [direction, setDirection] = useState<'INBOUND' | 'OUTBOUND' | ''>('');
  const [cursors, setCursors] = useState<string[]>([]);
  useEffect(() => setCursors([]), [clientId, direction]);
  const history = trpc.messages.history.useQuery({ clientId, direction: direction || undefined, cursor: cursors.at(-1), limit: 25 });
  return <><Topbar title="Email history" /><PageBody>
    <div className="max-w-3xl mb-7 space-y-4"><h2 className="text-2xl font-semibold">Messages, with their actual status.</h2><p className="text-sm text-muted leading-relaxed">Emails recorded in Relay for the selected client. Drafts and scheduled messages have not been sent. This list does not import your external inbox history; sending and reply capture require their own connections.</p><div className="flex flex-wrap items-center gap-5"><select aria-label="Email direction" className="input w-44" value={direction} onChange={e => setDirection(e.target.value as typeof direction)}><option value="">Both directions</option><option value="OUTBOUND">Outgoing</option><option value="INBOUND">Incoming</option></select><Link href="/contacts" className="text-sm text-accent">Find email addresses →</Link><Link href="/review" className="text-sm text-accent">Review drafts →</Link></div></div>
    <ErrorNote error={history.error} />
    {history.isPending ? <Loading label="Loading email records…" /> : !history.error && !history.data?.items.length ? <EmptyState icon={Mail} title="No email records found">Contact enrichment finds addresses; it does not send a message. Prepare a draft from a contact or campaign, review it, and connect the sending service before sending.</EmptyState> : <ul className="space-y-4">{history.data?.items.map(m => <li key={m.id} className="card p-5 space-y-3">
      <div className="flex flex-wrap justify-between gap-3"><h3 className="font-semibold">{m.subject || 'No subject'}</h3><Pill>{m.direction === 'INBOUND' ? 'Incoming' : 'Outgoing'} · {m.status.toLowerCase().replaceAll('_', ' ')}</Pill></div>
      <p className="text-sm text-muted"><Link href={`/accounts/${m.account.id}`} className="hover:text-accent">{m.account.name}</Link>{m.contact && <> · <Link href={`/contacts/${m.contact.id}`} className="hover:text-accent">{personName(m.contact)}</Link>{m.contact.email && ` · ${m.contact.email}`}</>}</p>
      <p className="text-xs text-muted">{m.sentAt ? 'Sent / received' : 'Created'} <DateTime date={m.sentAt ?? m.createdAt} />{m.campaign && ` · ${m.campaign.name}`}</p>
      <details><summary className="text-sm cursor-pointer text-accent">Read message</summary><p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap break-words">{m.bodyText || 'No plain-text content recorded.'}</p></details>
    </li>)}</ul>}
    {(cursors.length > 0 || history.data?.nextCursor) && <div className="flex justify-end gap-3 mt-6"><button className="btn-outline" disabled={!cursors.length} onClick={() => setCursors(c => c.slice(0, -1))}>Previous</button><button className="btn-outline" disabled={!history.data?.nextCursor} onClick={() => history.data?.nextCursor && setCursors(c => [...c, history.data!.nextCursor!])}>Next</button></div>}
  </PageBody></>;
}
