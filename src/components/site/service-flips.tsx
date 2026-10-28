'use client';

import Link from 'next/link';
import { ArrowRight, Globe2, Target, Workflow } from 'lucide-react';
import { SERVICES } from '@/site/content/services';
import { FlipCard } from './motion';

const SERVICE_ICON = { automation: Workflow, acquisition: Target, websites: Globe2 } as const;

/** The three services as cards that turn over to show what is included. */
export function ServiceFlips() {
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {SERVICES.map((s, i) => {
        const Icon = SERVICE_ICON[s.key];
        const dark = i === 0;
        return (
          <div key={s.key} data-reveal style={{ '--d': `${i * 120}ms` } as React.CSSProperties}>
            <div data-tilt="6" className="rounded-[28px]">
              <FlipCard label={s.name} height="h-[460px]"
                front={
                  <div data-spot className={`h-full p-7 sm:p-8 flex flex-col ${dark ? 'on-dark' : 'bg-site-chalk border border-site-rule rounded-[28px]'}`}>
                    {dark && <div className="absolute inset-0 s-grid-bg pointer-events-none" aria-hidden="true" />}
                    {dark && <div className="absolute -right-20 -top-20 size-[300px] rounded-full bg-site-signal/30 blur-[80px] pointer-events-none" aria-hidden="true" />}
                    <div className="relative flex items-center justify-between">
                      <span className="font-mono text-[0.72rem] s-num">0{i + 1}</span>
                      {dark && <span className="s-chip text-[0.72rem]"><span className="size-1.5 rounded-full bg-site-tide" />Most asked for</span>}
                    </div>
                    <span className={`relative mt-10 grid size-16 place-items-center rounded-2xl border ${dark ? 'border-white/10 bg-white/[0.06] text-site-spark shadow-[0_0_40px_-6px_rgb(124_152_255/0.6)]' : 'border-site-signal/15 bg-site-signal/[0.07] text-site-signal shadow-[0_0_40px_-10px_rgb(36_80_240/0.45)]'}`}>
                      <Icon className="size-7" strokeWidth={1.6} />
                    </span>
                    <h3 className="relative mt-auto text-[2rem] font-semibold leading-[1.02] tracking-[-0.045em]">{s.choice}</h3>
                    <p className={`relative mt-3 text-[1rem] leading-snug ${dark ? 'text-site-haze' : 'text-site-fog'}`}>{s.choiceDetail}</p>
                    <span className={`relative mt-6 inline-flex items-center gap-2 text-[0.85rem] ${dark ? 'text-site-spark' : 'text-site-signal'}`}>
                      <span className="grid size-6 place-items-center rounded-full border border-current/30">↻</span>Tap to see what’s included
                    </span>
                  </div>
                }
                back={
                  <div className={`h-full p-7 sm:p-8 flex flex-col ${dark ? 'bg-site-signal text-white' : 'on-dark'}`}>
                    <p className={`s-eyebrow ${dark ? '!text-white/70' : ''}`}>{s.name}</p>
                    <ul className="mt-6 space-y-3.5">
                      {s.highlights.map((h, k) => (
                        <li key={h} className="flex items-center gap-3 text-[1.05rem]">
                          <span className={`font-mono text-[0.7rem] ${dark ? 'text-white/60' : 'text-site-spark'}`}>{String(k + 1).padStart(2, '0')}</span>{h}
                        </li>
                      ))}
                    </ul>
                    <p className={`mt-auto text-[0.92rem] leading-snug ${dark ? 'text-white/80' : 'text-site-haze'}`}>Designed, built and looked after by us. One price.</p>
                    <Link href={s.href} className={`mt-5 s-btn h-11 ${dark ? 'bg-white text-site-night hover:bg-site-paper' : 'bg-site-paper text-site-night hover:bg-white'}`}>
                      Learn more <ArrowRight className="size-4" />
                    </Link>
                  </div>
                }
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
