import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ConsultCta, SectionHead } from '@/components/site/sections';
import { SERVICES } from '@/site/content/services';
import { Words } from '@/components/site/words';

export const metadata: Metadata = {
  title: 'Services',
  description: 'Business automation, customer acquisition, and websites and digital foundations: designed, built and run for you.',
  alternates: { canonical: '/services' },
};

export default function ServicesPage() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-site-rule">
        <div className="absolute inset-0 s-grid-bg-light [mask-image:linear-gradient(to_bottom,black,transparent)] pointer-events-none" aria-hidden="true" />
        <div className="s-container relative pt-14 sm:pt-20 pb-14 sm:pb-16">
          <p className="s-eyebrow">Services</p>
          <h1 className="s-display mt-5 max-w-4xl text-balance !text-[clamp(2.5rem,5.6vw,4.8rem)]"><Words text="Three services." start={100} /> <span className="s-em"><Words text="One provider." start={300} /></span></h1>
          <p className="s-lede mt-6 max-w-2xl s-rise" style={{ animationDelay: '550ms' }}>Designed around your business, built by us, and looked after once it’s running.</p>
        </div>
      </section>
      <section className="s-container py-16 sm:py-20 space-y-5">
        {SERVICES.map((s, i) => (
          <Link key={s.key} href={s.href} data-reveal style={{ '--d': `${i * 100}ms` } as React.CSSProperties} data-spot className={`group grid gap-8 rounded-[28px] p-7 sm:p-10 lg:grid-cols-12 s-lift ${i === 0 ? 'on-dark relative overflow-hidden' : 's-card'}`}>
            {i === 0 && <div className="absolute inset-0 s-grid-bg pointer-events-none" aria-hidden="true" />}
            <div className="relative lg:col-span-6">
              <p className="s-eyebrow"><span className="s-num">0{i + 1}</span> · {s.name}{i === 0 ? ' · our primary service' : ''}</p>
              <h2 className="s-h2 mt-4 !text-[clamp(1.8rem,3.4vw,2.7rem)] text-balance">{s.headline}</h2>
              <p className="s-lede mt-4 !text-[1.05rem]">{s.summary}</p>
              <span className={`mt-7 inline-flex items-center gap-2 ${i === 0 ? 'text-site-spark' : 'text-site-signal'}`}>{s.choice} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></span>
            </div>
            <ul className="relative lg:col-span-6 grid gap-2 sm:grid-cols-2 content-start">
              {s.highlights.map((e) => <li key={e} className={`rounded-xl px-3.5 py-2.5 text-[0.9rem] leading-snug border transition-colors ${i === 0 ? 'border-site-seam bg-site-deep group-hover:border-site-spark/30' : 'border-site-rule bg-white/60 group-hover:border-site-signal/25'}`}>{e}</li>)}
            </ul>
          </Link>
        ))}
      </section>
      <section className="s-container pb-4">
        <SectionHead eyebrow="Not sure where to start?" title={<>That’s what the <span className="s-em">consultation</span> is for.</>} />
      </section>
      <ConsultCta />
    </>
  );
}
