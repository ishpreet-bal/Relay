'use client';

import { useState } from 'react';
import { Puzzle, Wrench } from 'lucide-react';

type Company = { key: string; label: string; need: string; uses: string; requires: string; build: string; modules: string[] };

const MODULES = ['Spreadsheet import', 'Database connector', 'Document intake', 'Data validation', 'Scheduler', 'Approval flow', 'Supplier scorecard', 'Claims dashboard', 'Email notifications'];
const SHARED = new Set(['Data validation', 'Email notifications']);

const COMPANIES: Company[] = [
  { key: 'a', label: 'Manufacturer A', need: 'Supplier reporting', uses: 'Spreadsheets and email', requires: 'Scheduled reports',
    build: 'A supplier scorecard, built from the purchasing spreadsheet and emailed every Monday.',
    modules: ['Spreadsheet import', 'Data validation', 'Scheduler', 'Supplier scorecard', 'Email notifications'] },
  { key: 'b', label: 'Manufacturer B', need: 'Quality claims', uses: 'A database and a document system', requires: 'Approvals and dashboards',
    build: 'A claims workflow: documents filed, claims checked, routed for approval and tracked live.',
    modules: ['Database connector', 'Document intake', 'Data validation', 'Approval flow', 'Claims dashboard', 'Email notifications'] },
];

/** Same industry, same building blocks, two different solutions. */
export function BuiltAround() {
  const [active, setActive] = useState(0);
  const c = COMPANIES[active]!;
  return (
    <div data-reveal className="grid gap-5 lg:grid-cols-12">
      <div className="lg:col-span-5 s-card p-6 sm:p-8 flex flex-col">
        <div role="tablist" aria-label="Choose a company" className="relative grid grid-cols-2 rounded-full border border-site-rule bg-site-paper p-1">
          <span aria-hidden="true" className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-full bg-site-night transition-transform duration-500 ease-[cubic-bezier(.2,.7,.1,1)]"
            style={{ transform: `translateX(${active * 100}%)` }} />
          {COMPANIES.map((co, i) => (
            <button key={co.key} role="tab" type="button" aria-selected={i === active} onClick={() => setActive(i)}
              className={`relative z-[1] h-10 rounded-full text-[0.9rem] transition-colors duration-300 ${i === active ? 'text-site-paper' : 'text-site-fog hover:text-site-night'}`}>
              {co.label}
            </button>
          ))}
        </div>
        <dl key={c.key} className="mt-8 space-y-5">
          {[['Needs', c.need], ['Uses today', c.uses], ['Requires', c.requires]].map(([k, v], i) => (
            <div key={k} className="s-rise" style={{ animationDelay: `${i * 80}ms` }}>
              <dt className="s-label">{k}</dt>
              <dd className="mt-1 text-[1.4rem] font-semibold leading-tight tracking-[-0.03em]">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="lg:col-span-7 on-dark relative overflow-hidden rounded-[22px] p-6 sm:p-8">
        <div className="absolute inset-0 s-grid-bg pointer-events-none" aria-hidden="true" />
        <p className="relative s-label">What we would build</p>
        <p key={c.key} className="relative mt-3 text-[1.45rem] font-medium leading-snug tracking-[-0.03em] s-rise">{c.build}</p>
        <ul className="relative mt-8 grid grid-cols-2 sm:grid-cols-3 gap-2" aria-label="Components">
          {MODULES.map((m) => {
            const on = c.modules.includes(m);
            const shared = SHARED.has(m);
            return (
              <li key={m} aria-hidden={!on}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[0.84rem] transition-all duration-500 ease-[cubic-bezier(.2,.7,.1,1)] ${on
                  ? shared ? 'border-site-spark/50 bg-site-spark/15 text-site-paper scale-100 opacity-100' : 'border-site-seam bg-site-deep text-site-paper scale-100 opacity-100'
                  : 'border-transparent bg-white/[0.02] text-site-haze/40 scale-[0.94] opacity-40'}`}>
                {shared ? <Puzzle className="size-3.5 shrink-0 text-site-spark" /> : <Wrench className="size-3.5 shrink-0 opacity-60" />}
                <span className="truncate">{m}</span>
              </li>
            );
          })}
        </ul>
        <p className="relative mt-6 flex flex-wrap gap-x-5 gap-y-1 s-label">
          <span className="inline-flex items-center gap-1.5"><Puzzle className="size-3.5 text-site-spark" />Proven, reused</span>
          <span className="inline-flex items-center gap-1.5"><Wrench className="size-3.5" />Built for them</span>
        </p>
      </div>
    </div>
  );
}
