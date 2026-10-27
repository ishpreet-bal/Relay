import type { Metadata } from 'next';
import { Check, KeyRound, LockKeyhole, ScrollText, Undo2 } from 'lucide-react';
import { ConsultCta, ProcessSteps, SectionHead, STEPS } from '@/components/site/sections';
import { BRAND } from '@/site/config';

export const metadata: Metadata = {
  title: 'How it works',
  description: `How ${BRAND.name} works with you: four steps from consultation to a running solution, how system access is handled, and how pricing and usage work.`,
  alternates: { canonical: '/how-it-works' },
};

const DETAIL = [
  { get: 'A clear picture of where time goes, and what could change', give: 'A short conversation, and the people who know the process' },
  { get: 'A written proposal: scope, approach, timeline, expected benefits, one price', give: 'A decision, with no obligation to proceed' },
  { get: 'A working solution, tested on real cases from your business', give: 'Access approvals and some help with testing' },
  { get: 'Monitoring, fixes, maintenance and agreed improvements', give: 'Feedback when your needs change' },
];

export default function HowItWorksPage() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-site-rule">
        <div className="absolute inset-0 s-grid-bg-light [mask-image:linear-gradient(to_bottom,black,transparent)] pointer-events-none" aria-hidden="true" />
        <div className="s-container relative pt-14 sm:pt-20 pb-14 sm:pb-16">
          <p className="s-eyebrow">How it works</p>
          <h1 className="s-display mt-5 max-w-5xl text-balance !text-[clamp(2.5rem,5.6vw,4.8rem)]">You focus on running your business. <span className="s-em">We handle the technology.</span></h1>
          <p className="s-lede mt-6 max-w-2xl">You should not need to understand APIs, buy automation tools or manage hosting. You tell us what the business needs; we design, build, connect and run it, and you pay one provider.</p>
        </div>
      </section>

      <section className="on-dark relative overflow-hidden">
        <div className="absolute inset-0 s-grid-bg pointer-events-none" aria-hidden="true" />
        <div className="s-container relative py-20 sm:py-24">
          <ProcessSteps />
        </div>
      </section>

      <section className="s-container py-20 sm:py-24">
        <SectionHead eyebrow="Step by step" title={<>What you get, and <span className="s-em">what we need from you.</span></>} />
        <div className="mt-12 overflow-hidden rounded-[22px] border border-site-rule">
          <div className="hidden sm:grid grid-cols-12 bg-site-sand/70 px-6 py-3 s-label">
            <span className="col-span-4">Step</span><span className="col-span-4">You get</span><span className="col-span-4">You provide</span>
          </div>
          {STEPS.map((s, i) => (
            <div key={s.title} className="grid gap-3 sm:grid-cols-12 border-t border-site-rule first:border-t-0 sm:first:border-t bg-site-chalk px-6 py-5">
              <p className="sm:col-span-4 font-medium"><span className="font-mono text-[0.72rem] text-site-signal mr-3">{i + 1}</span>{s.title}</p>
              <p className="sm:col-span-4 text-[0.95rem] leading-snug"><span className="sm:hidden s-label block mb-1">You get</span>{DETAIL[i]!.get}</p>
              <p className="sm:col-span-4 text-[0.95rem] leading-snug text-site-fog"><span className="sm:hidden s-label block mb-1">You provide</span>{DETAIL[i]!.give}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="access" className="bg-site-sand/50 border-y border-site-rule scroll-mt-20">
        <div className="s-container py-20 sm:py-24 grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionHead eyebrow="Access and authorization" title={<>Your systems stay <span className="s-em">under your control.</span></>}
              lede="To connect your applications we need your permission. Here is how we handle it." />
          </div>
          <ul className="lg:col-span-7 grid gap-4 sm:grid-cols-2">
            {[
              [KeyRound, 'You authorize every connection', 'Access is granted from your own accounts, for example by signing in to your accounting or email provider. We do not ask for your passwords.'],
              [LockKeyhole, 'Only what the work needs', 'We request the narrowest access that does the job, and we write down what we connected and why.'],
              [Undo2, 'Withdraw access at any time', 'You can revoke any connection from your own account settings, whenever you like.'],
              [ScrollText, 'Your data stays yours', 'We use it only to deliver the agreed service. We do not sell it, and we delete it when the service ends or on request.'],
            ].map(([Icon, t, b]) => {
              const I = Icon as typeof KeyRound;
              return (
                <li key={t as string} className="s-card p-6">
                  <span className="grid size-10 place-items-center rounded-xl bg-site-signal/[0.08] text-site-signal"><I className="size-5" /></span>
                  <p className="mt-4 font-medium">{t as string}</p>
                  <p className="mt-1.5 text-[0.94rem] leading-relaxed text-site-fog">{b as string}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section id="pricing" className="s-container py-20 sm:py-24 scroll-mt-20">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionHead eyebrow="Pricing" title={<>One straightforward price, <span className="s-em">not a pile of software bills.</span></>}
              lede="You pay us for the solution. The infrastructure and services behind it are our job to run and to pay for, within what your agreement includes." />
          </div>
          <div className="lg:col-span-7 grid gap-4">
            {[
              ['Custom automation', 'Quoted for your business after a consultation: a project price for the build, and a monthly service fee for hosting, monitoring and support.'],
              ['Customer acquisition', 'A tailored monthly service, set by your markets, volumes and channels.'],
              ['Websites and digital foundations', 'Fixed-scope packages, quoted after a short call.'],
            ].map(([t, b]) => (
              <div key={t} className="s-card p-6">
                <p className="font-medium">{t}</p>
                <p className="mt-1.5 text-[0.95rem] leading-relaxed text-site-fog">{b}</p>
              </div>
            ))}
            <div className="rounded-[22px] border border-site-rule p-6">
              <p className="s-label mb-4">Every agreement spells out</p>
              <ul className="grid gap-2.5 sm:grid-cols-2">
                {['What is in scope', 'The usage included each month', 'The support and maintenance you get', 'Any licence you must hold yourself, named before you sign'].map((x) => (
                  <li key={x} className="flex gap-2.5 text-[0.95rem] leading-snug"><Check className="size-4 mt-0.5 shrink-0 text-site-signal" />{x}</li>
                ))}
              </ul>
              <p className="mt-5 text-[0.95rem] leading-relaxed text-site-fog">
                If your usage grows well beyond what is included, we will tell you and agree the change with you first. Nothing extra is charged without your authorization.
              </p>
            </div>
          </div>
        </div>
      </section>

      <ConsultCta />
    </>
  );
}
