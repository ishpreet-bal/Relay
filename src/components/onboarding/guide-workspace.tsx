'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { Role } from '@prisma/client';
import { ArrowRight, BookOpen, Layers3, Radar, Search } from 'lucide-react';
import { toolsFor } from '@/lib/onboarding/guide';
import { can } from '@/lib/rbac';
import { Topbar } from '@/components/shell/topbar';
import { PageBody } from '@/components/ui/page';

export function GuideWorkspace({ role }: { role: Role }) {
  const [search, setSearch] = useState('');
  const portal = role === 'CLIENT_ADMIN' || role === 'CLIENT_MEMBER';
  const tools = toolsFor(role);
  const filtered = tools.filter(t => `${t.label} ${t.group} ${t.purpose} ${t.next}`.toLowerCase().includes(search.trim().toLowerCase()));
  const content = <div className="space-y-10">
    <header className="max-w-3xl"><p className="eyebrow text-accent mb-3">Start here</p><h2 className="text-3xl font-semibold leading-tight">A clear next step.<br />A workspace you understand.</h2><p className="mt-4 text-muted leading-relaxed">{portal ? 'Your company’s results and applications, with a guide to what each area does.' : 'Relay follows the work from finding a business to having a useful conversation and delivering a system that helps.'}</p></header>
    <div className="grid md:grid-cols-2 gap-5">
      <article className="card p-6 space-y-3"><Radar className="text-accent size-6" /><h3 className="text-lg font-semibold">Relay Intelligence</h3><p className="text-sm text-muted leading-relaxed">Find the right companies, understand what they do, locate contact routes, prepare calls and follow up. Every client gets their own audience, offer and outreach program.</p><p className="text-sm">Output: a researched prospect and a prepared conversation.</p></article>
      <article className="card p-6 space-y-3"><Layers3 className="text-accent size-6" /><h3 className="text-lg font-semibold">Relay Studio</h3><p className="text-sm text-muted leading-relaxed">Build and manage the workflows a client agrees to: booking, quote follow-up, inventory alerts, reporting or another defined process with approved data connections.</p><p className="text-sm">Output: a tested workflow with an owner and failure handling.</p></article>
    </div>
    <section className="card p-6 sm:p-8"><h3 className="text-lg font-semibold">Three words that unlock the workspace</h3><dl className="grid md:grid-cols-3 gap-6 mt-6">{[
      ['Client', 'The business Relay is selling for or building systems for. Relay itself is also an internal client.'],
      ['Account', 'A prospective customer of a client. The same company can be relevant to different clients for different reasons.'],
      ['Contact', 'A person or published business contact route at an account, including email or phone details when available.'],
    ].map(([term, definition]) => <div key={term}><dt className="font-semibold">{term}</dt><dd className="text-sm text-muted leading-relaxed mt-2">{definition}</dd></div>)}</dl></section>
    {!portal && <section><h3 className="text-lg font-semibold mb-5">Your first useful sales conversation</h3><ol className="grid sm:grid-cols-2 gap-4">{[
      ['Choose who you sell for', 'Select a client. Define their offer and ideal customer industries, sizes, locations and buyer roles.', '/clients', 'clientProfile:write'],
      ['Find and understand a company', 'Match Discovery to that audience, then read the account brief. Separate sourced facts from possible problems.', '/accounts', 'account:read'],
      ['Check how to reach them', 'Find published numbers and emails under Contacts. Use Resolve contacts on an account if details are missing.', '/contacts', 'account:read'],
      ['Call, learn and record', 'Open the ranked Call queue. Ask about their current process and bottleneck, then save an outcome and next step.', '/calls', 'call:read'],
    ].map(([title, text, href, permission], i) => <li key={title} className="card p-5"><p className="eyebrow text-accent mb-3">0{i + 1}</p><h4 className="font-semibold">{title}</h4><p className="text-sm text-muted leading-relaxed mt-2">{text}</p>{can(role, permission as Parameters<typeof can>[1]) && <Link prefetch={false} href={href!} className="inline-flex items-center gap-2 text-sm text-accent mt-4">Open<ArrowRight className="size-3.5" /></Link>}</li>)}</ol></section>}
    <section className="card p-6 space-y-4"><h3 className="text-lg font-semibold">What is known, and what needs a conversation</h3><p className="text-sm text-muted leading-relaxed">A website can tell you what a company sells, where it operates and which public systems it uses. It usually cannot prove that inventory is inaccurate, bookings are being missed, or growth is weak. Use the brief’s workflow ideas as questions: “How do you track this today? Where does it get delayed? Who owns it? How often does that happen?”</p><p className="text-sm text-muted leading-relaxed">Turn a confirmed need into a small pilot: one trigger, the minimum authorized data access, clear actions, human approvals where needed, and a measurable result. Agree on monitoring, retries, alerts and a manual fallback before expanding.</p></section>
    {!portal && <section className="card p-6 space-y-4"><h3 className="text-lg font-semibold">Why a contact or activity list can be empty</h3><p className="text-sm text-muted leading-relaxed">Finding companies and finding contacts are separate steps. Public websites can provide business numbers and emails; Apollo or Hunter can add contact data when configured with the right access and credits. A published address still needs verification and an outreach review.</p><p className="text-sm text-muted leading-relaxed">Call history contains calls your team logs in Relay. Email history contains recorded messages; it does not import every email from your inbox. A usable sending mailbox or provider is separate from a contact-data account.</p><p className="text-sm text-muted leading-relaxed">Call priority combines callbacks, replies, fit and other recorded signals. It is not a percentage chance of buying or being satisfied.</p></section>}
    <section><div className="flex flex-wrap items-center justify-between gap-4 mb-6"><div><h3 className="text-lg font-semibold">Every tool, explained</h3><p className="text-sm text-muted mt-2">Only tools available to your role appear here.</p></div><label className="relative w-full sm:w-72"><span className="sr-only">Search the workspace guide</span><Search className="absolute left-3 top-3 size-4 text-muted" /><input className="input pl-9" value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a tool or task…" /></label></div>
      {!filtered.length && <p role="status" className="card p-6 text-muted">No matching tools. Try “calls”, “contacts”, or “applications”.</p>}
      <div className="space-y-8">{[...new Set(filtered.map(t => t.group))].map(group => <div key={group}><h4 className="eyebrow mb-4">{group}</h4><div className="grid md:grid-cols-2 gap-4">{filtered.filter(t => t.group === group).map(t => <article key={t.href} className="card p-5 space-y-3"><Link prefetch={false} href={t.href} className="font-semibold inline-flex items-center gap-2 hover:text-accent">{t.label}<ArrowRight className="size-3.5" /></Link><p className="text-sm leading-relaxed">{t.purpose}</p><p className="text-sm text-muted leading-relaxed">{t.next}</p></article>)}</div></div>)}</div>
    </section><p className="text-sm text-muted flex items-center gap-2"><BookOpen className="size-4" />Return to Start here whenever you need a refresher.</p>
  </div>;
  return portal ? content : <><Topbar title="Start here" /><PageBody>{content}</PageBody></>;
}
