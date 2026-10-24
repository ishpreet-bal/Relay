import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { ConsultCta, Faq, ManagedAndPricing, RelatedDemos, ServiceHero, WhatWeBuild } from '@/components/site/service-page';
import { SectionHead } from '@/components/site/sections';
import { serviceByKey } from '@/site/content/services';

const service = serviceByKey('websites');

export const metadata: Metadata = {
  title: 'Websites and digital foundations',
  description: 'Professional websites, online booking, inquiry management, business email and the basics for new and smaller businesses, set up and maintained for you.',
  alternates: { canonical: service.href },
};

// Package scopes. Prices are quoted after a short call, so none appear here.
const PACKAGES = [
  {
    name: 'Launch', for: 'A new business that needs to look established online.',
    items: ['A professional, mobile-friendly website', 'Contact form that reaches your inbox', 'Domain, hosting and business email set up', 'Search engine foundations and analytics'],
  },
  {
    name: 'Bookings', for: 'A local service business that takes appointments.', featured: true,
    items: ['Everything in Launch', 'Online appointment booking', 'Automatic confirmations and reminders', 'Inquiry management in one place'],
  },
  {
    name: 'Foundation', for: 'A growing business ready for simple systems.',
    items: ['Everything in Bookings', 'Basic CRM set up around your customers', 'Simple customer follow-up workflows', 'Simple e-commerce, when it fits'],
  },
];

const PATH = ['Website and business email', 'Booking and inquiries', 'CRM and follow-ups', 'Custom automation'];

export default function WebsitesPage() {
  return (
    <>
      <ServiceHero service={service} index={3} />

      <section className="s-container py-20 sm:py-24">
        <SectionHead eyebrow="Packages" title={<>Start with <span className="s-em">what you need.</span></>}
          lede="Three starting points with a fixed scope. We quote each one after a short call about your business, and every package includes looking after the site once it is live." />
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {PACKAGES.map((p) => (
            <article key={p.name} className={`relative rounded-[24px] p-7 sm:p-8 flex flex-col ${p.featured ? 'on-dark' : 's-card'}`}>
              {p.featured && <div className="absolute inset-0 rounded-[24px] s-grid-bg pointer-events-none" aria-hidden="true" />}
              <div className="relative flex items-center justify-between">
                <h3 className="s-h3">{p.name}</h3>
                {p.featured && <span className="s-chip text-[0.75rem]">Most local businesses</span>}
              </div>
              <p className={`relative mt-3 text-[0.98rem] leading-snug ${p.featured ? 'text-site-haze' : 'text-site-fog'}`}>{p.for}</p>
              <ul className="relative mt-6 space-y-3">
                {p.items.map((i) => <li key={i} className="flex gap-2.5 text-[0.95rem] leading-snug"><Check className={`size-4 mt-0.5 shrink-0 ${p.featured ? 'text-site-spark' : 'text-site-signal'}`} />{i}</li>)}
              </ul>
              <div className="relative mt-auto pt-8">
                <p className={`s-label ${p.featured ? '' : ''}`}>Fixed price, quoted after a short call</p>
                <Link href={`/contact?service=websites&package=${p.name.toLowerCase()}`} className={`mt-4 w-full ${p.featured ? 's-btn-light' : 's-btn-quiet'}`}>Ask about {p.name} <ArrowRight className="size-4" /></Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-site-sand/50 border-y border-site-rule">
        <div className="s-container py-20 sm:py-24">
          <SectionHead eyebrow="Room to grow" title={<>Start simple. <span className="s-em">Add more when you need it.</span></>}
            lede="You are never pushed into an automation package you do not need. When the business grows, the same team that built your site can add the next step." />
          <ol className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PATH.map((p, i) => (
              <li key={p} className="relative s-card p-5 flex items-center gap-4">
                <span className={`grid size-9 shrink-0 place-items-center rounded-full font-mono text-[0.75rem] ${i === 0 ? 'bg-site-signal text-white' : 'border border-site-rule text-site-fog'}`}>{i + 1}</span>
                <span className="text-[0.98rem] leading-snug">{p}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <WhatWeBuild service={service} title={<>The online basics, <span className="s-em">done properly.</span></>} />

      <ManagedAndPricing service={service}
        included={['Design and writing with you', 'Hosting, security updates and backups', 'Booking and inquiry tools, connected', 'Small changes and fixes after launch']}
        upfront={['Domain and business email costs, if you prefer to hold the accounts yourself', 'What counts as a small change, and what is a new project', 'Any paid booking or payment tool the site relies on']} />

      <RelatedDemos slugs={['booking']} title="Try the booking flow" />

      <Faq items={[
        { q: 'Do I own my website and domain?', a: 'Yes. The domain is registered in your business’s name, and your content is yours.' },
        { q: 'Can you set up email like name@mybusiness.ca?', a: 'Yes. We set up professional business email on your own domain and connect it to the site’s contact and booking forms.' },
        { q: 'How long does a website take?', a: 'It depends on the package and how quickly content comes together. We agree a timeline in the proposal, before work starts.' },
        { q: 'What if I need changes later?', a: 'Small changes are part of looking after the site. Larger additions, like a new booking flow or online store, are quoted first.' },
      ]} />
      <ConsultCta title="Tell us about your business. We will recommend the right starting point." service="websites" />
    </>
  );
}
