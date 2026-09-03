'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, SearchX } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { cn, formatCompact } from '@/lib/utils';
import { ScoreMeter, type ScoreSignal } from './score-meter';
import { StatusPill } from './status-pill';
import type { LeadFilter } from '@/server/services/leads';

type Sort = LeadFilter['sort'];

const COLUMNS: Array<{ key: Sort | null; label: string; className?: string }> = [
  { key: 'companyName', label: 'Company' },
  { key: null, label: 'Contact' },
  { key: null, label: 'Industry' },
  { key: null, label: 'Location', className: 'hidden lg:table-cell' },
  { key: null, label: 'Size', className: 'hidden xl:table-cell text-right' },
  { key: 'score', label: 'Score' },
  { key: null, label: 'Status' },
  { key: 'lastContactedAt', label: 'Last touch', className: 'hidden xl:table-cell' },
];

export function LeadTable({ filter, onFilterChange }: {
  filter: LeadFilter;
  onFilterChange: (f: LeadFilter) => void;
}) {
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const query = trpc.leads.list.useQuery(filter, { placeholderData: (prev) => prev });
  const total = trpc.leads.count.useQuery(filter);

  const rows = query.data?.items ?? [];

  const toggleSort = (key: Sort) => {
    setCursorStack([]);
    onFilterChange({
      ...filter,
      sort: key,
      direction: filter.sort === key && filter.direction === 'desc' ? 'asc' : 'desc',
      cursor: undefined,
    });
  };

  const summary = useMemo(() => {
    if (total.data === undefined) return null;
    return total.data === 1 ? '1 lead' : `${formatCompact(total.data)} leads`;
  }, [total.data]);

  if (query.isPending) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" /> Loading leads…
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="p-12 text-center">
        <SearchX className="size-7 mx-auto text-muted mb-3" strokeWidth={1.5} />
        <h2 className="font-display font-semibold mb-1">No leads match these filters</h2>
        <p className="text-sm text-muted mb-4">
          Widen the filters, or import a list to start building the pipeline.
        </p>
        <button
          type="button"
          className="btn-outline"
          onClick={() => onFilterChange({ sort: 'score', direction: 'desc', limit: filter.limit })}
        >
          Clear filters
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[13px] border-collapse">
          <thead className="sticky top-0 z-10 bg-raised/95 backdrop-blur">
            <tr className="border-b border-hairline">
              {COLUMNS.map((col) => (
                <th
                  key={col.label}
                  scope="col"
                  className={cn('eyebrow text-left font-normal px-3 h-9 whitespace-nowrap', col.className)}
                >
                  {col.key ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key!)}
                      className="inline-flex items-center gap-1 hover:text-ink"
                    >
                      {col.label}
                      {filter.sort === col.key &&
                        (filter.direction === 'desc'
                          ? <ArrowDown className="size-3" />
                          : <ArrowUp className="size-3" />)}
                    </button>
                  ) : col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((lead) => {
              const contact = lead.contacts[0];
              const signals = (lead.scoreBreakdown ?? []) as unknown as ScoreSignal[];
              return (
                <tr key={lead.id} className="border-b border-hairline hover:bg-raised/60 transition-colors">
                  <td className="px-3 py-2 max-w-[240px]">
                    <Link href={`/leads/${lead.id}`} className="font-medium hover:text-accent block truncate">
                      {lead.companyName}
                    </Link>
                    {lead.domain && <span className="num text-[11px] text-muted">{lead.domain}</span>}
                  </td>
                  <td className="px-3 py-2 max-w-[200px]">
                    {contact ? (
                      <>
                        <div className="truncate">
                          {[contact.firstName, contact.lastName].filter(Boolean).join(' ') || '—'}
                        </div>
                        <span className={cn(
                          'num text-[11px] truncate block',
                          contact.emailVerification === 'VALID' ? 'text-cleared' : 'text-muted',
                        )}>
                          {contact.email ?? 'No email'}
                        </span>
                      </>
                    ) : <span className="text-muted">No contact</span>}
                  </td>
                  <td className="px-3 py-2 text-muted truncate max-w-[140px]">{lead.industry ?? '—'}</td>
                  <td className="px-3 py-2 text-muted hidden lg:table-cell whitespace-nowrap">
                    {[lead.city, lead.region].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-3 py-2 hidden xl:table-cell text-right num text-muted">
                    {lead.employeeCount ?? lead.employeeRange ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    <ScoreMeter score={lead.score} signals={signals} />
                  </td>
                  <td className="px-3 py-2"><StatusPill status={lead.status} /></td>
                  <td className="px-3 py-2 num text-muted hidden xl:table-cell whitespace-nowrap">
                    {lead.lastContactedAt
                      ? new Date(lead.lastContactedAt).toLocaleDateString('en-CA')
                      : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="shrink-0 h-11 border-t border-hairline flex items-center justify-between px-4 bg-surface">
        <span className="num text-micro text-muted">{summary}</span>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-outline h-7 text-micro"
            disabled={!cursorStack.length}
            onClick={() => {
              const stack = [...cursorStack];
              stack.pop();
              setCursorStack(stack);
              onFilterChange({ ...filter, cursor: stack[stack.length - 1] });
            }}
          >
            Previous
          </button>
          <button
            type="button"
            className="btn-outline h-7 text-micro"
            disabled={!query.data?.nextCursor}
            onClick={() => {
              const next = query.data!.nextCursor!;
              setCursorStack([...cursorStack, next]);
              onFilterChange({ ...filter, cursor: next });
            }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
