import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ConsultCta, SectionHead } from '@/components/site/sections';
import { SERVICES } from '@/site/content/services';

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
          <h1 className="s-display mt-5 max-w-4xl text-balance !text-[clamp(2.5rem,5.6vw,4.8rem)]">Three services. <span className="s-em">One provider.</span></h1>
          <p className="s-lede mt-6 max-w-2xl">Each is designed around your business, built and connected by us, and looked after once it is running. Start with one; add another when it makes sense.</p>
        </div>
      </section>
      <section className="s-container py-16 sm:py-20 space-y-5">
        {SERVICES.map((s, i) => (
          <Link key={s.key} href={s.href} className={`group grid gap-8 rounded-[28px] p-7 sm:p-10 lg:grid-cols-12 transition-shadow ${i === 0 ? 'on-dark relative overflow-hidden' : 's-card hover:shadow-[0_30px_60px_-40px_rgba(11,18,32,0.45)]'}`}>
            {i === 0 && <div className="absolute inset-0 s-grid-bg pointer-events-none" aria-hidden="true" />}
            <div className="relative lg:col-span-6">
              <p className="s-eyebrow"><span className="s-num">0{i + 1}</span> · {s.name}{i === 0 ? ' · our primary service' : ''}</p>
              <h2 className="s-h2 mt-4 !text-[clamp(1.8rem,3.4vw,2.7rem)] text-balance">{s.headline}</h2>
              <p className="s-lede mt-4 !text-[1.05rem]">{s.summary}</p>
              <span className={`mt-7 inline-flex items-center gap-2 ${i === 0 ? 'text-site-spark' : 'text-site-signal'}`}>{s.choice} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></span>
            </div>
            <ul className="relative lg:col-span-6 grid gap-2 sm:grid-cols-2 content-start">
              {s.examples.slice(0, 8).map((e) => <li key={e} className={`rounded-xl px-3.5 py-2.5 text-[0.9rem] leading-snug border ${i === 0 ? 'border-site-seam bg-site-deep' : 'border-site-rule bg-white/60'}`}>{e}</li>)}
            </ul>
          </Link>
        ))}
      </section>
      <section className="s-container pb-4">
        <SectionHead eyebrow="Not sure where to start?" title={<>Most businesses aren’t. <span className="s-em">That is what the consultation is for.</span></>}
          lede="Tell us how things work today and what you would like to change. We will recommend a starting point, even if it is a small one." />
      </section>
      <ConsultCta />
    </>
  );
}
