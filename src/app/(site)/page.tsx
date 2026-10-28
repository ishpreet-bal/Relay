import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { HeroWorkflow } from '@/components/site/hero-workflow';
import { IndustryShowcase } from '@/components/site/industry-showcase';
import { BuiltAround } from '@/components/site/built-around';
import { ScrollWords } from '@/components/site/motion';
import { Words } from '@/components/site/words';
import { ConsultCta, DemoTeaser, PlatformProof, ProcessSteps, SectionHead, ServiceFlips, Ticker } from '@/components/site/sections';
import { BRAND } from '@/site/config';

// What the platform actually runs on. Infrastructure, named as fact; not clients.
const STACK = ['Vercel', 'Render', 'Supabase', 'PostgreSQL', 'Anthropic', 'Google Cloud'];

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[900px] s-grid-bg-light [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)] pointer-events-none" aria-hidden="true" />
        <div className="absolute -top-48 left-1/2 -translate-x-1/2 h-[560px] w-[1100px] rounded-full bg-site-signal/[0.13] blur-[120px] pointer-events-none animate-[s-drift_18s_ease-in-out_infinite]" aria-hidden="true" />
        <div className="absolute top-[38%] -left-40 size-[420px] rounded-full bg-site-coral/[0.12] blur-[100px] pointer-events-none animate-[s-drift_22s_ease-in-out_infinite_reverse]" aria-hidden="true" />
        <div className="s-container relative pt-14 sm:pt-24 text-center">
          <Link href="/contact" className="s-rise group inline-flex items-center gap-2.5 rounded-full border border-site-rule bg-site-chalk/80 backdrop-blur py-1 pl-1 pr-4 text-[0.85rem] text-site-fog transition-colors hover:border-site-signal/40 hover:text-site-night">
            <span className="rounded-full bg-site-signal px-2.5 py-0.5 text-[0.75rem] font-medium text-white">Free</span>
            30-minute consultations, no obligation
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <h1 className="s-display mx-auto mt-8 max-w-5xl text-balance">
            <Words text="Your business." start={150} />{' '}
            <span className="s-em"><Words text="Running smarter." start={420} /></span>
          </h1>
          <p className="s-lede mx-auto mt-7 max-w-xl text-pretty s-rise" style={{ animationDelay: '700ms' }}>
            We design, build and run the software behind your business. You just use it.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row justify-center gap-3 s-rise" style={{ animationDelay: '850ms' }}>
            <Link href="/contact" className="s-btn-primary">Book a free consultation <ArrowRight className="size-4" /></Link>
            <Link href="#services" className="s-btn-quiet">See what we do</Link>
          </div>
        </div>
        <div className="s-container relative mt-16 sm:mt-20 pb-16 s-rise" style={{ animationDelay: '1000ms' }}>
          <div className="absolute inset-x-[8%] top-16 bottom-10 rounded-full bg-site-signal/25 blur-[90px] pointer-events-none" aria-hidden="true" />
          <div data-rise className="relative text-left"><HeroWorkflow /></div>
        </div>
        <div className="s-container relative pb-16 sm:pb-20">
          <p data-reveal className="text-center s-label">Built and run on proven infrastructure</p>
          <ul data-reveal style={{ '--d': '120ms' } as React.CSSProperties} className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 sm:gap-x-14">
            {STACK.map((n) => <li key={n} className="text-[1.15rem] sm:text-[1.3rem] font-semibold tracking-[-0.04em] text-site-night/35 transition-colors duration-300 hover:text-site-night">{n}</li>)}
          </ul>
        </div>
      </section>

      <Ticker />

      <section id="services" className="bg-site-sand/50 border-b border-site-rule scroll-mt-16">
        <div className="s-container py-20 sm:py-28">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <SectionHead number="01" eyebrow="Services" title={<>Pick your <span className="s-em">starting point.</span></>} />
            <p data-reveal className="text-[0.95rem] text-site-fog max-w-xs lg:text-right">Tap a card to turn it over.</p>
          </div>
          <div className="mt-12 sm:mt-14"><ServiceFlips /></div>
        </div>
      </section>

      <section className="on-dark relative overflow-hidden">
        <div className="absolute inset-0 s-grid-bg pointer-events-none" aria-hidden="true" />
        <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[480px] w-[900px] rounded-full bg-site-signal/20 blur-[120px] pointer-events-none" aria-hidden="true" />
        <div className="s-container relative py-24 sm:py-32">
          <p data-reveal className="s-eyebrow flex items-center gap-3"><span className="s-num">02</span><span className="h-px w-8 bg-current opacity-30" aria-hidden="true" />How it works</p>
          <ScrollWords text="You focus on running your business. We handle the technology." accentFrom={6}
            className="mt-6 max-w-5xl font-sans font-semibold text-[clamp(2.4rem,6vw,5.4rem)] leading-[1.0] tracking-[-0.05em]" />
          <div className="mt-16 sm:mt-20"><ProcessSteps /></div>
        </div>
      </section>

      <section className="s-container py-20 sm:py-28">
        <SectionHead number="03" eyebrow="Industries" title={<>Every business runs <span className="s-em">differently.</span></>} lede="Pick an industry to see what we would build." />
        <div className="mt-12 sm:mt-14"><IndustryShowcase /></div>
      </section>

      <section className="on-dark relative overflow-hidden">
        <div className="absolute inset-0 s-grid-bg pointer-events-none" aria-hidden="true" />
        <div className="absolute -right-40 bottom-0 size-[520px] rounded-full bg-site-spark/15 blur-[120px] pointer-events-none animate-[s-drift_18s_ease-in-out_infinite]" aria-hidden="true" />
        <div className="s-container relative py-20 sm:py-28">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <SectionHead number="04" eyebrow={`Built in-house`} title={<>We run on <span className="s-em">what we build.</span></>}
              lede={`${BRAND.name}’s own customer acquisition and operations run on a platform we built. The same components go into yours.`} />
            <span data-reveal className="s-chip shrink-0 self-start lg:self-end"><span className="size-1.5 rounded-full bg-site-tide s-pulse" />Running every day</span>
          </div>
          <div className="mt-12 sm:mt-14"><PlatformProof /></div>
        </div>
      </section>

      <section className="bg-site-sand/50 border-b border-site-rule">
        <div className="s-container py-20 sm:py-28">
          <SectionHead number="05" eyebrow="Built around you" title={<>Two manufacturers. <span className="s-em">Two different builds.</span></>} lede="Same proven building blocks, put together around how each company works." />
          <div className="mt-12 sm:mt-14"><BuiltAround /></div>
        </div>
      </section>

      <section className="on-dark relative overflow-hidden">
        <div className="absolute inset-0 s-grid-bg pointer-events-none" aria-hidden="true" />
        <div className="s-container relative py-20 sm:py-28">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
            <SectionHead number="06" eyebrow="Demos" title={<>Don’t take our word for it. <span className="s-em">Try it.</span></>} lede="Working demos on sample data. Hover, click, break them." />
            <Link data-reveal href="/demos" className="s-btn-quiet shrink-0">All seven demos <ArrowRight className="size-4" /></Link>
          </div>
          <div className="mt-12 sm:mt-14"><DemoTeaser /></div>
        </div>
      </section>

      <ConsultCta />
    </>
  );
}
