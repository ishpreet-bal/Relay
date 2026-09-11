'use client';

import Link from 'next/link';
import { ArrowRight, Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PipelineProgress {
  leads: number;
  researched: number;
  drafts: number;
  sent: number;
  hasBrief: boolean;
}

/**
 * Shown until the first email goes out. A dashboard of zeroes tells a new
 * workspace nothing about what to do next, and every stage here is a real
 * precondition for the one after it — research needs a lead, drafting needs
 * research and a brief, sending needs an approved draft.
 */
export function GettingStarted({ progress }: { progress: PipelineProgress }) {
  const steps = [
    {
      done: progress.leads > 0,
      title: 'Add a lead',
      body: 'A company you want to work with. The website matters — research reads it.',
      href: '/leads',
      cta: 'Go to leads',
      count: progress.leads,
    },
    {
      done: progress.hasBrief,
      title: 'Write your outreach brief',
      body: 'One or two sentences on what you do. It is the only claim a draft may make about you.',
      href: '/settings',
      cta: 'Open settings',
    },
    {
      done: progress.researched > 0,
      title: 'Research a lead',
      body: 'Reads their site and keeps only claims it can tie back to a quote.',
      href: '/research',
      cta: 'Queue research',
      count: progress.researched,
    },
    {
      done: progress.drafts > 0,
      title: 'Draft an email',
      body: 'Written from verified facts. Lands in review — it cannot send itself.',
      href: '/drafts',
      cta: 'Write drafts',
      count: progress.drafts,
    },
    {
      done: progress.sent > 0,
      title: 'Approve and send',
      body: 'A human reads every draft before it goes out. That gate does not turn off.',
      href: '/review',
      cta: 'Open review queue',
      count: progress.sent,
    },
  ];

  const complete = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);

  return (
    <section className="card p-5 mb-5">
      <div className="flex items-baseline gap-3 mb-1">
        <h2 className="text-[15px] font-semibold tracking-display flex-1">Get your first email out</h2>
        <span className="num text-[11px] text-muted">{complete} of {steps.length}</span>
      </div>
      <div className="h-1 rounded-full bg-hairline overflow-hidden mb-5">
        <div className="h-full bg-accent animate-meter-fill origin-left transition-[width] duration-500"
             style={{ width: `${(complete / steps.length) * 100}%` }} />
      </div>

      <ol className="space-y-1">
        {steps.map((step) => {
          const isNext = step === next;
          return (
            <li
              key={step.title}
              className={cn(
                'flex items-start gap-3 rounded-md p-2.5 transition-colors',
                isNext && 'bg-accent-soft/60',
              )}
            >
              {step.done
                ? <Check className="size-4 text-cleared shrink-0 mt-0.5" strokeWidth={2.5} />
                : <Circle className={cn('size-4 shrink-0 mt-0.5', isNext ? 'text-accent' : 'text-muted/50')}
                          strokeWidth={1.75} />}

              <div className="flex-1 min-w-0">
                <p className={cn('text-[13px]',
                  step.done ? 'text-muted line-through decoration-hairline' : 'font-medium')}>
                  {step.title}
                  {typeof step.count === 'number' && step.count > 0 && (
                    <span className="num text-[11px] text-muted ml-2">{step.count}</span>
                  )}
                </p>
                {!step.done && <p className="text-[11px] text-muted mt-0.5">{step.body}</p>}
              </div>

              {isNext && (
                <Link href={step.href} className="btn-primary h-7 text-micro shrink-0">
                  {step.cta} <ArrowRight className="size-3" />
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
