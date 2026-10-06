'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Building2, Plus, Search, Upload, Phone, Radio, Users } from 'lucide-react';
import type { AccountStatus } from '@prisma/client';
import { trpc } from '@/lib/trpc/client';
import { useActiveClient } from '@/components/shell/active-client';
import { Topbar } from '@/components/shell/topbar';
import { PageBody } from '@/components/ui/page';
import { Table, Th, Td } from '@/components/ui/table';
import { EmptyState, ErrorNote, Loading } from '@/components/ui/states';
import { Ago } from '@/components/ui/time';
import { ScoreBadge } from '@/components/scoring/score';
import { AccountStatusPill } from '@/components/domain/pills';
import { ACCOUNT_STATUSES, ACCOUNT_STATUS_LABELS, personName } from '@/lib/domain';
import { cn, formatCompact } from '@/lib/utils';
import { ImportDialog } from './import-dialog';
import { AccountFormDialog } from './account-form-dialog';
import { EnrollDialog } from '@/components/campaigns/enroll-dialog';

type Sort = 'score' | 'fitScore' | 'createdAt' | 'name' | 'lastContactedAt';

interface Filters {
  search: string;
  status: AccountStatus[];
  industry: string[];
  region: string[];
  minScore: number | undefined;
  hasContacts: boolean;
  hasPhone: boolean;
  hasSignals: boolean;
  includeDoNotContact: boolean;
  sort: Sort;
  direction: 'asc' | 'desc';
}

const EMPTY: Filters = {
  search: '', status: [], industry: [], region: [], minScore: undefined,
  hasContacts: false, hasPhone: false, hasSignals: false, includeDoNotContact: false,
  sort: 'score', direction: 'desc',
};

export function AccountsWorkspace({ canWrite, canImport, canEnroll, canResearch }: {
  canWrite: boolean; canImport: boolean; canEnroll: boolean; canResearch: boolean;
}) {
  const { clientId, activeClient } = useActiveClient();
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [search, setSearch] = useState('');
  const [cursors, setCursors] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<'import' | 'create' | 'enroll' | null>(null);

  // Debounce typing into the search box.
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.search === search ? f : { ...f, search })), 250);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setCursors([]); setSelected(new Set()); }, [filters, clientId]);

  const input = useMemo(() => ({
    clientId,
    search: filters.search || undefined,
    status: filters.status.length ? filters.status : undefined,
    industry: filters.industry.length ? filters.industry : undefined,
    region: filters.region.length ? filters.region : undefined,
    minScore: filters.minScore,
    hasContacts: filters.hasContacts || undefined,
    hasPhone: filters.hasPhone || undefined,
    hasSignals: filters.hasSignals || undefined,
    includeDoNotContact: filters.includeDoNotContact,
    sort: filters.sort,
    direction: filters.direction,
    limit: 50,
  }), [filters, clientId]);

  const cursor = cursors[cursors.length - 1];
  const list = trpc.accounts.list.useQuery({ ...input, cursor }, { placeholderData: (prev) => prev });
  const count = trpc.accounts.count.useQuery(input);
  const facets = trpc.accounts.facets.useQuery({ clientId });
  const utils = trpc.useUtils();
  const research = trpc.research.queueBatch.useMutation();

  const rows = list.data?.items ?? [];
  const selectable = canEnroll || canResearch;
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const sortBy = (key: Sort) => setFilters((f) => ({ ...f, sort: key, direction: f.sort === key && f.direction === 'desc' ? 'asc' : 'desc' }));
  const filtered = JSON.stringify({ ...filters, sort: 'score', direction: 'desc' }) !== JSON.stringify(EMPTY);

  return (
    <>
      <Topbar
        title="Accounts"
        actions={
          <div className="flex items-center gap-2">
            {canImport && (
              <button type="button" className="btn-outline h-8 text-micro" onClick={() => setDialog('import')}>
                <Upload className="size-3.5" /> Import
              </button>
            )}
            {canWrite && (
              <button type="button" className="btn-primary h-8 text-micro" onClick={() => setDialog('create')}>
                <Plus className="size-3.5" /> Add account
              </button>
            )}
          </div>
        }
      />
      <PageBody width="full">
        <div className="flex flex-col lg:flex-row gap-5">
          <aside className="lg:w-56 shrink-0 space-y-4" aria-label="Filters">
            <label className="relative block">
              <span className="sr-only">Search accounts</span>
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted" />
              <input className="input h-8 pl-8 text-micro" placeholder="Name, domain, city, contact…" value={search}
                     onChange={(e) => setSearch(e.target.value)} />
            </label>

            <FilterGroup title="Status">
              {ACCOUNT_STATUSES.map((s) => {
                const n = facets.data?.statuses.find((x) => x.value === s)?.count ?? 0;
                if (!n && !filters.status.includes(s)) return null;
                return (
                  <Check key={s} label={ACCOUNT_STATUS_LABELS[s]} count={n} checked={filters.status.includes(s)}
                         onChange={(on) => setFilters((f) => ({ ...f, status: on ? [...f.status, s] : f.status.filter((x) => x !== s) }))} />
                );
              })}
            </FilterGroup>

            <FilterGroup title="Reachability">
              <Check label="Has contacts" icon={Users} checked={filters.hasContacts} onChange={(v) => setFilters((f) => ({ ...f, hasContacts: v }))} />
              <Check label="Has a callable phone" icon={Phone} checked={filters.hasPhone} onChange={(v) => setFilters((f) => ({ ...f, hasPhone: v }))} />
              <Check label="Has live signals" icon={Radio} checked={filters.hasSignals} onChange={(v) => setFilters((f) => ({ ...f, hasSignals: v }))} />
              <Check label="Include do-not-contact" checked={filters.includeDoNotContact} onChange={(v) => setFilters((f) => ({ ...f, includeDoNotContact: v }))} />
            </FilterGroup>

            <FilterGroup title="Minimum score">
              <select className="input h-8 text-micro" value={filters.minScore ?? ''}
                      onChange={(e) => setFilters((f) => ({ ...f, minScore: e.target.value ? Number(e.target.value) : undefined }))}>
                <option value="">Any</option>
                {[40, 55, 70, 85].map((n) => <option key={n} value={n}>{n}+</option>)}
              </select>
            </FilterGroup>

            {!!facets.data?.industries.length && (
              <FilterGroup title="Industry">
                {facets.data.industries.slice(0, 12).map((i) => (
                  <Check key={i.value} label={i.value} count={i.count} checked={filters.industry.includes(i.value)}
                         onChange={(on) => setFilters((f) => ({ ...f, industry: on ? [...f.industry, i.value] : f.industry.filter((x) => x !== i.value) }))} />
                ))}
              </FilterGroup>
            )}
            {!!facets.data?.regions.length && (
              <FilterGroup title="Region">
                {facets.data.regions.slice(0, 12).map((r) => (
                  <Check key={r.value} label={r.value} count={r.count} checked={filters.region.includes(r.value)}
                         onChange={(on) => setFilters((f) => ({ ...f, region: on ? [...f.region, r.value] : f.region.filter((x) => x !== r.value) }))} />
                ))}
              </FilterGroup>
            )}
            {filtered && (
              <button type="button" className="btn-ghost h-7 text-micro w-full" onClick={() => { setFilters(EMPTY); setSearch(''); }}>
                Clear filters
              </button>
            )}
          </aside>

          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-center gap-3 min-h-8">
              <p className="text-micro text-muted flex-1">
                {count.data !== undefined && <><span className="num text-ink">{formatCompact(count.data)}</span> accounts</>}
                {activeClient && <> for {activeClient.name}</>}
                {' · '}sorted by {filters.sort === 'score' ? 'priority score' : filters.sort.replace(/([A-Z])/g, ' $1').toLowerCase()}
              </p>
              {research.data && (
                <p className="text-[12px] text-muted">
                  {research.data.queued} queued for research{research.data.skipped > 0 && `, ${research.data.skipped} skipped (no website)`}.
                </p>
              )}
              {selected.size > 0 && canResearch && (
                <button type="button" className="btn-outline h-8 text-micro" disabled={research.isPending}
                        onClick={() => research.mutate({ accountIds: [...selected] })}>
                  Research {selected.size}
                </button>
              )}
              {selected.size > 0 && canEnroll && (
                <button type="button" className="btn-primary h-8 text-micro" onClick={() => setDialog('enroll')}>
                  Add {selected.size} to campaign
                </button>
              )}
            </div>

            <ErrorNote error={list.error} />
            {list.isPending ? <Loading label="Loading accounts…" /> : !rows.length ? (
              <EmptyState icon={Building2} title={filtered ? 'No accounts match these filters' : 'No accounts yet'}
                action={!filtered && canImport ? <button type="button" className="btn-primary" onClick={() => setDialog('import')}>Import a list</button> : undefined}>
                {filtered
                  ? 'Widen the filters to see more.'
                  : 'Import a CSV of target companies, or add one by hand. Each account is scored against the client\'s ideal customer profiles as it arrives.'}
              </EmptyState>
            ) : (
              <Table>
                <thead>
                  <tr>
                    {selectable && (
                      <Th className="w-8">
                        <input type="checkbox" aria-label="Select all on this page" checked={allSelected}
                               onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} />
                      </Th>
                    )}
                    <Th sort={{ active: filters.sort === 'name', direction: filters.direction, onClick: () => sortBy('name') }}>Account</Th>
                    <Th sort={{ active: filters.sort === 'score', direction: filters.direction, onClick: () => sortBy('score') }}>Score</Th>
                    <Th>Status</Th>
                    <Th className="hidden md:table-cell">Best contact</Th>
                    <Th className="hidden lg:table-cell">Industry · location</Th>
                    <Th className="hidden xl:table-cell text-right">Size</Th>
                    {!clientId && <Th className="hidden xl:table-cell">Client</Th>}
                    <Th className="hidden xl:table-cell" sort={{ active: filters.sort === 'lastContactedAt', direction: filters.direction, onClick: () => sortBy('lastContactedAt') }}>Last touch</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => {
                    const contact = a.contacts[0];
                    return (
                      <tr key={a.id} className={cn('hover:bg-raised/60', selected.has(a.id) && 'bg-accent-soft/40')}>
                        {selectable && (
                          <Td>
                            <input type="checkbox" aria-label={`Select ${a.name}`} checked={selected.has(a.id)}
                                   onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })} />
                          </Td>
                        )}
                        <Td className="max-w-[260px]">
                          <Link href={`/accounts/${a.id}`} className="font-medium hover:text-accent block truncate">{a.name}</Link>
                          <span className="text-[11px] text-muted">
                            {a.domain ?? 'no website'}
                            {a._count.signals > 0 && <> · <span className="text-accent">{a._count.signals} signal{a._count.signals === 1 ? '' : 's'}</span></>}
                            {a.doNotContact && <> · <span className="text-blocked">do not contact</span></>}
                          </span>
                        </Td>
                        <Td><ScoreBadge score={a.score} breakdown={a.scoreBreakdown} overridden={a.scoreOverride !== null} /></Td>
                        <Td><AccountStatusPill status={a.status} /></Td>
                        <Td className="hidden md:table-cell max-w-[200px]">
                          {contact ? (
                            <>
                              <span className="block truncate">{personName(contact)}</span>
                              <span className="block truncate text-[11px] text-muted">{contact.title ?? '—'}</span>
                            </>
                          ) : <span className="text-[11px] text-muted">No contacts</span>}
                          {a._count.contacts > 1 && <span className="text-[11px] text-muted">+{a._count.contacts - 1} more</span>}
                        </Td>
                        <Td className="hidden lg:table-cell max-w-[200px]">
                          <span className="block truncate">{a.industry ?? '—'}</span>
                          <span className="block truncate text-[11px] text-muted">{[a.city, a.region].filter(Boolean).join(', ') || '—'}</span>
                        </Td>
                        <Td className="hidden xl:table-cell text-right num">{a.employeeCount ?? a.employeeRange ?? '—'}</Td>
                        {!clientId && <Td className="hidden xl:table-cell text-micro text-muted">{a.client.name}</Td>}
                        <Td className="hidden xl:table-cell text-micro text-muted"><Ago date={a.lastContactedAt} /></Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}

            {(cursors.length > 0 || list.data?.nextCursor) && (
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-outline h-8 text-micro" disabled={!cursors.length}
                        onClick={() => setCursors((c) => c.slice(0, -1))}>Previous</button>
                <button type="button" className="btn-outline h-8 text-micro" disabled={!list.data?.nextCursor}
                        onClick={() => list.data?.nextCursor && setCursors((c) => [...c, list.data!.nextCursor!])}>Next</button>
              </div>
            )}
          </div>
        </div>
      </PageBody>

      {dialog === 'import' && (
        <ImportDialog onClose={() => setDialog(null)} onImported={() => { utils.accounts.invalidate(); }} />
      )}
      {dialog === 'create' && (
        <AccountFormDialog onClose={() => setDialog(null)} />
      )}
      {dialog === 'enroll' && (
        <EnrollDialog accountIds={[...selected]} clientId={clientId} onClose={() => setDialog(null)}
                      onEnrolled={() => { setSelected(new Set()); utils.accounts.invalidate(); }} />
      )}
    </>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="eyebrow mb-1.5">{title}</legend>
      <div className="space-y-0.5">{children}</div>
    </fieldset>
  );
}

function Check({ label, count, checked, onChange, icon: Icon }: {
  label: string;
  count?: number;
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon?: typeof Users;
}) {
  return (
    <label className="flex items-center gap-2 h-7 px-1.5 rounded hover:bg-raised cursor-pointer text-micro">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {Icon && <Icon className="size-3.5 text-muted" />}
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && <span className="num text-[11px] text-muted">{count}</span>}
    </label>
  );
}
