'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarCheck, Check, FileText, Inbox, Mail, Receipt, Sheet, Sparkles, UserPlus } from 'lucide-react';

/**
 * The hero's moving picture: three everyday jobs, each traced from what
 * arrives, through the steps Relay's software takes, to what is done. A
 * sample, labelled as one; it shows the shape of the work, not results.
 */

type Card = { icon: typeof FileText; title: string; meta: string; tone?: 'flag' };
type Scenario = { key: string; label: string; title: string; inputs: Card[]; steps: string[]; outputs: Card[]; log: string[] };

const SCENARIOS: Scenario[] = [
  {
    key: 'ops', label: 'Operations', title: 'A supplier invoice, handled',
    inputs: [
      { icon: Receipt, title: 'INV-4471.pdf', meta: 'Arrived in the accounts inbox' },
      { icon: Sheet, title: 'PO-2210', meta: 'Open purchase order' },
    ],
    steps: ['Read the invoice', 'Match it to the purchase order', 'Check quantities, totals and tax', 'Record it in accounting'],
    outputs: [
      { icon: Check, title: 'Bill recorded', meta: 'Coded to the right job and account' },
      { icon: Sparkles, title: 'Freight variance flagged', meta: '$42.10 over the PO, sent for approval', tone: 'flag' },
      { icon: Mail, title: 'Receipt confirmed to supplier', meta: 'Drafted from your template' },
    ],
    log: ['invoice.read', 'po.match', 'totals.check', 'variance.flag', 'bill.record'],
  },
  {
    key: 'customers', label: 'Customers', title: 'A new inquiry, qualified',
    inputs: [
      { icon: Inbox, title: 'Website inquiry', meta: 'Kitchen renovation, about 180 sq ft' },
      { icon: FileText, title: 'Your rate sheet', meta: 'Cabinetry, counters, finishing' },
    ],
    steps: ['Read what the customer asked for', 'Check service area and fit', 'Draft an estimate from your rates', 'Propose a site visit'],
    outputs: [
      { icon: FileText, title: 'Draft estimate ready', meta: 'For your review before it is sent' },
      { icon: CalendarCheck, title: 'Site visit proposed', meta: 'Tuesday 10:00, two options offered' },
      { icon: UserPlus, title: 'Lead added to your CRM', meta: 'With the full inquiry attached' },
    ],
    log: ['inquiry.read', 'area.check', 'estimate.draft', 'visit.propose', 'crm.create'],
  },
  {
    key: 'online', label: 'Online', title: 'A booking, confirmed',
    inputs: [
      { icon: CalendarCheck, title: 'Booking request', meta: 'Colour · Saturday afternoon' },
      { icon: Sheet, title: 'Staff calendars', meta: 'Three stylists, one with colour training' },
    ],
    steps: ['Find a slot long enough for the service', 'Hold it with the right stylist', 'Confirm with the customer', 'Schedule reminders'],
    outputs: [
      { icon: Check, title: 'Booked with Maya', meta: 'Saturday 2:15 pm, 2 hours' },
      { icon: Mail, title: 'Reminders scheduled', meta: '24 hours and 2 hours before' },
      { icon: Sparkles, title: 'Rebooking nudge', meta: 'Eight weeks after the visit' },
    ],
    log: ['request.read', 'slot.find', 'slot.hold', 'customer.confirm', 'reminders.schedule'],
  },
];

const STEP_MS = 950;
const HOLD_MS = 2600;

export function HeroWorkflow() {
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(true);
  const [still, setStill] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scenario = SCENARIOS[index]!;
  const total = scenario.steps.length;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setStill(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (still) { setStep(total); return; }
    if (timer.current) clearTimeout(timer.current);
    if (step < total) timer.current = setTimeout(() => setStep((s) => s + 1), step === 0 ? 500 : STEP_MS);
    else if (auto) timer.current = setTimeout(() => { setIndex((i) => (i + 1) % SCENARIOS.length); setStep(0); }, HOLD_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [step, total, auto, still]);

  const choose = (i: number) => { setAuto(false); setIndex(i); setStep(0); };
  const done = step >= total;

  return (
    <div className="relative">
      <figure aria-label={`Sample workflow: ${scenario.title}`} data-spot className="on-dark relative rounded-[28px] overflow-hidden border border-site-seam shadow-[0_50px_100px_-50px_rgba(11,18,32,0.7)]">
        <div className="absolute inset-0 s-grid-bg pointer-events-none" aria-hidden="true" />
        <div className="relative flex items-center justify-between gap-3 border-b border-site-seam px-4 sm:px-5 py-3">
          <div role="group" aria-label="Choose an example" className="flex gap-1 rounded-full bg-white/5 p-1">
            {SCENARIOS.map((s, i) => (
              <button key={s.key} type="button" aria-pressed={i === index} onClick={() => choose(i)}
                className={`rounded-full px-3 sm:px-3.5 h-8 text-[0.8rem] transition-colors ${i === index ? 'bg-site-paper text-site-night' : 'text-site-haze hover:text-site-paper'}`}>
                {s.label}
              </button>
            ))}
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 s-label"><span className="size-1.5 rounded-full bg-site-tide s-pulse" />sample workflow</span>
        </div>

        <div className="relative grid gap-4 p-4 sm:p-5 md:grid-cols-[1fr_1.2fr_1fr] md:gap-5 lg:p-6 lg:pb-12">
          <Column title="Arrives">
            {scenario.inputs.map((c, i) => <CardRow key={`${scenario.key}-in-${i}`} card={c} delay={i * 80} />)}
          </Column>

          <Column title={scenario.title} accent>
            <ol className="space-y-1.5">
              {scenario.steps.map((label, i) => {
                const state = i < step ? 'done' : i === step && !done ? 'running' : 'waiting';
                return (
                  <li key={`${scenario.key}-s-${i}`} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-300 ${state === 'running' ? 'bg-site-spark/10' : ''}`}>
                    <span className={`grid size-5 shrink-0 place-items-center rounded-full border transition-colors duration-300 ${state === 'done' ? 'bg-site-tide border-site-tide text-site-night' : state === 'running' ? 'border-site-spark' : 'border-site-seam'}`}>
                      {state === 'done' ? <Check className="size-3" strokeWidth={3} /> : state === 'running' ? <span className="size-1.5 rounded-full bg-site-spark s-pulse" /> : null}
                    </span>
                    <span className={`text-[0.86rem] transition-colors duration-300 ${state === 'waiting' ? 'text-site-haze/70' : 'text-site-paper'}`}>{label}</span>
                  </li>
                );
              })}
            </ol>
            <div className="mt-3 h-1 rounded-full bg-white/10 overflow-hidden" aria-hidden="true">
              <div className="h-full bg-site-spark transition-[width] duration-700 ease-out" style={{ width: `${(Math.min(step, total) / total) * 100}%` }} />
            </div>
          </Column>

          <Column title="Done">
            {scenario.outputs.map((c, i) => (
              <div key={`${scenario.key}-out-${i}`} className={`transition-all duration-500 ${done ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`} style={{ transitionDelay: done ? `${i * 140}ms` : '0ms' }}>
                <CardRow card={c} />
              </div>
            ))}
          </Column>
        </div>
      </figure>
      {/* A layer in front: the run log, as an engineer would see it. */}
      <div aria-hidden="true" className="absolute -bottom-7 left-8 hidden lg:block w-[300px] rounded-[18px] border border-site-rule bg-site-chalk p-4 shadow-[0_30px_60px_-30px_rgba(11,18,32,0.55)] rotate-[-1.2deg]">
        <p className="s-label mb-2 flex items-center justify-between"><span>run log</span><span>sample</span></p>
        <ul className="font-mono text-[0.68rem] leading-[1.75] text-site-fog">
          {scenario.log.map((l, i) => (
            <li key={`${scenario.key}-${l}`} className={`flex justify-between transition-opacity duration-300 ${i <= step ? 'opacity-100' : 'opacity-30'}`}>
              <span>{`09:14:${String(2 + i * 3).padStart(2, '0')}  ${l}`}</span>
              <span className={i < step || (done && i === scenario.log.length - 1) ? 'text-[#0B7F71]' : ''}>{i < step || (done && i === scenario.log.length - 1) ? 'ok' : '…'}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Column({ title, accent, children }: { title: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl p-3 ${accent ? 'bg-site-deep border border-site-seam' : ''}`}>
      <p className="s-label mb-3 px-1">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function CardRow({ card, delay = 0 }: { card: Card; delay?: number }) {
  const Icon = card.icon;
  return (
    <div className="s-rise flex items-start gap-3 rounded-xl border border-site-seam bg-site-night/60 p-3" style={{ animationDelay: `${delay}ms` }}>
      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${card.tone === 'flag' ? 'bg-site-coral/15 text-site-coral' : 'bg-white/[0.06] text-site-spark'}`}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[0.85rem] text-site-paper leading-snug">{card.title}</span>
        <span className="block text-[0.75rem] text-site-haze leading-snug mt-0.5">{card.meta}</span>
      </span>
    </div>
  );
}
