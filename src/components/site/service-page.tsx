import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Check, Minus } from 'lucide-react';
import { ConsultCta, SectionHead } from './sections';
import { Words } from './words';
import type { Service } from '@/site/content/services';
import { DEMOS } from '@/site/demos/catalog';

/** The shared frame of a service page; each page adds its own middle sections. */
export function ServiceHero({ service, index }: { service: Service; index: number }) {
  return (
    <section className="relative overflow-hidden border-b border-site-rule">
      <div className="absolute inset-0 s-grid-bg-light [mask-image:linear-gradient(to_bottom,black,transparent)] pointer-events-none" aria-hidden="true" />
      <div className="absolute -top-48 right-[-8%] size-[560px] rounded-full bg-site-signal/[0.12] blur-[110px] pointer-events-none animate-[s-drift_16s_ease-in-out_infinite]" aria-hidden="true" />
      <div className="s-container relative pt-14 sm:pt-20 pb-14 sm:pb-20">
        <p className="s-eyebrow s-rise"><Link href="/services" className="hover:text-site-night">Services</Link> <span className="mx-2">/</span> <span className="s-num">0{index}</span> {service.name}</p>
        <h1 className="s-display mt-6 max-w-5xl text-balance !text-[clamp(2.5rem,5.6vw,4.8rem)]"><Words text={service.headline} start={100} step={55} /></h1>
        <div className="mt-8 grid gap-8 lg:grid-cols-12 lg:items-end">
          <p className="s-lede lg:col-span-7 text-pretty s-rise" style={{ animationDelay: '600ms' }}>{service.summary}</p>
          <div className="lg:col-span-5 flex flex-col sm:flex-row lg:justify-end gap-3 s-rise" style={{ animationDelay: '750ms' }}>
            <Link href={`/contact?service=${service.key}`} className="s-btn-primary">Book a free consultation <ArrowRight className="size-4" /></Link>
            <Link href="#demos" className="s-btn-quiet">See it working</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function WhatWeBuild({ service, title, limit = 9 }: { service: Service; title: React.ReactNode; limit?: number }) {
  return (
    <section className="s-container py-20 sm:py-24">
      <SectionHead eyebrow="What we build" title={title} />
      <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {service.examples.slice(0, limit).map((e, i) => (
          <li key={e} data-reveal style={{ '--d': `${(i % 3) * 90 + Math.floor(i / 3) * 60}ms` } as React.CSSProperties}>
            <div data-spot className="s-card s-lift h-full p-5 sm:p-6 flex items-center gap-4">
              <span className="font-mono text-[0.72rem] text-site-signal">{String(i + 1).padStart(2, '0')}</span>
              <span className="text-[1.02rem] leading-snug">{e}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ManagedAndPricing({ service, included, upfront }: { service: Service; included: string[]; upfront: string[] }) {
  return (
    <section className="bg-site-sand/50 border-y border-site-rule">
      <div className="s-container py-20 sm:py-24 grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <SectionHead eyebrow="Fully managed" title={<>We handle it, <span className="s-em">end to end.</span></>} />
          <ol className="mt-10 space-y-4">
            {service.managed.map((m, i) => (
              <li key={m} data-reveal style={{ '--d': `${i * 80}ms` } as React.CSSProperties} className="flex gap-4">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-site-night text-site-paper font-mono text-[0.7rem]">{i + 1}</span>
                <span className="pt-0.5 text-[1rem] leading-relaxed">{m}</span>
              </li>
            ))}
          </ol>
        </div>
        <div data-reveal="right" className="lg:col-span-7">
          <div data-spot className="s-card h-full p-6 sm:p-9">
            <p className="s-eyebrow">Pricing</p>
            <p className="mt-4 text-[1.35rem] font-medium leading-snug tracking-[-0.025em]">{service.pricing}</p>
            <div className="mt-8 grid gap-8 sm:grid-cols-2">
              <div>
                <p className="s-label mb-3">Included</p>
                <ul className="space-y-2.5">{included.map((x) => <li key={x} className="flex gap-2.5 text-[0.95rem] leading-snug"><Check className="size-4 mt-0.5 shrink-0 text-site-signal" />{x}</li>)}</ul>
              </div>
              <div>
                <p className="s-label mb-3">Agreed before you sign</p>
                <ul className="space-y-2.5">{upfront.map((x) => <li key={x} className="flex gap-2.5 text-[0.95rem] leading-snug"><Minus className="size-4 mt-0.5 shrink-0 text-site-fog" />{x}</li>)}</ul>
              </div>
            </div>
            <Link href="/how-it-works#pricing" className="mt-8 inline-flex items-center gap-2 text-[0.92rem] text-site-signal">How pricing works <ArrowRight className="size-4" /></Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function RelatedDemos({ slugs, title = 'See it working' }: { slugs: string[]; title?: string }) {
  const demos = slugs.map((s) => DEMOS.find((d) => d.slug === s)!).filter(Boolean);
  return (
    <section id="demos" className="s-container py-20 sm:py-24 scroll-mt-24">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <SectionHead eyebrow="Demos" title={title} lede="Working demos on sample data." />
        <Link data-reveal href="/demos" className="s-btn-quiet shrink-0">All demos</Link>
      </div>
      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {demos.map((d, i) => (
          <div key={d.slug} data-reveal style={{ '--d': `${i * 100}ms` } as React.CSSProperties}>
            <Link href={`/demos/${d.slug}`} data-spot data-tilt="5" className="group s-card h-full p-6 flex flex-col">
              <p className="s-eyebrow">{d.industry}</p>
              <h3 className="s-h3 mt-3 text-[1.3rem]">{d.title}</h3>
              <p className="mt-2 text-[0.93rem] leading-relaxed text-site-fog">{d.tagline}</p>
              <span className="mt-auto pt-5 inline-flex items-center gap-2 text-[0.9rem] text-site-signal">Try it <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></span>
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Faq({ items }: { items: { q: string; a: React.ReactNode }[] }) {
  return (
    <section className="s-container pb-4">
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4"><SectionHead eyebrow="Questions" title="Good to know" /></div>
        <div className="lg:col-span-8 divide-y divide-site-rule border-y border-site-rule">
          {items.map((it, i) => (
            <details key={it.q} data-reveal style={{ '--d': `${i * 70}ms` } as React.CSSProperties} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[1.05rem] font-medium transition-colors hover:text-site-signal [&::-webkit-details-marker]:hidden">
                {it.q}
                <span className="grid size-8 shrink-0 place-items-center rounded-full border border-site-rule text-site-fog transition-all duration-300 group-open:rotate-45 group-open:bg-site-night group-open:text-site-paper group-open:border-site-night" aria-hidden="true">+</span>
              </summary>
              <div className="mt-3 max-w-2xl text-[0.98rem] leading-relaxed text-site-fog">{it.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export { ConsultCta };
