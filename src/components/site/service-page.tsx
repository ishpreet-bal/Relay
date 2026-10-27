import Link from 'next/link';
import { ArrowRight, Check, Minus } from 'lucide-react';
import { ConsultCta, SectionHead } from './sections';
import type { Service } from '@/site/content/services';
import { DEMOS } from '@/site/demos/catalog';

/** The shared frame of a service page; each page adds its own middle sections. */
export function ServiceHero({ service, index }: { service: Service; index: number }) {
  return (
    <section className="relative overflow-hidden border-b border-site-rule">
      <div className="absolute inset-0 s-grid-bg-light [mask-image:linear-gradient(to_bottom,black,transparent)] pointer-events-none" aria-hidden="true" />
      <div className="absolute -top-48 right-[-8%] size-[560px] rounded-full bg-site-signal/[0.1] blur-[110px] pointer-events-none" aria-hidden="true" />
      <div className="s-container relative pt-14 sm:pt-20 pb-14 sm:pb-20">
        <p className="s-eyebrow"><Link href="/services" className="hover:text-site-night">Services</Link> <span className="mx-2">/</span> <span className="s-num">0{index}</span> {service.name}</p>
        <h1 className="s-display mt-6 max-w-5xl text-balance !text-[clamp(2.5rem,5.6vw,4.8rem)]">{service.headline}</h1>
        <div className="mt-8 grid gap-8 lg:grid-cols-12 lg:items-end">
          <p className="s-lede lg:col-span-7 text-pretty">{service.summary}</p>
          <div className="lg:col-span-5 flex flex-col sm:flex-row lg:justify-end gap-3">
            <Link href={`/contact?service=${service.key}`} className="s-btn-primary">Book a free consultation <ArrowRight className="size-4" /></Link>
            <Link href="#demos" className="s-btn-quiet">See it working</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function WhatWeBuild({ service, title }: { service: Service; title: React.ReactNode }) {
  return (
    <section className="s-container py-20 sm:py-24">
      <SectionHead eyebrow="What we build" title={title} />
      <ul className="mt-12 grid gap-px overflow-hidden rounded-[22px] border border-site-rule bg-site-rule sm:grid-cols-2 lg:grid-cols-3">
        {service.examples.map((e, i) => (
          <li key={e} className="bg-site-chalk p-5 sm:p-6 flex gap-4">
            <span className="font-mono text-[0.7rem] text-site-signal pt-1">{String(i + 1).padStart(2, '0')}</span>
            <span className="text-[1rem] leading-snug">{e}</span>
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
              <li key={m} className="flex gap-4">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-site-night text-site-paper font-mono text-[0.7rem]">{i + 1}</span>
                <span className="pt-0.5 text-[1rem] leading-relaxed">{m}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="lg:col-span-7 s-card p-6 sm:p-9">
          <p className="s-eyebrow">How pricing works</p>
          <p className="mt-4 font-serif text-[1.45rem] leading-snug tracking-[-0.02em]">{service.pricing}</p>
          <div className="mt-8 grid gap-8 sm:grid-cols-2">
            <div>
              <p className="s-label mb-3">Included in your price</p>
              <ul className="space-y-2.5">{included.map((x) => <li key={x} className="flex gap-2.5 text-[0.95rem] leading-snug"><Check className="size-4 mt-0.5 shrink-0 text-site-signal" />{x}</li>)}</ul>
            </div>
            <div>
              <p className="s-label mb-3">Told to you before you sign</p>
              <ul className="space-y-2.5">{upfront.map((x) => <li key={x} className="flex gap-2.5 text-[0.95rem] leading-snug"><Minus className="size-4 mt-0.5 shrink-0 text-site-fog" />{x}</li>)}</ul>
            </div>
          </div>
          <Link href="/how-it-works#pricing" className="mt-8 inline-flex items-center gap-2 text-[0.92rem] text-site-signal">More on pricing and usage <ArrowRight className="size-4" /></Link>
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
        <SectionHead eyebrow="Demonstrations" title={title} lede="Working sample applications on fictional data. None is a client project." />
        <Link href="/demos" className="s-btn-quiet shrink-0">All demos</Link>
      </div>
      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {demos.map((d) => (
          <Link key={d.slug} href={`/demos/${d.slug}`} className="group s-card p-6 flex flex-col transition-shadow hover:shadow-[0_30px_60px_-40px_rgba(11,18,32,0.45)]">
            <p className="s-eyebrow">{d.industry}</p>
            <h3 className="s-h3 mt-3 text-[1.3rem]">{d.title}</h3>
            <p className="mt-2 text-[0.93rem] leading-relaxed text-site-fog">{d.tagline}</p>
            <span className="mt-auto pt-5 inline-flex items-center gap-2 text-[0.9rem] text-site-signal">Try the demo <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></span>
          </Link>
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
          {items.map((it) => (
            <details key={it.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[1.05rem] font-medium [&::-webkit-details-marker]:hidden">
                {it.q}
                <span className="grid size-7 shrink-0 place-items-center rounded-full border border-site-rule text-site-fog transition-transform group-open:rotate-45" aria-hidden="true">+</span>
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
