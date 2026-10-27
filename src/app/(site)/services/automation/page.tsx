import type { Metadata } from 'next';
import { Database, FileSpreadsheet, Inbox, LayoutDashboard, Plug, Receipt, ShoppingCart, Users, CalendarDays } from 'lucide-react';
import { ConsultCta, Faq, ManagedAndPricing, RelatedDemos, ServiceHero, WhatWeBuild } from '@/components/site/service-page';
import { SectionHead } from '@/components/site/sections';
import { BuiltAround } from '@/components/site/built-around';
import { serviceByKey } from '@/site/content/services';

const service = serviceByKey('automation');

export const metadata: Metadata = {
  title: 'Custom business automation',
  description: 'Custom applications and automations built around how your business works: data entry, reporting, inventory, invoicing, scheduling and more. Designed, built, hosted and supported for you.',
  alternates: { canonical: service.href },
};

const PHASES = [
  { title: 'Discovery', body: 'We map how the work really runs, exceptions included.' },
  { title: 'Proposal', body: 'What gets automated, what connects, the timeline and one price.' },
  { title: 'Build', body: 'Short iterations, tested on real examples from your business.' },
  { title: 'Run', body: 'Hosted, monitored and improved as you grow.' },
];

const SYSTEMS = [
  { icon: FileSpreadsheet, label: 'Spreadsheets and shared drives' },
  { icon: Inbox, label: 'Email inboxes and web forms' },
  { icon: Receipt, label: 'Accounting and invoicing' },
  { icon: Users, label: 'CRMs and customer lists' },
  { icon: CalendarDays, label: 'Calendars and booking tools' },
  { icon: Database, label: 'Databases' },
  { icon: ShoppingCart, label: 'E-commerce and point of sale' },
  { icon: LayoutDashboard, label: 'Dashboards and reporting' },
  { icon: Plug, label: 'Industry systems with an API or export' },
];

export default function AutomationPage() {
  return (
    <>
      <ServiceHero service={service} index={1} />
      <WhatWeBuild service={service} title={<>If your team does it <span className="s-em">over and over,</span> we can automate it.</>} />

      <section className="on-dark relative overflow-hidden">
        <div className="absolute inset-0 s-grid-bg pointer-events-none" aria-hidden="true" />
        <div className="s-container relative py-20 sm:py-24">
          <SectionHead eyebrow="How a project runs" title={<>No generic chatbot. <span className="s-em">Built for your process.</span></>} />
          <ol className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {PHASES.map((p, i) => (
              <li key={p.title} data-reveal style={{ '--d': `${i * 120}ms` } as React.CSSProperties} data-spot data-tilt="5" className="s-card p-6 sm:p-7">
                <span className="font-mono text-[0.72rem] text-site-spark">Phase {i + 1}</span>
                <h3 className="s-h3 mt-4 text-[1.35rem]">{p.title}</h3>
                <p className="mt-3 text-[0.95rem] leading-relaxed text-site-haze">{p.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="s-container py-20 sm:py-24">
        <SectionHead eyebrow="Customization" title={<>Same industry, <span className="s-em">different solution.</span></>} />
        <div className="mt-12"><BuiltAround /></div>
      </section>

      <section className="bg-site-sand/50 border-y border-site-rule">
        <div className="s-container py-20 sm:py-24 grid gap-10 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-5">
            <SectionHead eyebrow="Integration" title={<>We work with <span className="s-em">what you already use.</span></>}
              lede="If it has an API, an export or an inbox, we can usually connect it. We confirm it before you commit." />
          </div>
          <ul className="lg:col-span-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SYSTEMS.map(({ icon: Icon, label }, i) => (
              <li key={label} data-reveal style={{ '--d': `${i * 60}ms` } as React.CSSProperties} className="s-card s-lift p-4 flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-site-signal/[0.08] text-site-signal"><Icon className="size-4" /></span>
                <span className="text-[0.92rem] leading-snug">{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <ManagedAndPricing service={service}
        included={['Design, build and testing', 'Hosting and monitoring', 'The services it runs on, within agreed volumes', 'Fixes and support']}
        upfront={['Any licence you hold yourself', 'Included usage', 'What is in scope']} />

      <RelatedDemos slugs={['quality-report', 'estimate', 'shipments', 'clinic-admin', 'inventory']} />

      <Faq items={[
        { q: 'Do we need to change the software we use?', a: 'Usually not. We connect to the tools you already run, and tell you during design if something can’t be.' },
        { q: 'What happens when something breaks?', a: 'We monitor what we build and fix it as part of your service agreement.' },
        { q: 'Can we start small?', a: 'Yes. Most projects start with the one workflow costing the most time.' },
      ]} />
      <ConsultCta title="Which work keeps repeating? Let’s automate it." service="automation" />
    </>
  );
}
