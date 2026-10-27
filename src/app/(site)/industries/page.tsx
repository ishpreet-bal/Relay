import type { Metadata } from 'next';
import Link from 'next/link';
import { IndustryShowcase } from '@/components/site/industry-showcase';
import { ConsultCta } from '@/components/site/sections';

export const metadata: Metadata = {
  title: 'Industries',
  description: 'Example solutions for manufacturing, construction, logistics, clinic administration, salons and local services, retail, and startups. Every solution is built around the business.',
  alternates: { canonical: '/industries' },
};

export default function IndustriesPage() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-site-rule">
        <div className="absolute inset-0 s-grid-bg-light [mask-image:linear-gradient(to_bottom,black,transparent)] pointer-events-none" aria-hidden="true" />
        <div className="s-container relative pt-14 sm:pt-20 pb-14 sm:pb-16">
          <p className="s-eyebrow">Industries</p>
          <h1 className="s-display mt-5 max-w-4xl text-balance !text-[clamp(2.5rem,5.6vw,4.8rem)]">Different businesses. <span className="s-em">Different solutions.</span></h1>
          <p className="s-lede mt-6 max-w-2xl">Examples of what we could build in seven industries. They are illustrations, not past projects: what we build for you starts from how your business works.</p>
        </div>
      </section>
      <section className="s-container py-14 sm:py-20">
        <IndustryShowcase />
        <div className="mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-[22px] border border-site-rule bg-site-chalk p-6 sm:p-7">
          <p className="font-serif text-[1.35rem] leading-snug tracking-[-0.02em]">Don’t see your industry? <span className="text-site-fog">We build around your business, not the other way around.</span></p>
          <Link href="/contact" className="s-btn-quiet shrink-0">Tell us what you do</Link>
        </div>
      </section>
      <ConsultCta />
    </>
  );
}
