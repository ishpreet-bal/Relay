import type { Metadata } from 'next';
import { Suspense } from 'react';
import { InquiryForm } from '@/components/site/inquiry-form';
import { BRAND, siteEmails } from '@/site/config';

export const metadata: Metadata = {
  title: 'Book a free consultation',
  description: `Tell ${BRAND.name} about your business and suggest a time for a free consultation. No account needed.`,
  alternates: { canonical: '/contact' },
};

const NEXT = [
  { title: 'We read it properly', body: 'A person reads every inquiry. No account, no obligation, and no sales sequence.' },
  { title: 'We reply to arrange a call', body: 'We confirm one of the times you suggested, or offer a few.' },
  { title: 'We talk about your business', body: 'About 30 minutes on how things work today and what you want to change. If we are not the right fit, we will say so.' },
];

export default function ContactPage() {
  const emails = siteEmails();
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[520px] s-grid-bg-light [mask-image:linear-gradient(to_bottom,black,transparent)] pointer-events-none" aria-hidden="true" />
      <div className="s-container relative pt-12 sm:pt-20 pb-20 sm:pb-28 grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <p className="s-eyebrow">Free consultation</p>
          <h1 className="s-display mt-5 text-balance !text-[clamp(2.4rem,4.8vw,4rem)]">Tell us about <span className="s-em">your business.</span></h1>
          <p className="s-lede mt-6">The more you tell us about how things work today, the more useful the first conversation will be.</p>
          <ol className="mt-10 space-y-6">
            {NEXT.map((n, i) => (
              <li key={n.title} className="flex gap-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-site-night text-site-paper font-mono text-[0.72rem]">{i + 1}</span>
                <span><span className="block font-medium">{n.title}</span><span className="mt-1 block text-[0.95rem] leading-relaxed text-site-fog">{n.body}</span></span>
              </li>
            ))}
          </ol>
          {emails && (
            <div className="mt-10 rounded-2xl border border-site-rule bg-site-chalk p-5">
              <p className="s-label mb-3">Prefer email?</p>
              <ul className="space-y-1.5 text-[0.95rem]">
                <li>General: <a className="s-link" href={`mailto:${emails.hello}`}>{emails.hello}</a></li>
                <li>Sales: <a className="s-link" href={`mailto:${emails.sales}`}>{emails.sales}</a></li>
                <li>Existing clients: <a className="s-link" href={`mailto:${emails.support}`}>{emails.support}</a></li>
              </ul>
            </div>
          )}
        </div>
        <div className="lg:col-span-7">
          <Suspense fallback={<div className="s-card h-[900px]" aria-hidden="true" />}>
            <InquiryForm fallbackEmail={emails?.hello} />
          </Suspense>
        </div>
      </div>
    </section>
  );
}
