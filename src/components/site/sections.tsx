import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Cable, Inbox, LifeBuoy, Link2, MessagesSquare, PenTool, Radar, Users } from 'lucide-react';
import { DEMOS } from '@/site/demos/catalog';

/** A short, numbered section heading that rises into view. */
export function SectionHead({ number, eyebrow, title, lede, align = 'left', className = '' }: {
  number?: string; eyebrow: string; title: React.ReactNode; lede?: React.ReactNode; align?: 'left' | 'center'; className?: string;
}) {
  const center = align === 'center';
  return (
    <div className={`${center ? 'mx-auto text-center max-w-3xl' : 'max-w-3xl'} ${className}`}>
      <p data-reveal className={`s-eyebrow flex items-center gap-3 ${center ? 'justify-center' : ''}`}>
        {number && <span className="s-num">{number}</span>}
        {number && <span className="h-px w-8 bg-current opacity-30" aria-hidden="true" />}
        {eyebrow}
      </p>
      <h2 data-reveal style={{ '--d': '80ms' } as React.CSSProperties} className="s-h2 mt-5 text-balance">{title}</h2>
      {lede && <p data-reveal style={{ '--d': '160ms' } as React.CSSProperties} className="s-lede mt-5 text-pretty">{lede}</p>}
    </div>
  );
}

const TICKER = ['Invoice processing', 'Quality reports', 'Inventory alerts', 'Online booking', 'Lead research', 'Quotes and estimates', 'Customer updates',
  'Data sync', 'Live dashboards', 'Employee onboarding', 'Business websites', 'Appointment reminders', 'CRM setup', 'Supplier follow-ups'];

/** A slow ticker of the work we take on: a lot said in very few words. */
export function Ticker() {
  const row = TICKER.map((t) => (
    <span key={t} className="flex items-center gap-8 pr-8 shrink-0">
      <span className="font-serif italic text-[1.6rem] sm:text-[2rem] tracking-[-0.02em] whitespace-nowrap">{t}</span>
      <span className="size-2 rotate-45 bg-site-spark/70" aria-hidden="true" />
    </span>
  ));
  return (
    <div className="on-dark border-y border-site-seam py-6 sm:py-7 overflow-hidden" aria-label={`What we automate: ${TICKER.join(', ')}`}>
      <div className="s-marquee" aria-hidden="true">
        <div className="s-marquee-track">{row}{row}</div>
      </div>
    </div>
  );
}

export { ServiceFlips } from './service-flips';

export const STEPS = [
  { icon: MessagesSquare, title: 'Tell us how you work', body: 'A 30-minute call about your business and what slows it down.', you: 'A conversation' },
  { icon: PenTool, title: 'We design it', body: 'A clear plan and one price, before you commit to anything.', you: 'A decision' },
  { icon: Cable, title: 'We build and connect it', body: 'We build the software and connect the tools you already use.', you: 'Access approvals' },
  { icon: LifeBuoy, title: 'We run it', body: 'We host it, watch it and fix it. One provider for all of it.', you: 'Nothing' },
];

/** The four steps, with a line that draws across them as they come into view. On dark sections. */
export function ProcessSteps() {
  return (
    <div className="relative">
      <span data-reveal className="s-draw hidden xl:block absolute left-[6%] right-[6%] top-[44px] h-px bg-gradient-to-r from-site-spark/0 via-site-spark/70 to-site-spark/0" aria-hidden="true" />
      <ol className="relative grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <li key={s.title} data-reveal style={{ '--d': `${150 + i * 140}ms` } as React.CSSProperties}>
              <div data-spot data-tilt="5" className="s-card h-full p-6 sm:p-7 flex flex-col">
                <div className="relative z-[2] flex items-center justify-between">
                  <span className="grid size-[52px] place-items-center rounded-2xl bg-site-night border border-site-spark/30 text-site-spark shadow-[0_0_0_6px_rgb(11_18_32)]"><Icon className="size-5" /></span>
                  <span className="font-serif italic text-[2.6rem] leading-none text-white/10">{i + 1}</span>
                </div>
                <h3 className="relative z-[2] s-h3 mt-6 text-[1.45rem] text-balance">{s.title}</h3>
                <p className="relative z-[2] mt-2.5 text-[0.95rem] leading-relaxed text-site-haze">{s.body}</p>
                <p className="relative z-[2] mt-auto pt-6 s-label">Your part · <span className="text-site-paper">{s.you}</span></p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const PLATFORM = [
  { icon: Radar, title: 'Discovery engine', body: 'Searches ten industries across Ontario every day.', anim: 'radar' },
  { icon: Link2, title: 'Research with sources', body: 'Every fact about a business links back to where it was found.', anim: 'lines' },
  { icon: Users, title: 'CRM and call lists', body: 'Accounts, contacts, consent and follow-ups in one place.', anim: 'rows' },
  { icon: Inbox, title: 'Inquiry pipeline', body: 'Every message sent from this website lands in it, with a task to reply.', anim: 'inbox' },
] as const;

/** Proof that is true today: the platform Relay runs its own business on. */
export function PlatformProof() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {PLATFORM.map((p, i) => {
        const Icon = p.icon;
        return (
          <div key={p.title} data-reveal style={{ '--d': `${i * 110}ms` } as React.CSSProperties}>
            <div data-spot data-tilt="5" className="s-card h-full p-6 flex flex-col overflow-hidden">
              <PlatformGlyph kind={p.anim} />
              <div className="relative z-[2] mt-6 flex items-center gap-2.5">
                <Icon className="size-4 text-site-spark" />
                <h3 className="text-[1.05rem] font-medium">{p.title}</h3>
              </div>
              <p className="relative z-[2] mt-2 text-[0.93rem] leading-relaxed text-site-haze">{p.body}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Small looping pictures of each part of the platform at work. Decorative. */
function PlatformGlyph({ kind }: { kind: (typeof PLATFORM)[number]['anim'] }) {
  return (
    <div aria-hidden="true" className="relative z-[2] h-28 rounded-2xl border border-site-seam bg-site-night/80 overflow-hidden">
      {kind === 'radar' && (
        <div className="absolute inset-0 grid place-items-center">
          {[0, 1, 2].map((r) => <span key={r} className="absolute rounded-full border border-site-spark/20" style={{ width: 40 + r * 34, height: 40 + r * 34 }} />)}
          <span className="absolute size-[108px] rounded-full animate-[spin_3.5s_linear_infinite]" style={{ background: 'conic-gradient(from 0deg, rgb(124 152 255 / 0.45), transparent 22%)' }} />
          {[[30, 40], [64, 28], [72, 70], [40, 72]].map(([x, y], k) => <span key={k} className="absolute size-1.5 rounded-full bg-site-tide s-pulse" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${k * 400}ms` }} />)}
        </div>
      )}
      {kind === 'lines' && (
        <div className="absolute inset-0 p-4 space-y-2.5">
          {[88, 70, 80, 56].map((w, k) => (
            <div key={k} className="flex items-center gap-2">
              <div className="h-1.5 rounded-full bg-white/15 s-fill" style={{ width: `${w}%`, animationDelay: `${k * 250}ms` }} />
              <span className="size-3 shrink-0 rounded-[4px] border border-site-spark/60 s-pulse" style={{ animationDelay: `${k * 300}ms` }} />
            </div>
          ))}
        </div>
      )}
      {kind === 'rows' && (
        <div className="absolute inset-0 p-3 space-y-1.5">
          {['Account', 'Contact', 'Consent', 'Follow-up'].map((r, k) => (
            <div key={r} className="flex items-center justify-between rounded-md bg-white/[0.05] px-2.5 py-1 s-rise" style={{ animationDelay: `${k * 180}ms` }}>
              <span className="font-mono text-[0.62rem] text-site-haze">{r}</span>
              <span className={`size-1.5 rounded-full ${k === 3 ? 'bg-site-coral s-pulse' : 'bg-site-tide'}`} />
            </div>
          ))}
        </div>
      )}
      {kind === 'inbox' && (
        <div className="absolute inset-0 p-3">
          <div className="rounded-lg border border-site-spark/40 bg-site-spark/10 px-3 py-2 animate-[s-inbox_4s_cubic-bezier(.2,.7,.1,1)_infinite]">
            <div className="h-1.5 w-1/2 rounded-full bg-site-spark/70" />
            <div className="mt-1.5 h-1.5 w-4/5 rounded-full bg-white/20" />
          </div>
          <div className="mt-2 rounded-lg bg-white/[0.05] px-3 py-2"><div className="h-1.5 w-2/3 rounded-full bg-white/15" /></div>
          <div className="mt-2 rounded-lg bg-white/[0.05] px-3 py-2"><div className="h-1.5 w-1/2 rounded-full bg-white/15" /></div>
        </div>
      )}
    </div>
  );
}

const FEATURED = ['quality-report', 'estimate', 'prospects'];

export function DemoTeaser() {
  const demos = FEATURED.map((slug) => DEMOS.find((d) => d.slug === slug)!);
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {demos.map((d, i) => (
        <div key={d.slug} data-reveal style={{ '--d': `${i * 120}ms` } as React.CSSProperties}>
          <Link href={`/demos/${d.slug}`} data-spot data-tilt="6" className="group s-card h-full p-6 sm:p-7 flex flex-col">
            <DemoGlyph index={i} />
            <p className="relative z-[2] s-eyebrow mt-7">{d.industry}</p>
            <h3 className="relative z-[2] s-h3 mt-3 text-[1.35rem]">{d.title}</h3>
            <span className="relative z-[2] mt-auto pt-6 inline-flex items-center gap-2 text-[0.9rem] text-site-spark">
              Try it <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </span>
          </Link>
        </div>
      ))}
    </div>
  );
}

/** Schematic pictures that come alive on hover: rows into a chart, text into a quote, a list into a ranking. */
function DemoGlyph({ index }: { index: number }) {
  const t = 'transition-all duration-700 ease-[cubic-bezier(.2,.7,.1,1)]';
  return (
    <div aria-hidden="true" className="relative z-[2] h-32 rounded-2xl border border-site-seam bg-site-night/70 p-4 flex items-end gap-3 overflow-hidden">
      {index === 0 && (
        <>
          <div className="flex-1 space-y-1.5 self-center">{[0, 1, 2, 3, 4].map((r) => <div key={r} className={`h-2 rounded-full ${r === 2 ? 'bg-site-coral/70' : 'bg-white/15'} ${t} group-hover:opacity-40`} style={{ width: `${60 + ((r * 17) % 35)}%`, transitionDelay: `${r * 40}ms` }} />)}</div>
          <ArrowRight className={`size-4 text-site-haze self-center ${t} group-hover:translate-x-1 group-hover:text-site-spark`} />
          <div className="flex-1 flex items-end gap-1.5 h-full">{[78, 94, 86].map((h, k) => <div key={k} className={`flex-1 rounded-t-md bg-site-spark/70 origin-bottom scale-y-[0.35] ${t} group-hover:scale-y-100`} style={{ height: `${h}%`, transitionDelay: `${120 + k * 90}ms` }} />)}</div>
        </>
      )}
      {index === 1 && (
        <>
          <div className="flex-1 space-y-1.5 self-center">{[90, 70, 85, 50].map((w, k) => <div key={k} className="h-1.5 rounded-full bg-white/15" style={{ width: `${w}%` }} />)}</div>
          <ArrowRight className={`size-4 text-site-haze self-center ${t} group-hover:translate-x-1 group-hover:text-site-spark`} />
          <div className="flex-1 space-y-1.5 rounded-lg border border-site-seam p-2 self-center">
            {[0, 1, 2].map((k) => <div key={k} className={`flex justify-between gap-2 opacity-30 ${t} group-hover:opacity-100`} style={{ transitionDelay: `${k * 110}ms` }}><div className="h-1.5 w-2/3 rounded-full bg-white/15" /><div className="h-1.5 w-1/5 rounded-full bg-site-spark/70" /></div>)}
            <div className={`h-1.5 w-1/2 ml-auto rounded-full bg-site-tide/80 scale-x-0 origin-right ${t} group-hover:scale-x-100`} style={{ transitionDelay: '380ms' }} />
          </div>
        </>
      )}
      {index === 2 && (
        <div className="w-full space-y-1.5 self-center">{[100, 85, 70, 40, 25].map((s, k) => (
          <div key={k} className="flex items-center gap-2">
            <div className="h-1.5 w-14 rounded-full bg-white/15" />
            <div className={`h-1.5 rounded-full origin-left scale-x-[0.25] ${s >= 70 ? 'bg-site-tide/80' : 'bg-white/20'} ${t} group-hover:scale-x-100`} style={{ width: `${s * 0.6}%`, transitionDelay: `${k * 70}ms` }} />
          </div>
        ))}</div>
      )}
    </div>
  );
}

export function ConsultCta({ title = 'Let’s look at how your business runs.', service }: { title?: string; service?: string }) {
  return (
    <section className="s-container py-20 sm:py-28">
      <div data-reveal data-spot className="relative overflow-hidden rounded-[32px] bg-site-sand px-6 py-14 sm:px-14 sm:py-20">
        <div className="absolute inset-0 s-grid-bg-light pointer-events-none" aria-hidden="true" />
        <div className="absolute -left-20 -bottom-32 size-[380px] rounded-full bg-site-coral/25 blur-[90px] pointer-events-none animate-[s-drift_14s_ease-in-out_infinite]" aria-hidden="true" />
        <div className="absolute -right-24 -top-32 size-[380px] rounded-full bg-site-signal/15 blur-[90px] pointer-events-none animate-[s-drift_18s_ease-in-out_infinite_reverse]" aria-hidden="true" />
        <div className="relative z-[2] grid gap-10 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            <h2 className="s-h2 text-balance">{title}</h2>
            <p className="s-lede mt-5">Free 30-minute consultation. No account, no obligation.</p>
          </div>
          <div className="lg:col-span-4 flex flex-col gap-3 lg:items-end">
            <Link href={service ? `/contact?service=${service}` : '/contact'} className="s-btn-primary w-full sm:w-auto">Book a free consultation <ArrowRight className="size-4" /></Link>
            <Link href="/demos" className="s-btn-quiet w-full sm:w-auto">Try a demo first</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
