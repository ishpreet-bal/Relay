'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { Dialog } from '@/components/ui/dialog';
import { ErrorNote, Loading } from '@/components/ui/states';

/**
 * Adds accounts (their best contacts) or specific contacts to a campaign.
 * Only campaigns for the same client are offered; the server re-checks.
 */
export function EnrollDialog({ accountIds, contactIds, clientId, onClose, onEnrolled }: {
  accountIds?: string[];
  contactIds?: string[];
  clientId: string | null;
  onClose: () => void;
  onEnrolled?: () => void;
}) {
  const campaigns = trpc.campaigns.list.useQuery({ clientId });
  const [campaignId, setCampaignId] = useState('');
  const enrollAccounts = trpc.campaigns.enrollAccounts.useMutation({ onSuccess: () => onEnrolled?.() });
  const enrollContacts = trpc.campaigns.enrollContacts.useMutation({ onSuccess: () => onEnrolled?.() });
  const pending = enrollAccounts.isPending || enrollContacts.isPending;
  const result = enrollAccounts.data ?? enrollContacts.data;
  const n = accountIds?.length ?? contactIds?.length ?? 0;
  const options = (campaigns.data ?? []).filter((c) => c.status !== 'COMPLETED');

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Add to campaign"
            description={`${n} ${accountIds ? 'account' : 'contact'}${n === 1 ? '' : 's'} selected. Each person is only ever in one live sequence.`}>
      {campaigns.isPending ? <Loading /> : result ? (
        <div className="space-y-3">
          <p className="text-sm"><span className="num">{result.enrolled}</span> {result.enrolled === 1 ? 'person' : 'people'} added.</p>
          {result.skipped.length > 0 && (
            <div className="border border-hairline rounded-md p-3 max-h-48 overflow-y-auto">
              <p className="eyebrow mb-1.5">Skipped</p>
              <ul className="space-y-1">
                {result.skipped.map((s) => <li key={s.id} className="text-[12px] text-muted">{s.name} — {s.reason}</li>)}
              </ul>
            </div>
          )}
          <div className="flex justify-end"><button type="button" className="btn-primary" onClick={onClose}>Done</button></div>
        </div>
      ) : !options.length ? (
        <p className="text-sm text-muted">
          {clientId ? 'This client has no open campaigns yet.' : 'Choose a client in the switcher first — campaigns belong to one client.'}
        </p>
      ) : (
        <div className="space-y-4">
          <label className="block">
            <span className="block text-[12px] font-medium mb-1.5">Campaign</span>
            <select className="input" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">Choose…</option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>{c.name} · {c.client.name} · {c.status.toLowerCase()}</option>
              ))}
            </select>
          </label>
          <ErrorNote error={enrollAccounts.error ?? enrollContacts.error} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-primary" disabled={!campaignId || pending}
                    onClick={() => accountIds
                      ? enrollAccounts.mutate({ campaignId, accountIds })
                      : enrollContacts.mutate({ campaignId, contactIds: contactIds ?? [] })}>
              {pending ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
