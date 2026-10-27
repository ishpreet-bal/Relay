'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { CalendarClock, HelpCircle } from 'lucide-react';
import { draftEstimate, dueLabel, SAMPLE_INQUIRIES } from '@/site/demos/estimate';
import { money } from '@/site/demos/random';
import { Badge, DraftNote, Frame, Panel } from './ui';

export function EstimateDemo() {
  const [text, setText] = useState(SAMPLE_INQUIRIES[0]!.text);
  const deferred = useDeferredValue(text);
  const e = useMemo(() => draftEstimate(deferred), [deferred]);
  const p = e.parsed;

  const found: [string, string | null][] = [
    ['Project', p.type ? p.type[0]!.toUpperCase() + p.type.slice(1) : null],
    ['Size', p.areaSqFt ? `${p.areaSqFt.toLocaleString('en-CA')} sq ft` : null],
    ['Material', p.material],
    ['Timing', p.timeline],
    ['Location', p.location],
  ];

  return (
    <Frame title="Inquiry to draft estimate">
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-5 space-y-4">
          <Panel title="1 · The customer’s inquiry">
            <div className="mb-3 flex flex-wrap gap-1.5">
              {SAMPLE_INQUIRIES.map((s) => (
                <button key={s.label} type="button" onClick={() => setText(s.text)} aria-pressed={text === s.text}
                  className={`rounded-full border px-3 h-8 text-[0.8rem] transition-colors ${text === s.text ? 'border-site-night bg-site-night text-site-paper' : 'border-site-rule bg-white hover:border-site-night/40'}`}>
                  {s.label}
                </button>
              ))}
            </div>
            <label className="block">
              <span className="sr-only">Inquiry text</span>
              <textarea value={text} onChange={(ev) => setText(ev.target.value)} rows={7} maxLength={1200}
                className="s-field h-auto py-3 leading-relaxed resize-y" />
            </label>
            <p className="mt-2 s-label">Edit it, or write your own: try “bathroom, 60 sq ft, porcelain tile, Brampton”.</p>
          </Panel>

          <Panel title="2 · What we picked out">
            <dl className="grid grid-cols-2 gap-2">
              {found.map(([k, v]) => (
                <div key={k} className="rounded-xl border border-site-rule px-3 py-2">
                  <dt className="s-label">{k}</dt>
                  <dd className={`mt-0.5 text-[0.9rem] ${v ? '' : 'text-site-fog italic'}`}>{v ?? 'not given'}</dd>
                </div>
              ))}
              <div className="rounded-xl border border-site-rule px-3 py-2">
                <dt className="s-label">Structural work</dt>
                <dd className="mt-0.5 text-[0.9rem]">{p.structural ? 'Mentioned' : 'None mentioned'}</dd>
              </div>
            </dl>
          </Panel>

          {e.questions.length > 0 && (
            <Panel title="Questions for the customer" aside={<HelpCircle className="size-4 text-site-fog" />}>
              <ul className="space-y-1.5 text-[0.9rem]">{e.questions.map((q) => <li key={q} className="flex gap-2"><span className="text-site-signal">?</span>{q}</li>)}</ul>
              <DraftNote>Drafted as a reply for the estimator to send.</DraftNote>
            </Panel>
          )}
        </div>

        <div className="lg:col-span-7 space-y-4">
          <Panel title="3 · Draft estimate" aside={<Badge tone="info">Sample rates</Badge>}>
            {e.items.length === 0 ? (
              <p className="text-[0.92rem] text-site-fog">Not enough detail to price yet. The system asks the questions on the left instead of guessing.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-[0.86rem] tabular">
                    <tbody>
                      {e.items.map((l) => (
                        <tr key={l.label} className="border-b border-site-rule">
                          <td className="py-2.5 pr-3">{l.label}<span className="block text-[0.75rem] text-site-fog">{l.basis}</span></td>
                          <td className="py-2.5 text-right whitespace-nowrap">{money(l.cents)}</td>
                        </tr>
                      ))}
                      <tr><td className="pt-3 text-site-fog">Subtotal</td><td className="pt-3 text-right">{money(e.subtotal)}</td></tr>
                      <tr><td className="py-1 text-site-fog">Contingency (10%)</td><td className="py-1 text-right">{money(e.contingency)}</td></tr>
                      <tr><td className="py-1 text-site-fog">HST (13%)</td><td className="py-1 text-right">{money(e.tax)}</td></tr>
                      <tr className="border-t border-site-night/20"><td className="pt-3 font-medium">Total</td><td className="pt-3 text-right font-medium">{money(e.total)}</td></tr>
                    </tbody>
                  </table>
                </div>
                <div className="mt-5 rounded-xl bg-site-night text-site-paper px-4 py-3.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="s-label !text-site-haze">Range to quote</span>
                  <span className="font-serif text-[1.4rem] tracking-[-0.02em] tabular">{money(e.range[0])} – {money(e.range[1])}</span>
                </div>
                <DraftNote>A person checks every estimate before it is sent. A real system uses your own rate sheet.</DraftNote>
              </>
            )}
          </Panel>

          <Panel title="4 · Tasks created" aside={<CalendarClock className="size-4 text-site-fog" />}>
            <ol className="space-y-2">
              {e.tasks.map((t, i) => (
                <li key={t.title} className="flex items-center justify-between gap-3 rounded-xl border border-site-rule px-3 py-2.5 text-[0.88rem]">
                  <span className="flex items-center gap-3"><span className="grid size-6 place-items-center rounded-full bg-site-sand font-mono text-[0.68rem]">{i + 1}</span>{t.title}</span>
                  <span className="shrink-0 font-mono text-[0.75rem] text-site-fog">{dueLabel(t.inBusinessDays)}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </Frame>
  );
}
