import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, FlaskConical } from 'lucide-react';
import { ConsultCta } from '@/components/site/sections';
import { DEMOS } from '@/site/demos/catalog';
import { Words } from '@/components/site/words';

export const metadata: Metadata = {
  title: 'Demos',
  description: 'Working sample applications for manufacturing, construction, logistics, clinics, salons, retail and startups. Fictional data; try them in your browser.',
  alternates: { canonical: '/demos' },
};

export default function DemosPage() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-site-rule">
        <div className="absolute inset-0 s-grid-bg-light [mask-image:linear-gradient(to_bottom,black,transparent)] pointer-events-none" aria-hidden="true" />
        <div className="s-container relative pt-14 sm:pt-20 pb-14 sm:pb-16">
          <p className="s-eyebrow">Demonstrations</p>
          <h1 className="s-display mt-5 max-w-4xl text-balance !text-[clamp(2.5rem,5.6vw,4.8rem)]"><Words text="See it" start={100} /> <span className="s-em"><Words text="working." start={260} /></span></h1>
          <p className="s-lede mt-6 max-w-2xl s-rise" style={{ animationDelay: '450ms' }}>Seven working demos, one per industry. Change the inputs and watch them respond.</p>
          <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-site-rule bg-site-chalk px-3.5 h-9 text-[0.84rem] text-site-fog s-rise" style={{ animationDelay: '550ms' }}>
            <FlaskConical className="size-4 text-site-coral" />Sample data · runs in your browser
          </p>
        </div>
      </section>
      <section className="s-container py-14 sm:py-20">
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {DEMOS.map((d, i) => (
            <li key={d.slug} data-reveal style={{ '--d': `${(i % 3) * 110}ms` } as React.CSSProperties}>
              <Link href={`/demos/${d.slug}`} data-spot data-tilt="5" className={`group h-full flex flex-col rounded-[24px] p-7 ${i === 0 ? 'on-dark relative overflow-hidden' : 's-card'}`}>
                {i === 0 && <div className="absolute inset-0 s-grid-bg pointer-events-none" aria-hidden="true" />}
                <p className="relative s-eyebrow"><span className="s-num">{String(i + 1).padStart(2, '0')}</span> · {d.industry}</p>
                <h2 className="relative s-h3 mt-4">{d.title}</h2>
                <p className={`relative mt-3 text-[0.95rem] leading-relaxed ${i === 0 ? 'text-site-haze' : 'text-site-fog'}`}>{d.tagline}</p>
                <span className={`relative mt-auto pt-6 inline-flex items-center gap-2 text-[0.92rem] ${i === 0 ? 'text-site-spark' : 'text-site-signal'}`}>Try it <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <ConsultCta />
    </>
  );
}
