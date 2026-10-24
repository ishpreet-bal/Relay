import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { HeroWorkflow } from '@/components/site/hero-workflow';
import { IndustryShowcase } from '@/components/site/industry-showcase';
import {
  BuiltAroundYou, ConsultCta, DemoTeaser, HonestyNote, ProcessSteps, SectionHead, ServiceCards, StartingPoints, WhyRelay,
} from '@/components/site/sections';
import { BRAND } from '@/site/config';

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[720px] s-grid-bg-light [mask-image:linear-gradient(to_bottom,black,transparent)] pointer-events-none" aria-hidden="true" />
        <div className="absolute -top-40 right-[-10%] size-[620px] rounded-full bg-site-signal/[0.12] blur-[110px] pointer-events-none" aria-hidden="true" />
        <div className="s-container relative pt-12 sm:pt-20 pb-16 sm:pb-24">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-7">
              <p className="s-eyebrow flex items-center gap-3"><span className="size-1.5 rounded-full bg-site-tide s-pulse" aria-hidden="true" />Custom technology, fully managed</p>
              <h1 className="s-display mt-6 text-balance">Your business. <span className="s-em">Running smarter.</span></h1>
            </div>
            <div className="lg:col-span-5 lg:pb-3">
              <p className="s-lede text-pretty">
                From everyday operations to finding your next customer, {BRAND.name} builds and manages the technology that helps your business grow.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link href="/contact" className="s-btn-primary">Book a free consultation <ArrowRight className="size-4" /></Link>
                <Link href="/services" className="s-btn-quiet">Explore our solutions</Link>
              </div>
            </div>
          </div>
          <div className="mt-12 sm:mt-16">
            <HeroWorkflow />
          </div>
          <div className="mt-16 sm:mt-20">
            <p className="s-label mb-4">Where would you like to start?</p>
            <StartingPoints />
          </div>
        </div>
      </section>

      <section className="bg-site-sand/50 border-y border-site-rule">
        <div className="s-container py-20 sm:py-28">
          <SectionHead number="01" eyebrow="Services" title={<>Three ways we help. <span className="s-em">One provider</span> for all of it.</>}
            lede="Start with what you need today. Every service is designed, built and run by us, and quoted as one straightforward price." />
          <div className="mt-12 sm:mt-16"><ServiceCards /></div>
        </div>
      </section>

      <section className="on-dark relative overflow-hidden">
        <div className="absolute inset-0 s-grid-bg pointer-events-none" aria-hidden="true" />
        <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[480px] w-[900px] rounded-full bg-site-signal/20 blur-[120px] pointer-events-none" aria-hidden="true" />
        <div className="s-container relative py-20 sm:py-28">
          <SectionHead number="02" eyebrow="How it works" title={<>You focus on running your business. <span className="s-em">We handle the technology.</span></>}
            lede="No software to learn, no tools to buy, no integrations to manage. Four steps, and only one of them asks much of you." />
          <div className="mt-12 sm:mt-16"><ProcessSteps /></div>
          <Link href="/how-it-works" className="mt-10 inline-flex items-center gap-2 text-site-spark hover:text-site-paper transition-colors">
            How we work, access and pricing <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <section className="s-container py-20 sm:py-28">
        <SectionHead number="03" eyebrow="Industries" title={<>Different businesses. <span className="s-em">Different solutions.</span></>}
          lede="Choose an industry to see what we could build, how the workflow would run, and a sample run computed on fictional data." />
        <div className="mt-12 sm:mt-16"><IndustryShowcase /></div>
        <div className="mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-[22px] border border-site-rule bg-site-chalk p-6 sm:p-7">
          <p className="font-serif text-[1.35rem] leading-snug tracking-[-0.02em]">Don’t see your industry? <span className="text-site-fog">We build around your business, not the other way around.</span></p>
          <Link href="/contact" className="s-btn-quiet shrink-0">Tell us what you do</Link>
        </div>
      </section>

      <section className="bg-site-sand/50 border-y border-site-rule">
        <div className="s-container py-20 sm:py-28">
          <SectionHead number="04" eyebrow="Customization" title={<>Built around <span className="s-em">the way you work.</span></>}
            lede="Two manufacturers can need completely different things. We reuse proven components where they fit, and design the solution itself around each company’s systems and requirements." />
          <div className="mt-12 sm:mt-16"><BuiltAroundYou /></div>
        </div>
      </section>

      <section className="on-dark relative overflow-hidden">
        <div className="absolute inset-0 s-grid-bg pointer-events-none" aria-hidden="true" />
        <div className="s-container relative py-20 sm:py-28">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
            <SectionHead number="05" eyebrow="Demonstrations" title={<>Working examples, <span className="s-em">not promises.</span></>}
              lede="Seven small applications you can use right now. Each runs on fictional sample data in your browser. None is a client project." />
            <Link href="/demos" className="s-btn-quiet shrink-0">All demos <ArrowRight className="size-4" /></Link>
          </div>
          <div className="mt-12 sm:mt-16"><DemoTeaser /></div>
        </div>
      </section>

      <section className="s-container py-20 sm:py-28">
        <div className="grid gap-14 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionHead number="06" eyebrow={`Why ${BRAND.name}`} title={<>One partner for <span className="s-em">the whole technical job.</span></>} />
            <div className="mt-10"><HonestyNote /></div>
          </div>
          <div className="lg:col-span-7 lg:pt-12"><WhyRelay /></div>
        </div>
      </section>

      <ConsultCta />
    </>
  );
}
