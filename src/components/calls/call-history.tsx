'use client';
import Link from 'next/link';
import { useState } from 'react';
import { PhoneCall } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useActiveClient } from '@/components/shell/active-client';
import { Topbar } from '@/components/shell/topbar';
import { PageBody } from '@/components/ui/page';
import { EmptyState, ErrorNote, Loading } from '@/components/ui/states';
import { DateTime } from '@/components/ui/time';
import { CallOutcomePill } from '@/components/domain/pills';
import { personName } from '@/lib/domain';

export function CallHistory() {
  const { clientId } = useActiveClient();
  const [mine, setMine] = useState(false);
  const calls = trpc.calls.recent.useQuery({ clientId, mine, limit: 50 });
  return <><Topbar title="Call history" /><PageBody>
    <div className="max-w-3xl mb-7 space-y-4"><h2 className="text-2xl font-semibold">The conversation so far.</h2><p className="text-sm text-muted leading-relaxed">The 50 most recent calls recorded in Relay for the selected client. Dialing a number does not create a call record; save the outcome in call prep after the conversation. Calls made elsewhere are not automatically imported.</p><div className="flex flex-wrap items-center gap-5"><label className="text-sm flex items-center gap-2"><input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)} />Only my calls</label><Link href="/calls" className="text-sm text-accent">Open call queue →</Link><Link href="/contacts" className="text-sm text-accent">Find numbers and emails →</Link></div></div>
    <ErrorNote error={calls.error} />
    {calls.isPending ? <Loading label="Loading logged calls…" /> : !calls.error && !calls.data?.length ? <EmptyState icon={PhoneCall} title="No calls logged yet">Open a person from Call queue or Contacts, make the call, then save its outcome and notes. No Apollo account is needed to record a call.</EmptyState> : <ul className="space-y-4">{calls.data?.map(call => <li className="card p-5 space-y-3" key={call.id}>
      <div className="flex flex-wrap items-center justify-between gap-3"><Link href={`/accounts/${call.account.id}`} className="font-semibold hover:text-accent">{call.account.name}</Link><CallOutcomePill outcome={call.outcome} /></div>
      <p className="text-sm text-muted">{call.contact ? <Link className="hover:text-accent" href={`/calls/${call.contact.id}`}>{personName(call.contact)}</Link> : 'No contact linked'} · <DateTime date={call.startedAt} /> · {call.caller ? personName(call.caller) : 'No caller recorded'}</p>
      {call.notes && <p className="text-sm whitespace-pre-wrap leading-relaxed">{call.notes}</p>}
      {call.callbackAt && <p className="text-sm text-accent">Callback: <DateTime date={call.callbackAt} /></p>}
    </li>)}</ul>}
  </PageBody></>;
}
