'use client';

import { useState } from 'react';
import { Lock, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useActiveClient } from '@/components/shell/active-client';
import { Dialog } from '@/components/ui/dialog';
import { Pill } from '@/components/ui/pill';
import { ErrorNote, Loading } from '@/components/ui/states';
import { DateTime } from '@/components/ui/time';
import { humanize } from '@/lib/domain';

const PERMANENT = new Set(['UNSUBSCRIBE', 'HARD_BOUNCE', 'SPAM_COMPLAINT', 'DO_NOT_CALL', 'DO_NOT_CONTACT']);

const REASONS = [
  { value: 'DO_NOT_CONTACT', label: 'Asked not to be contacted' },
  { value: 'DO_NOT_CALL', label: 'Asked not to be called' },
  { value: 'EXISTING_CLIENT', label: 'Existing customer of the client' },
  { value: 'COMPETITOR', label: 'Competitor' },
  { value: 'MANUAL', label: 'Other' },
] as const;

type Scope = 'EMAIL' | 'DOMAIN' | 'PHONE';
const guessScope = (v: string): Scope => (v.includes('@') ? 'EMAIL' : /^[+\d\s().-]{7,}$/.test(v) ? 'PHONE' : 'DOMAIN');

/**
 * The do-not-contact list: every entry records what was suppressed, on which
 * channel, why, where the request came from, and when. Sending and the call
 * queue both check it. Requests from the person themselves cannot be removed.
 */
export function SuppressionList({ canWrite }: { canWrite: boolean }) {
  const { clientId, activeClient } = useActiveClient();
  const [search, setSearch] = useState('');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState<(typeof REASONS)[number]['value']>('DO_NOT_CONTACT');
  const [workspaceWide, setWorkspaceWide] = useState(!clientId);
  const [note, setNote] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const list = trpc.suppression.list.useQuery({ search: search || undefined });
  const add = trpc.suppression.add.useMutation({ onSuccess: () => { setValue(''); setNote(''); utils.suppression.list.invalidate(); } });

  const scope = guessScope(value.trim());
  const channel = reason === 'DO_NOT_CALL' ? 'PHONE' as const : scope === 'PHONE' ? 'PHONE' as const : 'ALL' as const;

  return (
    <div className="space-y-5">
      {canWrite && (
        <form className="card p-3 grid gap-2" onSubmit={(e) => {
          e.preventDefault();
          add.mutate({ value: value.trim(), scope, channel, reason, clientId: workspaceWide ? null : clientId, note: note || undefined });
        }}>
          <div className="flex flex-wrap gap-2 items-end">
            <label className="flex-1 min-w-[200px]">
              <span className="eyebrow block mb-1.5">Email, domain or phone</span>
              <input className="input num" value={value} placeholder="name@example.com, example.com or 416 555 0100" onChange={(e) => setValue(e.target.value)} />
            </label>
            <label>
              <span className="eyebrow block mb-1.5">Reason</span>
              <select className="input w-56" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
                {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
            <button type="submit" className="btn-primary" disabled={value.trim().length < 3 || add.isPending}><Plus className="size-3.5" /> Add</button>
          </div>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional): where or how the request was made" aria-label="Note" />
          {clientId && (
            <label className="flex items-center gap-2 text-[12px] text-muted">
              <input type="checkbox" checked={workspaceWide} onChange={(e) => setWorkspaceWide(e.target.checked)} />
              Apply to every client, not just {activeClient?.name}
            </label>
          )}
          {value.trim() && <p className="text-[11px] text-muted">Will be recorded as a {scope.toLowerCase()} entry blocking {channel === 'ALL' ? 'all contact' : 'calls'}.</p>}
          <ErrorNote error={add.error} />
          {add.data && add.data.affectedContacts > 0 && (
            <p className="text-[11px] text-held">{add.data.affectedContacts} contact{add.data.affectedContacts > 1 ? 's were' : ' was'} removed from sequences and the call queue.</p>
          )}
        </form>
      )}

      <input type="search" className="input" placeholder="Search the list" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search suppression list" />

      {list.isPending ? <Loading /> : (
        <ul className="card divide-y divide-hairline">
          {list.data?.length === 0 && <li className="p-8 text-center text-sm text-muted">Nothing suppressed yet.</li>}
          {list.data?.map((entry) => {
            const permanent = PERMANENT.has(entry.reason);
            return (
              <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5">
                <div className="flex-1 min-w-[180px]">
                  <p className="num text-[13px] truncate">{entry.value}</p>
                  <p className="text-[11px] text-muted truncate">
                    {humanize(entry.source)} · <DateTime date={entry.createdAt} pattern="d MMM yyyy" />{entry.client ? ` · ${entry.client.name} only` : ' · all clients'}
                    {entry.note && ` · ${entry.note}`}
                  </p>
                </div>
                <Pill tone={permanent ? 'negative' : 'neutral'}>{humanize(entry.reason)}</Pill>
                <Pill>{entry.channel === 'ALL' ? 'no contact' : entry.channel === 'PHONE' ? 'no calls' : 'no email'}</Pill>
                {permanent ? <Lock className="size-3 text-muted shrink-0" aria-label="Permanent" /> : canWrite && (
                  <button type="button" className="btn-ghost h-7 text-[11px]" onClick={() => setRemoving(entry.id)}>Remove</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {removing && <RemoveDialog id={removing} onClose={() => setRemoving(null)} />}
    </div>
  );
}

function RemoveDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [justification, setJustification] = useState('');
  const utils = trpc.useUtils();
  const remove = trpc.suppression.remove.useMutation({ onSuccess: (r) => { if (r.ok) { utils.suppression.list.invalidate(); onClose(); } } });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Remove from the list" width="sm" description="Removal is logged with your justification.">
      <div className="space-y-3">
        <textarea rows={3} className="input h-auto py-2" value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Why is it safe to contact them again?" aria-label="Justification" />
        {remove.data && !remove.data.ok && <p className="text-[12px] text-blocked">{remove.data.reason}</p>}
        <ErrorNote error={remove.error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={justification.trim().length < 5 || remove.isPending} onClick={() => remove.mutate({ id, justification: justification.trim() })}>Remove</button>
        </div>
      </div>
    </Dialog>
  );
}
