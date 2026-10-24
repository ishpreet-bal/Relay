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
  { step: 'Define', body: 'Your ideal customer: industry, location, size and the signals that make a business a good prospect.' },
  { step: 'Discover', body: 'Businesses that match, found from public sources and business data providers.' },
  { step: 'Research', body: 'Each one researched from its own website, with every fact tied to where it came from.' },
  { step: 'Qualify', body: 'Scored against your profile, with the reasons shown, so the best fits come first.' },
  { step: 'Prepare', body: 'Personalized outreach drafted from the research, for you to review.' },
  { step: 'Approve and follow up', body: 'Nothing goes out without approval. Replies, follow-ups and your pipeline stay organized.' },
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
      <WhatWeBuild service={service} title={<>A customer acquisition system, <span className="s-em">set up and run for you.</span></>} />

      <section className="on-dark relative overflow-hidden">
        <div className="absolute inset-0 s-grid-bg pointer-events-none" aria-hidden="true" />
        <div className="s-container relative py-20 sm:py-24">
          <SectionHead eyebrow="How it works" title={<>From <span className="s-em">who you want</span> to a pipeline you can work.</>} />
          <ol className="mt-12 grid gap-px overflow-hidden rounded-[22px] border border-site-seam bg-site-seam md:grid-cols-2 lg:grid-cols-3">
            {PIPELINE.map((p, i) => (
              <li key={p.step} className="bg-site-deep p-6 sm:p-7">
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
        <SectionHead eyebrow="Configured for you" title={<>Every client’s market is different. <span className="s-em">So is every setup.</span></>}
          lede="We configure discovery and research around your offer and your ideal customer. A few examples of how differently that can look:" />
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {EXAMPLES.map((e) => (
            <article key={e.who} className="s-card p-6 sm:p-7">
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
            <p className="mt-3 text-[0.98rem] leading-relaxed text-site-fog">Outreach is only worth it if it is done properly. These rules are built into how the system works, not left to chance.</p>
          </div>
          <ul className="lg:col-span-7 grid gap-4 sm:grid-cols-2">
            {[
              ['Permitted contact information only', 'Professional business contacts from appropriate sources, with where each detail came from recorded.'],
              ['Consent and identification', 'Messages follow the marketing laws that apply, including Canada’s anti-spam law: sender identification and a working unsubscribe in every email.'],
              ['You approve before anything is sent', 'Automated sending is only switched on with your authorization, within limits you set.'],
              ['No guaranteed results', 'We build and run a strong system. We do not promise a number of customers, replies or sales, and you should be wary of anyone who does.'],
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
        included={['Configuration for your market and offer', 'Discovery, research and data costs within the agreed volumes', 'CRM organization and follow-up scheduling', 'Ongoing running, tuning and reporting']}
        upfront={['The volumes included each month', 'Which channels are used, and who sends', 'Any tool you would hold an account for yourself, such as your own mailbox']} />

      <RelatedDemos slugs={['prospects']} title="Try the qualification step" />

      <Faq items={[
        { q: 'Who sends the emails?', a: 'Outreach is sent from your own business mailbox, under your name, so replies come straight to you. Nothing is sent until you approve it.' },
        { q: 'Where do the prospects come from?', a: 'Public sources such as business listings and company websites, and business data providers where appropriate. Each fact we use is linked to its source.' },
        { q: 'Can you guarantee a number of leads or meetings?', a: 'No. Results depend on your market, your offer and timing. We will be clear about what the system does and report honestly on what it finds.' },
        { q: 'Does it work outside Ontario?', a: 'Yes. Discovery can be configured for other provinces and countries, following the marketing rules that apply there.' },
      ]} />
      <ConsultCta title="Tell us who your best customers are. We will show you how we would find more of them." service="acquisition" />
    </>
  );
}
