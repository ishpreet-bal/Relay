import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, FlaskConical } from 'lucide-react';
import { ConsultCta } from '@/components/site/sections';
import { DEMOS, demoBySlug } from '@/site/demos/catalog';
import { BRAND } from '@/site/config';

// Each demo is its own client bundle, loaded only on its page.
const VIEWS = {
  'quality-report': dynamic(() => import('@/components/site/demos/quality-demo').then((m) => m.QualityDemo)),
  estimate: dynamic(() => import('@/components/site/demos/estimate-demo').then((m) => m.EstimateDemo)),
  shipments: dynamic(() => import('@/components/site/demos/shipments-demo').then((m) => m.ShipmentsDemo)),
  'clinic-admin': dynamic(() => import('@/components/site/demos/clinic-demo').then((m) => m.ClinicDemo)),
  booking: dynamic(() => import('@/components/site/demos/booking-demo').then((m) => m.BookingDemo)),
  inventory: dynamic(() => import('@/components/site/demos/inventory-demo').then((m) => m.InventoryDemo)),
  prospects: dynamic(() => import('@/components/site/demos/prospects-demo').then((m) => m.ProspectsDemo)),
} as const;

export const dynamicParams = false;
export function generateStaticParams() {
  return DEMOS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const demo = demoBySlug((await params).slug);
  if (!demo) return {};
  return {
    title: `${demo.title} · demo`,
    description: `${demo.tagline} A working sample application for ${demo.industry.toLowerCase()}, on fictional data.`,
    alternates: { canonical: `/demos/${demo.slug}` },
  };
}

export default async function DemoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const demo = demoBySlug(slug);
  const View = VIEWS[slug as keyof typeof VIEWS];
  if (!demo || !View) notFound();

  return (
    <>
      <section className="relative overflow-hidden border-b border-site-rule">
        <div className="absolute inset-0 s-grid-bg-light [mask-image:linear-gradient(to_bottom,black,transparent)] pointer-events-none" aria-hidden="true" />
        <div className="s-container relative pt-12 sm:pt-16 pb-10">
          <p className="s-eyebrow"><Link href="/demos" className="hover:text-site-night">Demos</Link> <span className="mx-2">/</span> {demo.industry}</p>
          <h1 className="s-display mt-5 max-w-4xl text-balance !text-[clamp(2.3rem,5vw,4.2rem)]">{demo.title}</h1>
          <p className="s-lede mt-5 max-w-2xl">{demo.tagline}</p>
          <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-site-rule bg-site-chalk px-3.5 h-9 text-[0.84rem] text-site-fog">
            <FlaskConical className="size-4 text-site-coral" />A working sample on fictional data, running in your browser. Not a client project, and not connected to any real system.
          </p>
          <nav aria-label="Other demos" className="mt-8 -mx-4 px-4 flex gap-2 overflow-x-auto pb-1">
            {DEMOS.map((d) => (
              <Link key={d.slug} href={`/demos/${d.slug}`} aria-current={d.slug === slug ? 'page' : undefined}
                className={`shrink-0 rounded-full border px-3.5 h-9 inline-flex items-center text-[0.84rem] transition-colors ${d.slug === slug ? 'border-site-night bg-site-night text-site-paper' : 'border-site-rule bg-site-chalk hover:border-site-night/40'}`}>
                {d.industry}
              </Link>
            ))}
          </nav>
        </div>
      </section>

      <section className="s-container py-12 sm:py-16">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="s-card p-6">
            <p className="s-eyebrow">The problem</p>
            <p className="mt-3 text-[1rem] leading-relaxed">{demo.problem}</p>
          </div>
          <div className="s-card p-6">
            <p className="s-eyebrow">Before {BRAND.name}</p>
            <ol className="mt-3 space-y-2.5">
              {demo.manual.map((m, i) => <li key={m} className="flex gap-3 text-[0.95rem] leading-snug"><span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-site-coral/15 font-mono text-[0.62rem] text-[#9C3220]">{i + 1}</span>{m}</li>)}
            </ol>
          </div>
          <div className="on-dark rounded-[22px] p-6 relative overflow-hidden">
            <div className="absolute inset-0 s-grid-bg pointer-events-none" aria-hidden="true" />
            <p className="relative s-eyebrow">With {BRAND.name}</p>
            <ol className="relative mt-3 space-y-2.5">
              {demo.automated.map((m, i) => <li key={m} className="flex gap-3 text-[0.95rem] leading-snug"><span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-site-tide/20 font-mono text-[0.62rem] text-site-tide">{i + 1}</span>{m}</li>)}
            </ol>
          </div>
        </div>
      </section>

      <section className="s-container pb-12 sm:pb-16" aria-label="Interactive example">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <h2 className="s-h3">Try it</h2>
          <p className="text-[0.9rem] text-site-fog max-w-xl sm:text-right"><span className="text-site-night">Output:</span> {demo.output}</p>
        </div>
        <View />
      </section>

      <section className="s-container pb-4">
        <div className="grid gap-6 rounded-[28px] border border-site-rule bg-site-sand/50 p-6 sm:p-10 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-5">
            <p className="s-eyebrow">For a real business</p>
            <h2 className="s-h3 mt-3">What we would customize for you</h2>
            <p className="mt-3 text-[0.98rem] leading-relaxed text-site-fog">This demo shows the shape of the solution. A real one is designed around your process and connected to your systems.</p>
          </div>
          <ul className="lg:col-span-7 grid gap-2 sm:grid-cols-2">
            {demo.customize.map((c) => <li key={c} className="s-card px-4 py-3 text-[0.94rem] leading-snug">{c}</li>)}
          </ul>
        </div>
        <div className="mt-6 flex justify-end">
          <Link href={`/contact?demo=${demo.slug}`} className="inline-flex items-center gap-2 text-site-signal">Talk to us about something like this <ArrowRight className="size-4" /></Link>
        </div>
      </section>

      <ConsultCta />
    </>
  );
}
