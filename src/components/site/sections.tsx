import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Cable, ClipboardCheck, Hammer, LifeBuoy, MessagesSquare, PenTool, Puzzle, ShieldCheck, Wrench } from 'lucide-react';
import { SERVICES } from '@/site/content/services';
import { DEMOS } from '@/site/demos/catalog';

/** A numbered, editorial section heading. */
export function SectionHead({ number, eyebrow, title, lede, align = 'left', className = '' }: {
  number?: string; eyebrow: string; title: React.ReactNode; lede?: React.ReactNode; align?: 'left' | 'center'; className?: string;
}) {
  return (
    <div className={`${align === 'center' ? 'mx-auto text-center max-w-3xl' : 'max-w-3xl'} ${className}`}>
      <p className="s-eyebrow flex items-center gap-3 justify-start" style={align === 'center' ? { justifyContent: 'center' } : undefined}>
        {number && <span className="s-num">{number}</span>}
        {number && <span className="h-px w-8 bg-current opacity-30" aria-hidden="true" />}
        {eyebrow}
      </p>
      <h2 className="s-h2 mt-5 text-balance">{title}</h2>
      {lede && <p className="s-lede mt-5 text-pretty">{lede}</p>}
    </div>
  );
}

/** The three ways in, in the visitor's own words. */
export function StartingPoints() {
  return (
    <div className="grid gap-px overflow-hidden rounded-[22px] border border-site-rule bg-site-rule sm:grid-cols-3">
      {SERVICES.map((s, i) => (
        <Link key={s.key} href={s.href} className="group bg-site-chalk p-5 sm:p-6 transition-colors hover:bg-white">
          <span className="flex items-center justify-between">
            <span className="font-mono text-[0.7rem] text-site-signal">0{i + 1}</span>
            <ArrowUpRight className="size-4 text-site-fog transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-site-signal" />
          </span>
          <span className="mt-4 block font-serif text-[1.35rem] leading-tight tracking-[-0.02em]">{s.choice}</span>
          <span className="mt-2 block text-[0.9rem] text-site-fog leading-snug">{s.choiceDetail}</span>
        </Link>
      ))}
    </div>
  );
}

export function ServiceCards() {
  const [automation, acquisition, websites] = SERVICES as [typeof SERVICES[0], typeof SERVICES[0], typeof SERVICES[0]];
  return (
    <div className="grid gap-5 lg:grid-cols-12">
      <Link href={automation.href} className="on-dark group relative overflow-hidden rounded-[28px] p-7 sm:p-10 lg:col-span-7 lg:row-span-2 flex flex-col">
        <div className="absolute inset-0 s-grid-bg pointer-events-none" aria-hidden="true" />
        <div className="absolute -right-24 -top-24 size-[420px] rounded-full bg-site-signal/25 blur-[90px] pointer-events-none" aria-hidden="true" />
        <div className="relative flex items-center justify-between">
          <span className="s-chip"><span className="size-1.5 rounded-full bg-site-tide" />Our primary service</span>
          <ArrowUpRight className="size-5 text-site-haze transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-site-paper" />
        </div>
        <p className="relative s-eyebrow mt-10">01 · {automation.name}</p>
        <h3 className="relative s-h2 mt-4 max-w-xl text-balance">{automation.headline}</h3>
        <p className="relative s-lede mt-5 max-w-xl">{automation.summary}</p>
        <ul className="relative mt-8 flex flex-wrap gap-2">
          {automation.examples.slice(0, 8).map((e) => <li key={e} className="s-chip text-[0.78rem]">{e}</li>)}
        </ul>
        <span className="relative mt-auto pt-10 inline-flex items-center gap-2 text-[0.95rem] text-site-spark">
          Explore business automation <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
        </span>
      </Link>
      {[acquisition, websites].map((s, i) => (
        <Link key={s.key} href={s.href} className="group s-card p-7 sm:p-8 lg:col-span-5 flex flex-col transition-shadow hover:shadow-[0_30px_60px_-40px_rgba(11,18,32,0.45)]">
          <div className="flex items-center justify-between">
            <p className="s-eyebrow">0{i + 2} · {s.name}</p>
            <ArrowUpRight className="size-5 text-site-fog transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-site-signal" />
          </div>
          <h3 className="s-h3 mt-5 text-balance">{s.headline}</h3>
          <p className="mt-3 text-[0.98rem] leading-relaxed text-site-fog">{s.summary}</p>
          <span className="mt-auto pt-6 inline-flex items-center gap-2 text-[0.92rem] text-site-signal">
            {s.choice} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </span>
        </Link>
      ))}
    </div>
  );
}

export const STEPS = [
  { icon: MessagesSquare, title: 'Tell us about your business', body: 'Book a consultation or send a short inquiry: your industry, how things work today, and what is getting in the way.', you: 'A conversation, about 30 minutes' },
  { icon: PenTool, title: 'We design your solution', body: 'We recommend an approach and explain what it will do, how we will build it, the benefits we expect and the price, before you commit to anything.', you: 'Review the proposal and decide' },
  { icon: Cable, title: 'We build and connect everything', body: 'We develop the software, configure the automations and connect the systems you authorize. You approve access and help us test with real cases.', you: 'Grant access, join testing' },
  { icon: LifeBuoy, title: 'We run and maintain it', body: 'We monitor it, keep integrations working, fix problems and make the improvements we agree on. You have one provider for all of it: us.', you: 'Run your business' },
];

export function ProcessSteps({ compact = false }: { compact?: boolean }) {
  return (
    <ol className="relative grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <span className="hidden xl:block absolute left-[12%] right-[12%] top-[38px] h-px bg-gradient-to-r from-site-spark/0 via-site-spark/50 to-site-spark/0" aria-hidden="true" />
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        return (
          <li key={s.title} className="s-reveal relative s-card p-6 sm:p-7 flex flex-col">
            <div className="flex items-center justify-between">
              <span className="relative grid size-12 place-items-center rounded-2xl bg-site-spark/10 text-site-spark border border-site-spark/25">
                <Icon className="size-5" />
              </span>
              <span className="font-mono text-[0.72rem] text-site-haze">Step {i + 1}</span>
            </div>
            <h3 className="s-h3 mt-6 text-[1.4rem] text-balance">{s.title}</h3>
            {!compact && <p className="mt-3 text-[0.95rem] leading-relaxed text-site-haze">{s.body}</p>}
            <p className="mt-auto pt-6 s-label">Your part · <span className="text-site-paper">{s.you}</span></p>
          </li>
        );
      })}
    </ol>
  );
}

type Module = { label: string; shared?: boolean };
const COMPANIES: { name: string; need: string; uses: string; requires: string; solution: string; modules: Module[] }[] = [
  {
    name: 'Manufacturer A', need: 'Automated supplier reporting', uses: 'Spreadsheets and email', requires: 'Scheduled reports and notifications',
    solution: 'A supplier scorecard, built from the purchasing spreadsheet and emailed to each supplier every Monday.',
    modules: [{ label: 'Spreadsheet import' }, { label: 'Data validation', shared: true }, { label: 'Scheduler', shared: true }, { label: 'Supplier scorecard' }, { label: 'Email notifications', shared: true }],
  },
  {
    name: 'Manufacturer B', need: 'Quality claims automation', uses: 'A database and a document system', requires: 'Approvals, validation and dashboards',
    solution: 'A claims workflow: documents filed automatically, claims validated, routed for approval and tracked on a dashboard.',
    modules: [{ label: 'Database connector' }, { label: 'Document intake' }, { label: 'Data validation', shared: true }, { label: 'Approval flow' }, { label: 'Claims dashboard' }, { label: 'Email notifications', shared: true }],
  },
];

export function BuiltAroundYou() {
  return (
    <div>
      <div className="grid gap-5 lg:grid-cols-2">
        {COMPANIES.map((c) => (
          <article key={c.name} className="s-card p-6 sm:p-8 flex flex-col">
            <div className="flex items-center justify-between">
              <p className="s-eyebrow">Same industry</p>
              <span className="s-chip">{c.name}</span>
            </div>
            <dl className="mt-6 grid gap-4 sm:grid-cols-3">
              {[['Needs', c.need], ['Uses today', c.uses], ['Requires', c.requires]].map(([k, v]) => (
                <div key={k}>
                  <dt className="s-label">{k}</dt>
                  <dd className="mt-1.5 text-[0.95rem] leading-snug">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-7 rounded-2xl bg-site-sand/60 p-5 flex-1">
              <p className="s-label">What we would build</p>
              <p className="mt-2 font-serif text-[1.2rem] leading-snug tracking-[-0.01em]">{c.solution}</p>
              <ul className="mt-5 flex flex-wrap gap-2">
                {c.modules.map((m) => (
                  <li key={m.label} className={`inline-flex items-center gap-1.5 rounded-full px-3 h-8 text-[0.8rem] border ${m.shared ? 'border-site-signal/30 bg-site-signal/[0.07] text-site-signal' : 'border-site-rule bg-site-chalk text-site-night'}`}>
                    {m.shared ? <Puzzle className="size-3.5" /> : <Wrench className="size-3.5 text-site-fog" />}{m.label}
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>
      <p className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[0.88rem] text-site-fog">
        <span className="inline-flex items-center gap-2"><Puzzle className="size-4 text-site-signal" />Proven component, reused</span>
        <span className="inline-flex items-center gap-2"><Wrench className="size-4" />Built for this company</span>
        <span>Reuse keeps it reliable and the price fair. The solution itself is always yours alone.</span>
      </p>
    </div>
  );
}

const FEATURED = ['quality-report', 'estimate', 'prospects'];

export function DemoTeaser() {
  const demos = FEATURED.map((slug) => DEMOS.find((d) => d.slug === slug)!);
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {demos.map((d, i) => (
        <Link key={d.slug} href={`/demos/${d.slug}`} className="group s-card p-6 sm:p-7 flex flex-col transition-colors hover:border-site-spark/40">
          <DemoGlyph index={i} />
          <p className="s-eyebrow mt-7">{d.industry}</p>
          <h3 className="s-h3 mt-3 text-[1.35rem]">{d.title}</h3>
          <p className="mt-3 text-[0.93rem] leading-relaxed text-site-haze">{d.tagline}</p>
          <span className="mt-auto pt-6 inline-flex items-center gap-2 text-[0.9rem] text-site-spark">
            Try it <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </span>
        </Link>
      ))}
    </div>
  );
}

/** Small schematic pictures for the demo cards: rows becoming a chart, text becoming a quote, a list becoming a ranking. */
function DemoGlyph({ index }: { index: number }) {
  return (
    <div aria-hidden="true" className="h-28 rounded-2xl border border-site-seam bg-site-night/70 p-4 flex items-end gap-3 overflow-hidden">
      {index === 0 && (
        <>
          <div className="flex-1 space-y-1.5">{[0, 1, 2, 3, 4].map((r) => <div key={r} className={`h-2 rounded-full ${r === 2 ? 'bg-site-coral/70' : 'bg-white/15'}`} style={{ width: `${60 + ((r * 17) % 35)}%` }} />)}</div>
          <ArrowRight className="size-4 text-site-haze mb-6" />
          <div className="flex-1 flex items-end gap-1.5 h-full">{[78, 94, 86].map((h, k) => <div key={k} className="flex-1 rounded-t-md bg-site-spark/70" style={{ height: `${h}%` }} />)}</div>
        </>
      )}
      {index === 1 && (
        <>
          <div className="flex-1 space-y-1.5 self-start pt-1">{[90, 70, 85, 50].map((w, k) => <div key={k} className="h-1.5 rounded-full bg-white/15" style={{ width: `${w}%` }} />)}</div>
          <ArrowRight className="size-4 text-site-haze mb-6" />
          <div className="flex-1 space-y-1.5 rounded-lg border border-site-seam p-2">{[0, 1, 2].map((k) => <div key={k} className="flex justify-between gap-2"><div className="h-1.5 w-2/3 rounded-full bg-white/15" /><div className="h-1.5 w-1/5 rounded-full bg-site-spark/70" /></div>)}<div className="h-1.5 w-1/2 ml-auto rounded-full bg-site-tide/80" /></div>
        </>
      )}
      {index === 2 && (
        <div className="w-full space-y-1.5">{[100, 85, 70, 40, 25].map((s, k) => (
          <div key={k} className="flex items-center gap-2">
            <div className="h-1.5 w-16 rounded-full bg-white/15" />
            <div className={`h-1.5 rounded-full ${s >= 70 ? 'bg-site-tide/80' : 'bg-white/20'}`} style={{ width: `${s * 0.6}%` }} />
          </div>
        ))}</div>
      )}
    </div>
  );
}

const PILLARS = [
  { icon: Puzzle, title: 'Built around your business', body: 'We start from how you work, not from a product we need to sell. Two companies in the same industry can get very different solutions.' },
  { icon: Hammer, title: 'Managed from start to finish', body: 'Design, development, integration, hosting and support. You do not buy separate tools or hire someone to configure them.' },
  { icon: Cable, title: 'Connected to what you already use', body: 'Spreadsheets, inboxes, accounting, CRMs, calendars and databases. With your authorization, we do the connecting.' },
  { icon: ShieldCheck, title: 'Looked after for the long run', body: 'We monitor what we build, fix what breaks and keep improving it under a clear support agreement.' },
];

export function WhyRelay() {
  return (
    <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
      {PILLARS.map((p) => {
        const Icon = p.icon;
        return (
          <div key={p.title} className="s-reveal flex gap-5">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-site-signal/[0.08] text-site-signal"><Icon className="size-5" /></span>
            <div>
              <h3 className="text-[1.1rem] font-medium tracking-[-0.01em]">{p.title}</h3>
              <p className="mt-2 text-[0.98rem] leading-relaxed text-site-fog">{p.body}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function HonestyNote() {
  return (
    <div className="flex gap-4 rounded-[22px] border border-dashed border-site-rule p-6">
      <ClipboardCheck className="size-5 shrink-0 text-site-signal mt-0.5" />
      <p className="text-[0.98rem] leading-relaxed text-site-fog">
        <span className="text-site-night font-medium">We are a young company, and we will not pretend otherwise.</span> You will not find invented
        testimonials or case studies here. Instead, every demo on this site is a working example you can try, and in a consultation we will walk
        through what we would build for you.
      </p>
    </div>
  );
}

export function ConsultCta({ title = 'Tell us how your business runs. We’ll show you what we would build.', service }: { title?: string; service?: string }) {
  return (
    <section className="s-container py-20 sm:py-28">
      <div className="relative overflow-hidden rounded-[32px] bg-site-sand px-6 py-14 sm:px-14 sm:py-20">
        <div className="absolute inset-0 s-grid-bg-light pointer-events-none" aria-hidden="true" />
        <div className="absolute -left-20 -bottom-32 size-[380px] rounded-full bg-site-coral/20 blur-[90px] pointer-events-none" aria-hidden="true" />
        <div className="relative grid gap-10 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            <p className="s-eyebrow">Free consultation</p>
            <h2 className="s-h2 mt-5 text-balance">{title}</h2>
            <p className="s-lede mt-5 max-w-2xl">No account, no obligation. Tell us about your process and goals; we will recommend an approach and explain what it would cost.</p>
          </div>
          <div className="lg:col-span-4 flex flex-col gap-3 lg:items-end">
            <Link href={service ? `/contact?service=${service}` : '/contact'} className="s-btn-primary w-full sm:w-auto">Book a free consultation <ArrowRight className="size-4" /></Link>
            <Link href="/demos" className="s-btn-quiet w-full sm:w-auto">See working demos</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
