'use client';

import { useEffect, useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/types';
import { useActiveClient } from '@/components/shell/active-client';
import { Dialog } from '@/components/ui/dialog';
import { Field, ListInput } from '@/components/ui/field';
import { ErrorNote } from '@/components/ui/states';
import { FREQUENCY_LABELS, SOURCE_LABELS, usd } from './format';

type Profile = RouterOutputs['discovery']['profiles'][number];
type Source = RouterOutputs['discovery']['sources'][number];
type Frequency = keyof typeof FREQUENCY_LABELS;
type SourceId = 'google_places' | 'apollo';

// The Greater Toronto Area, matching GTA_DEFAULTS on the server.
const GTA = {
  country: 'CA', regions: ['ON'],
  cities: ['Toronto', 'Mississauga', 'Brampton', 'Vaughan', 'Markham', 'Richmond Hill', 'Oakville', 'Burlington', 'Milton', 'Pickering', 'Ajax', 'Whitby', 'Oshawa', 'Hamilton'],
};

const num = (v: string) => (v.trim() === '' ? null : Number(v));

export function ProfileDialog({ profile, sources, onClose }: { profile: Profile | null; sources: Source[]; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { clientId: activeClientId, clients } = useActiveClient();
  const [f, setF] = useState(() => ({
    clientId: profile?.clientId ?? activeClientId ?? clients[0]?.id ?? '',
    name: profile?.name ?? '',
    isActive: profile?.isActive ?? true,
    sources: (profile?.sources ?? ['google_places']) as SourceId[],
    country: profile?.country ?? GTA.country,
    regions: profile?.regions ?? GTA.regions,
    cities: profile?.cities ?? GTA.cities,
    industries: profile?.industries ?? [],
    keywords: profile?.keywords ?? [],
    excludeKeywords: profile?.excludeKeywords ?? [],
    employeeMin: profile?.employeeMin?.toString() ?? '',
    employeeMax: profile?.employeeMax?.toString() ?? '',
    maxResultsPerRun: String(profile?.maxResultsPerRun ?? 60),
    budgetDollars: String((profile?.monthlyBudgetCents ?? 2000) / 100),
    frequency: (profile?.frequency ?? 'MANUAL') as Frequency,
    autoResearch: profile?.autoResearch ?? false,
  }));
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const input = useMemo(() => ({
    clientId: f.clientId,
    icpId: profile?.icpId ?? null,
    name: f.name.trim() || 'Untitled profile',
    isActive: f.isActive,
    sources: f.sources,
    country: f.country,
    regions: f.regions,
    cities: f.cities,
    latitude: profile?.latitude ?? null,
    longitude: profile?.longitude ?? null,
    radiusKm: profile?.radiusKm ?? null,
    industries: f.industries,
    keywords: f.keywords,
    excludeKeywords: f.excludeKeywords,
    employeeMin: num(f.employeeMin),
    employeeMax: num(f.employeeMax),
    maxResultsPerRun: Number(f.maxResultsPerRun) || 60,
    monthlyBudgetCents: Math.round((Number(f.budgetDollars) || 0) * 100),
    frequency: f.frequency,
    autoResearch: f.autoResearch,
  }), [f, profile]);

  // Preview the plan once the inputs settle.
  const [debounced, setDebounced] = useState(input);
  useEffect(() => { const t = setTimeout(() => setDebounced(input), 400); return () => clearTimeout(t); }, [input]);
  const canPreview = !!debounced.clientId && debounced.sources.length > 0 && debounced.industries.length + debounced.keywords.length > 0;
  const preview = trpc.discovery.preview.useQuery(debounced, { enabled: canPreview, retry: false });

  const done = () => { void utils.discovery.profiles.invalidate(); onClose(); };
  const create = trpc.discovery.createProfile.useMutation({ onSuccess: done });
  const update = trpc.discovery.updateProfile.useMutation({ onSuccess: done });
  const saving = create.isPending || update.isPending;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = { ...input, name: f.name.trim() };
    if (profile) update.mutate({ id: profile.id, data });
    else create.mutate(data);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={profile ? 'Edit discovery profile' : 'New discovery profile'} width="lg"
            description="What to look for, where, from which sources, and how much it may spend.">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Name">{(id) => <input id={id} required className="input" placeholder="GTA machine shops" value={f.name} onChange={(e) => set('name')(e.target.value)} />}</Field>
          <Field label="Client">
            {(id) => (
              <select id={id} required className="input" value={f.clientId} onChange={(e) => set('clientId')(e.target.value)} disabled={!!profile}>
                <option value="">Choose a client…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </Field>
        </div>

        <Field label="Business categories" hint="One search per category and city. Be specific: “machine shop”, “dental clinic”, “commercial HVAC contractor”.">
          {(id) => <ListInput id={id} value={f.industries} onChange={set('industries')} placeholder="machine shop, tool and die…" max={20} />}
        </Field>
        <Field label="Extra keywords (optional)" hint="Searched as their own terms.">
          {(id) => <ListInput id={id} value={f.keywords} onChange={set('keywords')} placeholder="CNC machining…" max={20} />}
        </Field>
        <Field label="Skip results mentioning" hint="Whole words in the name or category, e.g. franchise names you don't sell to.">
          {(id) => <ListInput id={id} value={f.excludeKeywords} onChange={set('excludeKeywords')} placeholder="franchise…" max={40} />}
        </Field>

        <div className="grid sm:grid-cols-[1fr_120px_100px] gap-3">
          <Field label="Cities" hint={<button type="button" className="text-accent" onClick={() => setF((s) => ({ ...s, ...GTA }))}>Use the GTA defaults</button>}>
            {(id) => <ListInput id={id} value={f.cities} onChange={set('cities')} placeholder="Mississauga…" max={40} />}
          </Field>
          <Field label="Provinces">{(id) => <ListInput id={id} value={f.regions} onChange={set('regions')} placeholder="ON" max={13} />}</Field>
          <Field label="Country">{(id) => <input id={id} className="input" maxLength={2} value={f.country} onChange={(e) => set('country')(e.target.value.toUpperCase())} />}</Field>
        </div>

        <fieldset>
          <legend className="block text-[12px] font-medium mb-1.5">Sources</legend>
          <div className="flex flex-wrap gap-3">
            {sources.map((s) => (
              <label key={s.id} className="flex items-center gap-1.5 text-micro">
                <input type="checkbox" checked={f.sources.includes(s.id as SourceId)}
                       onChange={(e) => set('sources')(e.target.checked ? [...f.sources, s.id as SourceId] : f.sources.filter((x) => x !== s.id))} />
                {s.name}{!s.usable && <span className="text-held">(not connected yet)</span>}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid sm:grid-cols-4 gap-3">
          <Field label="Min employees" hint="Applied when a source reports size.">{(id) => <input id={id} type="number" min={0} className="input" value={f.employeeMin} onChange={(e) => set('employeeMin')(e.target.value)} />}</Field>
          <Field label="Max employees">{(id) => <input id={id} type="number" min={1} className="input" value={f.employeeMax} onChange={(e) => set('employeeMax')(e.target.value)} />}</Field>
          <Field label="Results per run">{(id) => <input id={id} type="number" min={1} max={500} className="input" value={f.maxResultsPerRun} onChange={(e) => set('maxResultsPerRun')(e.target.value)} />}</Field>
          <Field label="Monthly budget (US$)" hint="Hard limit; runs stop before exceeding it.">{(id) => <input id={id} type="number" min={0} step="1" className="input" value={f.budgetDollars} onChange={(e) => set('budgetDollars')(e.target.value)} />}</Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 items-end">
          <Field label="Schedule" hint="Scheduled runs need the worker, or Vercel Cron (once a day on the Hobby plan).">
            {(id) => (
              <select id={id} className="input" value={f.frequency} onChange={(e) => set('frequency')(e.target.value as Frequency)}>
                {Object.entries(FREQUENCY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            )}
          </Field>
          <div className="space-y-1.5 pb-1">
            <label className="flex items-center gap-1.5 text-micro"><input type="checkbox" checked={f.isActive} onChange={(e) => set('isActive')(e.target.checked)} /> Active</label>
            <label className="flex items-center gap-1.5 text-micro"><input type="checkbox" checked={f.autoResearch} onChange={(e) => set('autoResearch')(e.target.checked)} /> Queue website research for new accounts (uses the AI budget)</label>
          </div>
        </div>

        <div className="rounded-md border border-hairline p-3 text-micro">
          <p className="eyebrow mb-1">What a run would do</p>
          {!canPreview ? <p className="text-muted">Add a category and a source to see the planned searches.</p>
            : preview.isPending ? <p className="text-muted">Planning…</p>
            : preview.error ? <ErrorNote error={preview.error} />
            : preview.data?.map((p) => (
              <div key={p.source} className="mb-2 last:mb-0">
                <p><span className="font-medium">{SOURCE_LABELS[p.source]}</span>: {p.queries.length} search{p.queries.length === 1 ? '' : 'es'}, at most {p.maxRequests} paid requests, about {usd(p.maxCostMillicents, true)} per run at most.</p>
                <p className="text-[11px] text-muted truncate" title={p.queries.join('\n')}>{p.queries.slice(0, 3).join(' · ')}{p.queries.length > 3 ? ` · +${p.queries.length - 3} more` : ''}</p>
              </div>
            ))}
        </div>

        <ErrorNote error={create.error ?? update.error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving || !f.clientId || !f.name.trim() || !f.sources.length}>
            {saving ? 'Saving…' : profile ? 'Save profile' : 'Create profile'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
