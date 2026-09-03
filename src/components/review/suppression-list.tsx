'use client';

import { useState } from 'react';
import { Lock, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

const PERMANENT = new Set(['UNSUBSCRIBE', 'HARD_BOUNCE', 'SPAM_COMPLAINT']);

const REASONS = [
  { value: 'DO_NOT_CONTACT', label: 'Asked not to be contacted' },
  { value: 'EXISTING_CLIENT', label: 'Existing client' },
  { value: 'COMPETITOR', label: 'Competitor' },
  { value: 'MANUAL', label: 'Other' },
] as const;

export function SuppressionList({ canWrite }: { canWrite: boolean }) {
  const [search, setSearch] = useState('');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState<(typeof REASONS)[number]['value']>('DO_NOT_CONTACT');

  const utils = trpc.useUtils();
  const list = trpc.suppression.list.useQuery({ search: search || undefined });
  const add = trpc.suppression.add.useMutation({
    onSuccess: () => { setValue(''); utils.suppression.list.invalidate(); },
  });

  return (
    <div className="space-y-5">
      {canWrite && (
        <div className="card p-3 flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="sup-value" className="eyebrow block mb-1.5">Email or domain</label>
            <input id="sup-value" className="input num" value={value} placeholder="name@example.com or example.com"
                   onChange={(e) => setValue(e.target.value)} />
          </div>
          <div>
            <label htmlFor="sup-reason" className="eyebrow block mb-1.5">Reason</label>
            <select id="sup-reason" className="input w-52" value={reason}
                    onChange={(e) => setReason(e.target.value as typeof reason)}>
              {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <button type="button" className="btn-primary" disabled={!value.trim() || add.isPending}
                  onClick={() => add.mutate({
                    value: value.trim(),
                    scope: value.includes('@') ? 'EMAIL' : 'DOMAIN',
                    reason,
                  })}>
            <Plus className="size-3.5" /> Add
          </button>
          {add.data && add.data.cancelledContacts > 0 && (
            <p className="w-full text-[11px] text-held">
              Cancelled queued messages for {add.data.cancelledContacts} contact
              {add.data.cancelledContacts > 1 ? 's' : ''}.
            </p>
          )}
        </div>
      )}

      <input type="search" className="input" placeholder="Search the list" value={search}
             onChange={(e) => setSearch(e.target.value)} aria-label="Search suppression list" />

      <ul className="card divide-y divide-hairline">
        {list.data?.length === 0 && (
          <li className="p-8 text-center text-sm text-muted">Nothing suppressed yet.</li>
        )}
        {list.data?.map((entry) => {
          const permanent = PERMANENT.has(entry.reason);
          return (
            <li key={entry.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="num text-[13px] truncate">{entry.value}</p>
                {entry.note && <p className="text-[11px] text-muted truncate">{entry.note}</p>}
              </div>
              <span className={cn('text-[11px] capitalize whitespace-nowrap',
                permanent ? 'text-blocked' : 'text-muted')}>
                {entry.reason.toLowerCase().replace(/_/g, ' ')}
              </span>
              {entry.scope === 'DOMAIN' && <span className="eyebrow">domain</span>}
              {permanent && <Lock className="size-3 text-muted shrink-0" aria-label="Permanent" />}
              <time className="num text-[11px] text-muted shrink-0">
                {new Date(entry.createdAt).toLocaleDateString('en-CA')}
              </time>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
