'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Phone } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useActiveClient } from '@/components/shell/active-client';
import { ErrorNote, Loading } from '@/components/ui/states';

export function BusinessPhoneList() {
  const { clientId } = useActiveClient();
  const [open, setOpen] = useState(false);
  const [cursors, setCursors] = useState<string[]>([]);
  useEffect(() => setCursors([]), [clientId]);
  const lines = trpc.contacts.businessLines.useQuery({ clientId, cursor: cursors.at(-1) }, { enabled: open });
  return <details className="card mb-6" onToggle={e => setOpen(e.currentTarget.open)}>
    <summary className="p-5 cursor-pointer font-medium">Company phone numbers · available even before a person is found</summary>
    <div className="px-5 pb-5 space-y-5"><p className="text-sm text-muted leading-relaxed max-w-3xl">Main business lines recorded on company accounts, ordered by account fit. These are not verified direct numbers. Ask who handles the process you want to discuss, and record the actual person and outcome. The people filters below apply to the separate contacts list.</p>
      <ErrorNote error={lines.error} />
      {open && lines.isPending ? <Loading label="Loading company numbers…" /> : lines.error ? null : !lines.data?.items.length ? <p className="text-sm text-muted">No company phone numbers found for this client yet. Review discovery sources and the company’s published contact page.</p> : <ul className="divide-y divide-hairline">{lines.data.items.map(a => <li className="py-4 flex flex-col sm:flex-row sm:items-center gap-3" key={a.id}><div className="flex-1 min-w-0"><Link prefetch={false} href={`/accounts/${a.id}`} className="font-medium hover:text-accent">{a.name}</Link><p className="text-xs text-muted mt-1">{[a.industry, a.city].filter(Boolean).join(' · ') || 'Company main line'}</p></div><a href={`tel:${a.phone}`} className="text-sm num inline-flex items-center gap-2 hover:text-accent"><Phone className="size-3.5" />{a.phone}</a><Link prefetch={false} href={`/accounts/${a.id}`} className="text-sm text-accent">Review company →</Link></li>)}</ul>}
      {(cursors.length > 0 || lines.data?.nextCursor) && <div className="flex justify-end gap-3"><button className="btn-outline" disabled={!cursors.length} onClick={() => setCursors(c => c.slice(0, -1))}>Previous numbers</button><button className="btn-outline" disabled={!lines.data?.nextCursor} onClick={() => lines.data?.nextCursor && setCursors(c => [...c, lines.data!.nextCursor!])}>More numbers</button></div>}
    </div>
  </details>;
}
