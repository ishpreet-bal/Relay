'use client';

import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import type { LeadFilter } from '@/server/services/leads';

export function LeadFilters({ filter, onChange }: {
  filter: LeadFilter;
  onChange: (f: LeadFilter) => void;
}) {
  const facets = trpc.leads.facets.useQuery();
  const [search, setSearch] = useState(filter.search ?? '');

  // Debounce so typing doesn't fire a query per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((filter.search ?? '') !== search) {
        onChange({ ...filter, search: search || undefined, cursor: undefined });
      }
    }, 250);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (key: 'industry' | 'city' | 'region' | 'status', value: string) => {
    const current = filter[key] ?? [];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    onChange({ ...filter, [key]: next.length ? next : undefined, cursor: undefined });
  };

  return (
    <aside className="w-56 shrink-0 border-r border-hairline bg-surface overflow-y-auto p-3 space-y-5">
      <div className="relative">
        <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Company, domain, email"
          aria-label="Search leads"
          className="input pl-8 text-micro"
        />
      </div>

      <Section title="Quality">
        <label className="flex items-center justify-between text-micro">
          <span>Minimum score</span>
          <span className="num text-muted">{filter.minScore ?? 0}</span>
        </label>
        <input
          type="range" min={0} max={100} step={5}
          value={filter.minScore ?? 0}
          onChange={(e) => onChange({ ...filter, minScore: Number(e.target.value) || undefined, cursor: undefined })}
          className="w-full accent-accent"
          aria-label="Minimum lead score"
        />
        <Check label="Has verified email" checked={!!filter.hasEmail}
          onChange={(v) => onChange({ ...filter, hasEmail: v || undefined, cursor: undefined })} />
        <Check label="Has website" checked={!!filter.hasWebsite}
          onChange={(v) => onChange({ ...filter, hasWebsite: v || undefined, cursor: undefined })} />
        <Check label="Has LinkedIn" checked={!!filter.hasLinkedin}
          onChange={(v) => onChange({ ...filter, hasLinkedin: v || undefined, cursor: undefined })} />
      </Section>

      <Section title="Company size">
        <div className="flex gap-2">
          <input type="number" min={0} placeholder="Min" aria-label="Minimum employees"
            className="input num text-micro" value={filter.minEmployees ?? ''}
            onChange={(e) => onChange({ ...filter, minEmployees: e.target.value ? Number(e.target.value) : undefined, cursor: undefined })} />
          <input type="number" min={0} placeholder="Max" aria-label="Maximum employees"
            className="input num text-micro" value={filter.maxEmployees ?? ''}
            onChange={(e) => onChange({ ...filter, maxEmployees: e.target.value ? Number(e.target.value) : undefined, cursor: undefined })} />
        </div>
      </Section>

      <FacetSection title="Status" items={facets.data?.statuses ?? []}
        selected={filter.status ?? []} onToggle={(v) => toggle('status', v)} format={(v) => v.toLowerCase().replace(/_/g, ' ')} />
      <FacetSection title="Industry" items={facets.data?.industries ?? []}
        selected={filter.industry ?? []} onToggle={(v) => toggle('industry', v)} />
      <FacetSection title="City" items={facets.data?.cities ?? []}
        selected={filter.city ?? []} onToggle={(v) => toggle('city', v)} />
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="eyebrow">{title}</p>
      {children}
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-micro cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-accent" />
      {label}
    </label>
  );
}

function FacetSection({ title, items, selected, onToggle, format }: {
  title: string;
  items: Array<{ value: string; count: number }>;
  selected: string[];
  onToggle: (v: string) => void;
  format?: (v: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!items.length) return null;
  const visible = expanded ? items : items.slice(0, 6);

  return (
    <Section title={title}>
      <ul className="space-y-0.5">
        {visible.map((item) => (
          <li key={item.value}>
            <button
              type="button"
              onClick={() => onToggle(item.value)}
              aria-pressed={selected.includes(item.value)}
              className={cn(
                'w-full flex items-center justify-between gap-2 rounded px-1.5 h-6 text-micro text-left transition-colors',
                selected.includes(item.value) ? 'bg-accent-soft text-accent' : 'hover:bg-raised text-muted',
              )}
            >
              <span className="truncate capitalize">{format ? format(item.value) : item.value}</span>
              <span className="num text-[11px] opacity-60">{item.count}</span>
            </button>
          </li>
        ))}
      </ul>
      {items.length > 6 && (
        <button type="button" onClick={() => setExpanded(!expanded)} className="text-[11px] text-accent hover:underline">
          {expanded ? 'Show less' : `Show ${items.length - 6} more`}
        </button>
      )}
    </Section>
  );
}
