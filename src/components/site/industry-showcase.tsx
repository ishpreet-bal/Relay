'use client';

import Link from 'next/link';
import { useId, useMemo, useRef, useState } from 'react';
import { ArrowRight, Info } from 'lucide-react';
import { INDUSTRIES } from '@/site/content/industries';
import { buildReport, sampleRecords, validate } from '@/site/demos/quality';
import { draftEstimate, SAMPLE_INQUIRIES } from '@/site/demos/estimate';
import { dispatchSummary } from '@/site/demos/shipments';
import { route, SAMPLE_ITEMS } from '@/site/demos/clinic';
import { findSlots, time } from '@/site/demos/booking';
import { draftOrders, initialState } from '@/site/demos/inventory';
import { DEFAULT_PROFILE, rank } from '@/site/demos/prospects';
import { money, percent } from '@/site/demos/random';

/**
 * A sample run for each industry, computed by the same logic as the full
 * demo, so the preview never shows a number the demo would not produce.
 */
function sampleRun(slug: string): { input: string; output: string[] } {
  switch (slug) {
    case 'manufacturing': {
      const r = buildReport(validate(sampleRecords()), { toleranceMm: 0.05, targetYield: 0.95 });
      return { input: '36 inspection records from three lines, in three formats', output: [`${r.excluded} blank sent back, ${r.corrected} corrected automatically`, `First-pass yield ${percent(r.overall.yield)} overall`, r.alerts[0] ?? 'Every line on target'] };
    }
    case 'construction': {
      const e = draftEstimate(SAMPLE_INQUIRIES[0]!.text);
      return { input: `“${SAMPLE_INQUIRIES[0]!.text.slice(0, 86)}…”`, output: [`Kitchen, ${e.parsed.areaSqFt} sq ft, ${e.parsed.material}, ${e.parsed.location}`, `Draft estimate ${money(e.range[0])} to ${money(e.range[1])}`, `${e.tasks.length} follow-up tasks, including a permit check`] };
    }
    case 'logistics': {
      const s = dispatchSummary(12 * 60);
      return { input: '8 shipments, scan events up to 12:00 pm', output: [`${s.counts.Delivered} delivered, ${s.counts['In transit']} on time, ${s.counts['At risk'] + s.counts.Delayed} running late`, `${s.updates} customer updates from ${s.events} scan events`, 'Updates only when a status changes'] };
    }
    case 'clinics': {
      const routed = SAMPLE_ITEMS.map(route);
      const queues = new Set(routed.map((r) => r.queue));
      const clinical = routed.filter((r) => !r.automated).length;
      return { input: `${SAMPLE_ITEMS.length} faxes, emails, forms and voicemails`, output: [`Routed to ${queues.size} queues with a priority each`, `${clinical} clinical question${clinical === 1 ? '' : 's'} handed to the clinical team`, 'Reminders scheduled for tomorrow, no clinical details'] };
    }
    case 'local-services': {
      const [slot] = findSlots('colour', 'any', 14 * 60);
      return { input: 'Colour, any stylist, around 2:00 pm', output: [slot ? `Best fit: ${time(slot.start)} with ${slot.staff}, 2 hours` : 'No 2-hour gap today: next day offered', 'Confirmation sent, reminders at 24 h and 2 h', 'Rebooking nudge in 8 weeks'] };
    }
    case 'retail': {
      const d = draftOrders(initialState(), 3);
      const lines = d.reduce((n, o) => n + o.lines.length, 0);
      return { input: '8 products, stock and daily sales', output: [`${lines} items at their reorder point`, `${d.length} draft purchase orders, one per supplier`, 'Waiting for your approval'] };
    }
    case 'startups': {
      const r = rank(DEFAULT_PROFILE);
      return { input: '14 businesses, one ideal customer profile', output: [`${r.qualified} qualified, each with its reasons`, `Top match: ${r.scored[0]!.name} (${r.scored[0]!.score}/100)`, 'Openers drafted for review; nothing sent'] };
    }
    default: return { input: '', output: [] };
  }
}

const CYCLE_MS = 7000;

export function IndustryShowcase() {
  const [active, setActive] = useState(0);
  // Advances on its own, like a slideshow, until someone picks an industry.
  const [auto, setAuto] = useState(true);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const industry = INDUSTRIES[active]!;
  const run = useMemo(() => sampleRun(industry.slug), [industry.slug]);

  const onKey = (e: React.KeyboardEvent) => {
    const keys: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    if (e.key in keys) {
      e.preventDefault();
      const next = (active + keys[e.key]! + INDUSTRIES.length) % INDUSTRIES.length;
      setAuto(false);
      setActive(next);
      tabs.current[next]?.focus();
    }
  };

  return (
    <div className="group/show grid gap-6 lg:grid-cols-12">
      <div role="tablist" aria-label="Industries" aria-orientation="vertical" onKeyDown={onKey}
        className="lg:col-span-4 flex lg:flex-col gap-2 overflow-x-auto pb-2 lg:pb-0 -mx-4 px-4 lg:mx-0 lg:px-0 snap-x">
        {INDUSTRIES.map((ind, i) => (
          <button key={ind.slug} ref={(el) => { tabs.current[i] = el; }} role="tab" type="button" id={`${id}-tab-${i}`}
            aria-selected={i === active} aria-controls={`${id}-panel`} tabIndex={i === active ? 0 : -1} onClick={() => { setAuto(false); setActive(i); }}
            className={`relative overflow-hidden snap-start shrink-0 lg:shrink text-left rounded-2xl border px-4 py-3.5 lg:px-5 lg:py-4 transition-all duration-300 ease-[cubic-bezier(.2,.7,.1,1)] hover:translate-x-1 ${i === active ? 'border-site-night bg-site-night text-site-paper shadow-[0_20px_40px_-28px_rgba(11,18,32,0.8)]' : 'border-site-rule bg-site-chalk hover:border-site-night/30'}`}>
            <span className="flex items-center gap-3">
              <span className={`font-mono text-[0.7rem] ${i === active ? 'text-site-spark' : 'text-site-signal'}`}>{String(i + 1).padStart(2, '0')}</span>
              <span className="text-[0.98rem] font-medium whitespace-nowrap lg:whitespace-normal">{ind.name}</span>
            </span>
            <span className={`hidden lg:block mt-1 pl-8 text-[0.84rem] leading-snug ${i === active ? 'text-site-haze' : 'text-site-fog'}`}>{ind.short}</span>
            {auto && i === active && (
              <span aria-hidden="true" onAnimationEnd={() => setActive((a) => (a + 1) % INDUSTRIES.length)}
                className="absolute left-0 bottom-0 h-[2px] w-full origin-left bg-site-spark animate-[s-progress_linear_forwards] motion-reduce:hidden group-hover/show:[animation-play-state:paused] group-focus-within/show:[animation-play-state:paused]"
                style={{ animationDuration: `${CYCLE_MS}ms` }} />
            )}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${active}`} key={industry.slug} data-spot className="lg:col-span-8 s-card p-6 sm:p-9 s-rise">
        <p className="s-eyebrow">Example solutions · {industry.name}</p>
        <p className="mt-4 text-[1.4rem] sm:text-[1.65rem] font-semibold leading-[1.2] tracking-[-0.035em] text-balance">{industry.intro}</p>
        <ul className="mt-6 flex flex-wrap gap-2">
          {industry.solutions.map((s) => <li key={s} className="s-chip">{s}</li>)}
        </ul>

        <div className="mt-8">
          <p className="s-label mb-3">A suggested workflow</p>
          <ol className="grid gap-2 sm:grid-cols-4">
            {industry.workflow.map((w, i) => (
              <li key={w.step} className="relative rounded-2xl border border-site-rule bg-white/70 p-4 s-rise" style={{ animationDelay: `${i * 90}ms` }}>
                <span className="flex items-center gap-2">
                  <span className="grid size-6 place-items-center rounded-full bg-site-signal text-white font-mono text-[0.68rem] animate-[s-flow_4.8s_ease-in-out_infinite]" style={{ animationDelay: `${i * 1.2}s` }}>{i + 1}</span>
                  <span className="font-medium text-[0.95rem]">{w.step}</span>
                </span>
                <span className="mt-2 block text-[0.84rem] leading-snug text-site-fog">{w.detail}</span>
                {i < industry.workflow.length - 1 && <ArrowRight className="hidden sm:block absolute -right-[13px] top-1/2 -translate-y-1/2 size-4 text-site-signal/60 bg-site-chalk rounded-full" aria-hidden="true" />}
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-8 on-dark rounded-2xl p-5 sm:p-6 relative overflow-hidden">
          <div className="absolute inset-0 s-grid-bg pointer-events-none" aria-hidden="true" />
          <div className="relative flex items-center justify-between gap-3">
            <p className="s-label">Sample run · fictional data</p>
            <span className="inline-flex items-center gap-1.5 s-label"><span className="size-1.5 rounded-full bg-site-tide s-pulse" />computed live</span>
          </div>
          <div className="relative mt-4 grid gap-4 sm:grid-cols-[1fr_auto_1.2fr] sm:items-center">
            <p className="text-[0.92rem] text-site-haze leading-snug">{run.input}</p>
            <ArrowRight className="hidden sm:block size-5 text-site-spark" aria-hidden="true" />
            <ul className="space-y-1.5">
              {run.output.map((o) => <li key={o} className="flex gap-2 text-[0.92rem] leading-snug"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-site-tide" />{o}</li>)}
            </ul>
          </div>
        </div>

        {industry.note && (
          <p className="mt-5 flex gap-2.5 text-[0.84rem] leading-relaxed text-site-fog"><Info className="size-4 shrink-0 mt-0.5" />{industry.note}</p>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={`/demos/${industry.demo}`} className="s-btn-primary h-11">Try the full demo <ArrowRight className="size-4" /></Link>
        </div>
      </div>
    </div>
  );
}
