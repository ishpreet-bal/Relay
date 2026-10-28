'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Download, Mail, MailCheck, Phone, PhoneOff, Search, Users } from 'lucide-react';
import type { Seniority } from '@prisma/client';
import { trpc } from '@/lib/trpc/client';
import { useActiveClient } from '@/components/shell/active-client';
import { Topbar } from '@/components/shell/topbar';
import { PageBody } from '@/components/ui/page';
import { Table, Th, Td } from '@/components/ui/table';
import { EmptyState, ErrorNote, Loading } from '@/components/ui/states';
import { Ago } from '@/components/ui/time';
import { ScoreBadge } from '@/components/scoring/score';
import { EnrollDialog } from '@/components/campaigns/enroll-dialog';
import { SENIORITIES, SENIORITY_LABELS, personName } from '@/lib/domain';
import { cn, formatCompact } from '@/lib/utils';
import { BusinessPhoneList } from './business-phone-list';

type Sort = 'score' | 'createdAt' | 'lastName' | 'lastContactedAt';

export function ContactsWorkspace({ canEnroll, canExport }: { canEnroll: boolean; canExport: boolean }) {
  const { clientId } = useActiveClient();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [seniority, setSeniority] = useState<Seniority[]>([]);
  const [hasEmail, setHasEmail] = useState(false);
  const [hasPhone, setHasPhone] = useState(false);
  const [includeSuppressed, setIncludeSuppressed] = useState(false);
  const [sort, setSort] = useState<Sort>('score');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [cursors, setCursors] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => { const t = setTimeout(() => setDebounced(search), 250); return () => clearTimeout(t); }, [search]);

  const input = useMemo(() => ({
    clientId,
    search: debounced || undefined,
    seniority: seniority.length ? seniority : undefined,
    hasEmail: hasEmail || undefined,
    hasPhone: hasPhone || undefined,
    includeSuppressed,
    sort, direction, limit: 50,
  }), [clientId, debounced, seniority, hasEmail, hasPhone, includeSuppressed, sort, direction]);
  useEffect(() => { setCursors([]); setSelected(new Set()); }, [input]);

  const list = trpc.contacts.list.useQuery({ ...input, cursor: cursors[cursors.length - 1] }, { placeholderData: (p) => p });
  const count = trpc.contacts.count.useQuery(input);
  const rows = list.data?.items ?? [];
  const sortBy = (key: Sort) => { setDirection(sort === key && direction === 'desc' ? 'asc' : 'desc'); setSort(key); };

  return (
    <>
      <Topbar title="Contacts"
              actions={canExport && (
                <a className="btn-ghost h-8 text-micro" href={`/api/export/contacts?filters=${encodeURIComponent(JSON.stringify(input))}`}
                   title="Download the filtered list as CSV">
                  <Download className="size-3.5" /> Export
                </a>
              )} />
      <PageBody width="full">
        <p className="text-sm text-muted leading-relaxed mb-5 max-w-3xl">Email addresses and phone numbers for your prospects. Select a client to focus the list. Missing details? Open the company account and use Resolve contacts; published website details and configured data providers are checked separately from company discovery.</p>
        <BusinessPhoneList />
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <label className="relative w-full sm:w-64">
            <span className="sr-only">Search contacts</span>
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted" />
            <input className="input h-8 pl-8 text-micro" placeholder="Name, email, title, company…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <select className="input h-8 w-40 text-micro" aria-label="Seniority" value={seniority[0] ?? ''}
                  onChange={(e) => setSeniority(e.target.value ? [e.target.value as Seniority] : [])}>
            <option value="">Any seniority</option>
            {SENIORITIES.map((s) => <option key={s} value={s}>{SENIORITY_LABELS[s]}</option>)}
          </select>
          <Toggle label="Has email" on={hasEmail} set={setHasEmail} />
          <Toggle label="Has phone" on={hasPhone} set={setHasPhone} />
          <Toggle label="Include do-not-contact" on={includeSuppressed} set={setIncludeSuppressed} />
          <span className="flex-1" />
          <p className="text-micro text-muted">{count.data !== undefined && <><span className="num text-ink">{formatCompact(count.data)}</span> contacts</>}</p>
          {selected.size > 0 && canEnroll && (
            <button type="button" className="btn-primary h-8 text-micro" onClick={() => setEnrolling(true)}>Add {selected.size} to campaign</button>
          )}
        </div>

        <ErrorNote error={list.error} />
        {list.isPending ? <Loading /> : list.error ? null : !rows.length ? (
          <EmptyState icon={Users} title="No contacts found">Contacts are added on accounts, by CSV import, or from a connected data provider.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                {canEnroll && (
                  <Th className="w-8">
                    <input type="checkbox" aria-label="Select all on this page" checked={rows.every((r) => selected.has(r.id))}
                           onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} />
                  </Th>
                )}
                <Th sort={{ active: sort === 'lastName', direction, onClick: () => sortBy('lastName') }}>Name</Th>
                <Th sort={{ active: sort === 'score', direction, onClick: () => sortBy('score') }}>Score</Th>
                <Th>Account</Th>
                <Th>Phone and email</Th>
                {!clientId && <Th className="hidden lg:table-cell">Client</Th>}
                <Th className="hidden lg:table-cell" sort={{ active: sort === 'lastContactedAt', direction, onClick: () => sortBy('lastContactedAt') }}>Last contacted</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const phone = c.directPhone ?? c.mobilePhone ?? c.phone ?? c.account.phone;
                return (
                  <tr key={c.id} className={cn('hover:bg-raised/60', selected.has(c.id) && 'bg-accent-soft/40')}>
                    {canEnroll && (
                      <Td>
                        <input type="checkbox" aria-label={`Select ${personName(c)}`} checked={selected.has(c.id)}
                               onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} />
                      </Td>
                    )}
                    <Td className="max-w-[240px]">
                      <Link href={`/contacts/${c.id}`} className="font-medium hover:text-accent block truncate">{personName(c)}</Link>
                      <span className="block truncate text-[11px] text-muted">{c.title ?? '—'}{c.seniority !== 'UNKNOWN' && ` · ${SENIORITY_LABELS[c.seniority]}`}</span>
                    </Td>
                    <Td><ScoreBadge score={c.score} breakdown={c.scoreBreakdown} /></Td>
                    <Td className="max-w-[200px]">
                      <Link href={`/accounts/${c.account.id}`} className="block truncate hover:text-accent">{c.account.name}</Link>
                      <span className="text-[11px] text-muted num">account {c.account.score}</span>
                    </Td>
                    <Td className="text-xs min-w-[220px]">
                      <span className={cn('flex items-center gap-1', c.doNotEmail ? 'text-blocked' : c.email ? 'text-ink' : 'text-muted')}>
                        {c.emailVerification === 'VALID' ? <MailCheck className="size-3" /> : <Mail className="size-3" />}
                        {c.doNotEmail ? 'Do not email' : c.email ?? 'No email found'}
                      </span>
                      <span className={cn('flex items-center gap-1', c.doNotCall ? 'text-blocked' : phone ? 'text-ink' : 'text-muted')}>
                        {c.doNotCall ? <PhoneOff className="size-3" /> : <Phone className="size-3" />}
                        {c.doNotCall || c.account.doNotContact ? 'Do not call' : phone ?? 'No phone found'}
                      </span>
                      {phone && !c.doNotCall && !c.account.doNotContact && <span className="block text-[11px] text-muted mt-1">{c.directPhone ? 'Direct line' : c.mobilePhone ? 'Mobile' : 'Business line'}</span>}
                      {c.email && !c.doNotEmail && <span className="block text-[11px] text-muted mt-1">{c.emailVerification === 'VALID' ? 'Verification recorded · review freshness before sending' : `Email: ${c.emailVerification.toLowerCase().replaceAll('_', ' ')}`}</span>}
                    </Td>
                    {!clientId && <Td className="hidden lg:table-cell text-micro text-muted">{c.client.name}</Td>}
                    <Td className="hidden lg:table-cell text-micro text-muted">
                      <Ago date={c.lastContactedAt} />
                      {c.lastRepliedAt && <span className="block text-accent">replied <Ago date={c.lastRepliedAt} /></span>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {(cursors.length > 0 || list.data?.nextCursor) && (
          <div className="flex justify-end gap-2 mt-3">
            <button type="button" className="btn-outline h-8 text-micro" disabled={!cursors.length} onClick={() => setCursors((c) => c.slice(0, -1))}>Previous</button>
            <button type="button" className="btn-outline h-8 text-micro" disabled={!list.data?.nextCursor}
                    onClick={() => list.data?.nextCursor && setCursors((c) => [...c, list.data!.nextCursor!])}>Next</button>
          </div>
        )}
      </PageBody>
      {enrolling && <EnrollDialog contactIds={[...selected]} clientId={clientId} onClose={() => setEnrolling(false)} onEnrolled={() => setSelected(new Set())} />}
    </>
  );
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={() => set(!on)}
            className={cn('h-8 px-2.5 rounded-md text-micro border transition-colors', on ? 'border-accent bg-accent-soft text-accent' : 'border-hairline text-muted hover:bg-raised')}>
      {label}
    </button>
  );
}
