import type { Metadata } from 'next';
import { Database, FileSpreadsheet, Inbox, LayoutDashboard, Plug, Receipt, ShoppingCart, Users, CalendarDays } from 'lucide-react';
import { ConsultCta, Faq, ManagedAndPricing, RelatedDemos, ServiceHero, WhatWeBuild } from '@/components/site/service-page';
import { BuiltAroundYou, SectionHead } from '@/components/site/sections';
import { serviceByKey } from '@/site/content/services';

const service = serviceByKey('automation');

export const metadata: Metadata = {
  title: 'Custom business automation',
  description: 'Custom applications and automations built around how your business works: data entry, reporting, inventory, invoicing, scheduling and more. Designed, built, hosted and supported for you.',
  alternates: { canonical: service.href },
};

const PHASES = [
  { title: 'Discovery', body: 'We sit with the people who do the work and map the process as it really runs: the files, the inboxes, the exceptions.' },
  { title: 'Design and proposal', body: 'A written plan: what will be automated, what stays with people, which systems connect, the timeline and one price.' },
  { title: 'Build and connect', body: 'We build in short iterations, connect the systems you authorize and test with real examples from your business.' },
  { title: 'Run and improve', body: 'We host and monitor it, handle errors and changes, and improve it as your business grows.' },
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
      <WhatWeBuild service={service} title={<>If your team does it <span className="s-em">over and over,</span> we can probably automate it.</>} />

      <section className="on-dark relative overflow-hidden">
        <div className="absolute inset-0 s-grid-bg pointer-events-none" aria-hidden="true" />
        <div className="s-container relative py-20 sm:py-24">
          <SectionHead eyebrow="How a project runs" title={<>No generic chatbot. <span className="s-em">A solution for your process.</span></>}
            lede="Every business has different workflows, so we do not install the same product for everyone. We work out what should be automated, then build around it." />
          <ol className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {PHASES.map((p, i) => (
              <li key={p.title} className="s-card p-6 sm:p-7">
                <span className="font-mono text-[0.72rem] text-site-spark">Phase {i + 1}</span>
                <h3 className="s-h3 mt-4 text-[1.35rem]">{p.title}</h3>
                <p className="mt-3 text-[0.95rem] leading-relaxed text-site-haze">{p.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="s-container py-20 sm:py-24">
        <SectionHead eyebrow="Customization" title={<>Same industry, <span className="s-em">different solution.</span></>}
          lede="We reuse proven technical components so what we build is reliable, and shape the actual solution around each company." />
        <div className="mt-12"><BuiltAroundYou /></div>
      </section>

      <section className="bg-site-sand/50 border-y border-site-rule">
        <div className="s-container py-20 sm:py-24 grid gap-10 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-5">
            <SectionHead eyebrow="Integration" title={<>We work with <span className="s-em">what you already use.</span></>}
              lede="If it has an API, an export or an inbox, we can usually work with it. We confirm what is possible with your specific systems during design, before you commit." />
          </div>
          <ul className="lg:col-span-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SYSTEMS.map(({ icon: Icon, label }) => (
              <li key={label} className="s-card p-4 flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-site-signal/[0.08] text-site-signal"><Icon className="size-4" /></span>
                <span className="text-[0.92rem] leading-snug">{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <ManagedAndPricing service={service}
        included={['Design, development and testing', 'Hosting, databases and monitoring', 'The AI and third-party services the solution uses, within agreed volumes', 'Fixes, maintenance and agreed support']}
        upfront={['Any licence you must hold yourself (for example, software you already subscribe to)', 'What usage is included, and what happens if you need more', 'What is in scope, and what would be a separate change']} />

      <RelatedDemos slugs={['quality-report', 'estimate', 'shipments', 'clinic-admin', 'inventory']} />

      <Faq items={[
        { q: 'Do we need to change the software we already use?', a: 'Usually not. We connect to the tools you already run. If something genuinely cannot be connected, we will tell you during design and suggest options.' },
        { q: 'Do we have to learn a new platform?', a: 'No. Most of what we build works in the background or shows up in the places you already look: your inbox, your spreadsheet, a simple dashboard.' },
        { q: 'What happens when something breaks?', a: 'We monitor what we build and fix problems as part of your service agreement. Your agreement sets out the support you get and how to reach us.' },
        { q: 'Who owns our data?', a: 'You do. We access your systems only with your authorization, only for the work agreed, and you can withdraw access at any time.' },
        { q: 'Can we start small?', a: 'Yes. Many projects start with one workflow that is costing the most time, and grow once it is working.' },
      ]} />
      <ConsultCta title="Tell us which work keeps repeating. We will show you what we would automate." service="automation" />
    </>
  );
}
