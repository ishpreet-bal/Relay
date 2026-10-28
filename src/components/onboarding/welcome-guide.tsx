'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Role } from '@prisma/client';
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { guideStorageKey } from '@/lib/onboarding/guide';

const STEPS = [
  { title: 'Two parts of Relay', text: 'Intelligence helps you find companies, understand them, find contact routes, and manage outreach. Studio is where your team builds and runs agreed automations for a client.', task: 'Start with a conversation. Use research to prepare useful questions, then confirm the business need.' },
  { title: 'Client, account, contact', text: 'A client is the company you are selling for. An account is a prospective customer of that client. A contact is a person or business contact route at that account.', task: 'Use the client selector at the top of each page. “All clients” combines records for staff; select one client for a focused sales list.' },
  { title: 'Personalize the outreach program', text: 'Each client has its own business profile, offers, ideal customer profiles and playbooks. Ideal customers specify industries, employee range, locations and buyer roles.', task: 'Example: an industrial supplier may want manufacturers with 1,000+ employees. Set those criteria for that client, then match the discovery profile and campaign to them.' },
  { title: 'A useful sales conversation', text: 'Discovery finds companies. Research builds sourced briefs and possible workflow needs. Contacts shows email and phone routes. Call queue ranks follow-ups using recorded signals and fit.', task: 'Read the brief, confirm the number, ask how they handle the process today, and save the call outcome. Scores are priorities, never win probabilities.' },
  { title: 'Build, test and manage', text: 'After the client confirms a problem, define the trigger, data connections, actions, approvals and success criteria. Build the workflow in Studio, test it with sample inputs, then arrange deployment and monitoring.', task: 'Email history shows recorded messages; Call history shows logged calls. Missing credentials or failed jobs are visible in Connectors and System to authorized staff.' },
];
const CLIENT_STEPS = [
  { title: 'Your company’s workspace', text: 'Your portal shows the results, meetings, outreach campaigns and applications available to your company.', task: 'Your access is limited to your own company. Your Relay manager handles operational setup.' },
  { title: 'Intelligence and Studio', text: 'Intelligence researches and reaches prospective customers for your company. Studio provides the specific automations your company has agreed with Relay.', task: 'Review Your business with your manager: your offer, target industries, company sizes, regions and buyer roles shape your outreach.' },
  { title: 'Know what happens next', text: 'Review meetings and qualification notes, follow campaign progress, and use the workflows available under Applications.', task: 'Tell your Relay manager when the audience, process or business priorities change. New automation needs a confirmed scope and testing.' },
];
export function WelcomeGuide({ role, organizationId, userId }: { role: Role; organizationId: string; userId: string }) {
  const key = guideStorageKey(organizationId, userId, role);
  const portal = role === 'CLIENT_ADMIN' || role === 'CLIENT_MEMBER';
  const steps = portal ? CLIENT_STEPS : STEPS;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
    try { setOpen(localStorage.getItem(key) !== 'seen'); } catch { setOpen(true); }
  }, [key]);
  const dismiss = () => { try { localStorage.setItem(key, 'seen'); } catch { /* Help stays available without browser storage. */ } setOpen(false); };
  const current = steps[step]!;
  return <Dialog open={open} onOpenChange={value => { if (!value) dismiss(); }} title="Welcome to Relay" description="A short tour of your workspace. You can revisit the full guide from Start here." width="lg">
    <div className="space-y-6">
      <div className="flex gap-2" aria-label={`Step ${step + 1} of ${steps.length}`}>{steps.map((_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-hairline'}`} />)}</div>
      <div className="min-h-40"><p className="eyebrow mb-3">Step {step + 1} of {steps.length}</p><h2 className="text-xl font-semibold">{current.title}</h2><p className="text-sm text-muted leading-relaxed mt-4">{current.text}</p></div>
      <p className="rounded-xl bg-accent-soft p-4 text-sm leading-relaxed">{current.task}</p>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-5">
        <button type="button" className="btn-ghost" onClick={dismiss}>Skip tour</button>
        <div className="flex gap-2">{step > 0 && <button type="button" className="btn-outline" onClick={() => setStep(s => s - 1)}><ArrowLeft className="size-4" />Back</button>}
          {step < steps.length - 1 ? <button type="button" className="btn-primary" onClick={() => setStep(s => s + 1)}>Next<ArrowRight className="size-4" /></button> : <Link href={portal ? '/portal/guide' : '/guide'} onClick={dismiss} className="btn-primary">Open Start here<CheckCircle2 className="size-4" /></Link>}
        </div>
      </div>
    </div>
  </Dialog>;
}
