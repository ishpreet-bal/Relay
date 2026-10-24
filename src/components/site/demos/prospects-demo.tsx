'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { DEFAULT_PROFILE, INDUSTRIES, rank, SIGNALS, type Profile, type Region } from '@/site/demos/prospects';
import { Badge, Bar, ChoiceChips, Frame, Panel, Range } from './ui';

const REGIONS: Region[] = ['GTA', 'Rest of Ontario', 'Outside Ontario'];

export function ProspectsDemo() {
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [open, setOpen] = useState<string | null>('Halcrest Metal Works');
  const { scored, qualified } = useMemo(() => rank(profile), [profile]);
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setProfile((p) => ({ ...p, [k]: v }));

  return (
    <Frame title="Ideal customer profile · prospect qualification">
      <div className="grid gap-4 lg:grid-cols-12">
        <Panel title="1 · Who you sell to" className="lg:col-span-4 self-start">
          <div className="space-y-5">
            <ChoiceChips multi label="Industries" value={profile.industries} onChange={(v) => set('industries', v)} options={INDUSTRIES.map((i) => ({ value: i, label: i }))} />
            <ChoiceChips multi label="Where" value={profile.regions} onChange={(v) => set('regions', v)} options={REGIONS.map((r) => ({ value: r, label: r }))} />
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="s-label">Min employees</span>
                <input type="number" min={1} max={profile.maxEmployees} value={profile.minEmployees} onChange={(e) => set('minEmployees', Math.max(1, Number(e.target.value) || 1))} className="s-field mt-2 h-10 tabular" /></label>
              <label className="block"><span className="s-label">Max employees</span>
                <input type="number" min={profile.minEmployees} max={10000} value={profile.maxEmployees} onChange={(e) => set('maxEmployees', Math.max(profile.minEmployees, Number(e.target.value) || profile.minEmployees))} className="s-field mt-2 h-10 tabular" /></label>
            </div>
            <ChoiceChips multi label="Buying signals" value={profile.signals} onChange={(v) => set('signals', v)} options={SIGNALS.map((s) => ({ value: s, label: s }))} />
            <Range label="Qualify at" value={profile.threshold} min={30} max={100} step={5} onChange={(v) => set('threshold', v)} format={(v) => `${v} / 100`} />
            <button type="button" onClick={() => setProfile(DEFAULT_PROFILE)} className="s-btn-quiet h-9 w-full text-[0.82rem]">Reset profile</button>
          </div>
        </Panel>

        <div className="lg:col-span-8 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="s-label">2 · {scored.length} businesses scored · <span className="text-site-night">{qualified} qualified</span></p>
            <p className="s-label">Fictional companies</p>
          </div>
          <ul className="space-y-2">
            {scored.map((p) => {
              const isOpen = open === p.name;
              return (
                <li key={p.name} className={`rounded-2xl border bg-white transition-colors ${p.qualified ? 'border-site-signal/30' : 'border-site-rule'}`}>
                  <button type="button" onClick={() => setOpen(isOpen ? null : p.name)} aria-expanded={isOpen} className="w-full px-4 py-3.5 text-left">
                    <span className="flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block font-medium text-[0.95rem] truncate">{p.name}</span>
                        <span className="block text-[0.78rem] text-site-fog">{p.industry} · {p.city} · {p.employees} employees</span>
                      </span>
                      <span className="flex items-center gap-3 shrink-0">
                        <span className="hidden sm:block w-28"><Bar value={p.score / 100} target={profile.threshold / 100} tone={p.qualified ? 'good' : 'info'} /></span>
                        <span className="w-8 text-right tabular text-[0.9rem]">{p.score}</span>
                        <Badge tone={p.qualified ? 'good' : 'muted'}>{p.qualified ? 'Qualified' : 'Not now'}</Badge>
                        <ChevronDown className={`size-4 text-site-fog transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-site-rule px-4 py-3.5 s-rise">
                      <p className="s-label mb-2">3 · Why</p>
                      <ul className="space-y-1.5">
                        {p.reasons.map((r) => (
                          <li key={r.label} className="flex items-center justify-between gap-3 text-[0.86rem]">
                            <span className="flex items-start gap-2">{r.met ? <Check className="size-4 shrink-0 text-[#0B7F71] mt-0.5" /> : <X className="size-4 shrink-0 text-site-fog mt-0.5" />}{r.label}</span>
                            <span className="tabular text-site-fog shrink-0">{r.points}/{r.max}</span>
                          </li>
                        ))}
                      </ul>
                      {p.opener && (
                        <div className="mt-3 rounded-xl bg-site-paper/70 p-3">
                          <p className="s-label">4 · Opening line, drafted for review</p>
                          <p className="mt-1.5 text-[0.9rem] leading-snug">“{p.opener}”</p>
                          <p className="mt-2 s-label">A person reviews and approves before anything is sent. Nothing is sent from this demo.</p>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Frame>
  );
}
