import type { Metadata } from 'next';
import { ShieldCheck } from 'lucide-react';
import { ConsultCta, Faq, ManagedAndPricing, RelatedDemos, ServiceHero, WhatWeBuild } from '@/components/site/service-page';
import { SectionHead } from '@/components/site/sections';
import { serviceByKey } from '@/site/content/services';

const service = serviceByKey('acquisition');

export const metadata: Metadata = {
  title: 'Customer acquisition and lead generation',
  description: 'A managed customer acquisition system configured around your ideal customer: discovery, research, qualification, CRM organization and outreach prepared for your approval.',
  alternates: { canonical: service.href },
};

const PIPELINE = [
  { step: 'Define', body: 'Who your best customer is, and the signals that matter.' },
  { step: 'Discover', body: 'Matching businesses, found from public sources.' },
  { step: 'Research', body: 'Each one researched, every fact linked to its source.' },
  { step: 'Qualify', body: 'Scored against your profile, best fits first.' },
  { step: 'Prepare', body: 'Personalized outreach, drafted for your review.' },
  { step: 'Follow up', body: 'Nothing sent without approval. Pipeline kept organized.' },
];

const EXAMPLES = [
  { who: 'A trucking company', looks: 'Manufacturers, distributors and wholesalers shipping regularly within its lanes', signals: 'New warehouses, growing product lines, job posts for shipping coordinators' },
  { who: 'A construction contractor', looks: 'Commercial property managers, developers and businesses expanding their premises', signals: 'New locations, permits and expansions, growing headcount' },
  { who: 'A software startup', looks: 'Organizations that match the product’s target audience, by size, industry and tools used', signals: 'Hiring for the roles the product helps, recent funding, technology in use' },
  { who: 'A pharmaceutical supplier', looks: 'Professional procurement and distribution contacts at pharmacies, clinics and distributors', signals: 'New locations, published tenders and supplier programmes' },
];

export default function AcquisitionPage() {
  return (
    <>
      <ServiceHero service={service} index={2} />
      <WhatWeBuild service={service} limit={6} title={<>A customer acquisition system, <span className="s-em">run for you.</span></>} />

      <section className="on-dark relative overflow-hidden">
        <div className="absolute inset-0 s-grid-bg pointer-events-none" aria-hidden="true" />
        <div className="s-container relative py-20 sm:py-24">
          <SectionHead eyebrow="How it works" title={<>From <span className="s-em">who you want</span> to a pipeline you can work.</>} />
          <ol className="mt-12 grid gap-px overflow-hidden rounded-[22px] border border-site-seam bg-site-seam md:grid-cols-2 lg:grid-cols-3">
            {PIPELINE.map((p, i) => (
              <li key={p.step} data-reveal style={{ '--d': `${i * 90}ms` } as React.CSSProperties} data-spot className="bg-site-deep p-6 sm:p-7 transition-colors hover:bg-[#16223a]">
                <span className="flex items-center gap-3">
                  <span className="grid size-7 place-items-center rounded-full border border-site-spark/40 font-mono text-[0.7rem] text-site-spark">{i + 1}</span>
                  <span className="text-[1.08rem] font-medium">{p.step}</span>
                </span>
                <p className="mt-3 text-[0.95rem] leading-relaxed text-site-haze">{p.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="s-container py-20 sm:py-24">
        <SectionHead eyebrow="Configured for you" title={<>Every market is different. <span className="s-em">So is every setup.</span></>} />
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {EXAMPLES.map((e, i) => (
            <article key={e.who} data-reveal style={{ '--d': `${(i % 2) * 110}ms` } as React.CSSProperties} data-spot data-tilt="4" className="s-card p-6 sm:p-7">
              <h3 className="s-h3 text-[1.35rem]">{e.who}</h3>
              <dl className="mt-5 space-y-4">
                <div><dt className="s-label">Looks for</dt><dd className="mt-1 text-[0.98rem] leading-snug">{e.looks}</dd></div>
                <div><dt className="s-label">Signals worth acting on</dt><dd className="mt-1 text-[0.98rem] leading-snug">{e.signals}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="s-container pb-20 sm:pb-24">
        <div className="grid gap-8 rounded-[28px] border border-site-rule bg-site-chalk p-6 sm:p-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <span className="grid size-11 place-items-center rounded-2xl bg-site-signal/[0.08] text-site-signal"><ShieldCheck className="size-5" /></span>
            <h2 className="s-h3 mt-5">Responsible by design</h2>
            <p className="mt-3 text-[0.98rem] leading-relaxed text-site-fog">Built into how the system works, not left to chance.</p>
          </div>
          <ul className="lg:col-span-7 grid gap-4 sm:grid-cols-2">
            {[
              ['Permitted contacts only', 'Professional business contacts, with the source of every detail recorded.'],
              ['Anti-spam compliant', 'Sender identification and a working unsubscribe in every email, under Canada’s anti-spam law.'],
              ['You approve first', 'Nothing is sent without your authorization, within limits you set.'],
              ['No guaranteed numbers', 'We build a strong system. Anyone promising a number of customers is guessing.'],
            ].map(([t, b]) => (
              <li key={t}>
                <p className="font-medium">{t}</p>
                <p className="mt-1.5 text-[0.93rem] leading-relaxed text-site-fog">{b}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <ManagedAndPricing service={service}
        included={['Setup for your market', 'Research and data within agreed volumes', 'CRM and follow-ups', 'Running, tuning and reporting']}
        upfront={['Monthly volumes', 'Channels and who sends', 'Accounts you hold yourself']} />

      <RelatedDemos slugs={['prospects']} title="Try the qualification step" />

      <Faq items={[
        { q: 'Who sends the emails?', a: 'You do, from your own business mailbox, so replies come straight to you. Nothing goes out until you approve it.' },
        { q: 'Where do prospects come from?', a: 'Public sources such as business listings and company websites. Every fact we use is linked to its source.' },
        { q: 'Does it work outside Ontario?', a: 'Yes. It can be set up for any market, following the marketing rules that apply there.' },
      ]} />
      <ConsultCta title="Tell us who your best customer is. We’ll find more of them." service="acquisition" />
    </>
  );
}
