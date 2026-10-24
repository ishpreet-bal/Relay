'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, CalendarDays, Check, CircleAlert, Loader2 } from 'lucide-react';
import { consultationSlots, formatSlot, type SlotDay } from '@/site/consultation';
import { INDUSTRY_CHOICES, inquirySchema, MARKETING_CONSENT_TEXT, SERVICE_CHOICES, type ServiceChoice } from '@/site/inquiry';
import { DEMOS } from '@/site/demos/catalog';

const SERVICE_PARAM: Record<string, ServiceChoice> = { automation: 'AUTOMATION', acquisition: 'ACQUISITION', websites: 'WEBSITES' };

type Fields = { name: string; company: string; email: string; phone: string; website: string; industry: string; service: ServiceChoice | ''; message: string };

export function InquiryForm({ fallbackEmail }: { fallbackEmail?: string | null }) {
  const params = useSearchParams();
  const [fields, setFields] = useState<Fields>({ name: '', company: '', email: '', phone: '', website: '', industry: '', service: '', message: '' });
  const [times, setTimes] = useState<string[]>([]);
  const [marketing, setMarketing] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [failure, setFailure] = useState('');
  const [days, setDays] = useState<SlotDay[]>([]);
  const [dayIndex, setDayIndex] = useState(0);
  const startedAt = useRef<number>(0);
  const statusRef = useRef<HTMLDivElement>(null);

  // Times depend on "now", so they are worked out in the browser only.
  useEffect(() => {
    startedAt.current = Date.now();
    setDays(consultationSlots(new Date()));
  }, []);

  useEffect(() => {
    const service = SERVICE_PARAM[params.get('service') ?? ''];
    const industry = params.get('industry');
    const demo = DEMOS.find((d) => d.slug === params.get('demo'));
    const pkg = params.get('package');
    setFields((f) => ({
      ...f,
      service: f.service || service || (demo ? 'AUTOMATION' : ''),
      industry: f.industry || (industry ? (INDUSTRY_CHOICES.find((c) => c.toLowerCase().startsWith(industry.toLowerCase().slice(0, 6))) ?? 'Other') : ''),
      message: f.message || (demo ? `I was looking at the "${demo.title}" demo. Something like it could help us with: ` : pkg ? `I'm interested in the ${pkg[0]!.toUpperCase()}${pkg.slice(1)} package. ` : ''),
    }));
  }, [params]);

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFields((f) => ({ ...f, [k]: e.target.value }));
    if (errors[k]) setErrors((e) => { const next = { ...e }; delete next[k]; return next; });
  };

  const toggleTime = (iso: string) => setTimes((t) => (t.includes(iso) ? t.filter((x) => x !== iso) : t.length >= 3 ? t : [...t, iso]));

  const payload = useMemo(() => ({
    ...fields,
    phone: fields.phone || undefined,
    website: fields.website || undefined,
    industry: fields.industry || undefined,
    service: fields.service || undefined,
    preferredTimes: times,
    marketingConsent: marketing,
    companyWebsite: honeypot || undefined,
    startedAt: startedAt.current || undefined,
    sourcePath: typeof window === 'undefined' ? undefined : window.location.pathname + window.location.search,
  }), [fields, times, marketing, honeypot]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = inquirySchema.safeParse(payload);
    if (!check.success) {
      const found: Record<string, string> = {};
      for (const issue of check.error.issues) found[String(issue.path[0])] ??= issue.path[0] === 'service' ? 'Choose what you are interested in' : issue.message;
      setErrors(found);
      const first = document.querySelector<HTMLElement>(`[name="${Object.keys(found)[0]}"]`);
      first?.focus();
      return;
    }
    setState('sending');
    try {
      const res = await fetch('/api/inquiries', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setState('sent'); setTimeout(() => statusRef.current?.focus(), 50); return; }
      if (res.status === 400 && data.fields) setErrors(data.fields);
      setFailure(data.error ?? 'Something went wrong. Please try again.');
      setState('error');
    } catch {
      setFailure('We could not reach the server. Check your connection and try again.');
      setState('error');
    }
  };

  if (state === 'sent') {
    const first = fields.name.trim().split(/\s+/)[0];
    return (
      <div ref={statusRef} tabIndex={-1} role="status" className="s-card p-7 sm:p-10 outline-none s-rise">
        <span className="grid size-12 place-items-center rounded-2xl bg-site-tide/15 text-[#0B7F71]"><Check className="size-6" /></span>
        <h2 className="s-h3 mt-6">Thank you{first ? `, ${first}` : ''}. Your inquiry is in.</h2>
        <p className="mt-3 text-[1rem] leading-relaxed text-site-fog">We will reply to <span className="text-site-night">{fields.email}</span> to {times.length ? 'confirm one of the times you suggested' : 'arrange a time to talk'}. There is nothing else you need to do.</p>
        {times.length > 0 && (
          <ul className="mt-5 space-y-1.5">{times.map((t) => <li key={t} className="flex items-center gap-2 text-[0.95rem]"><CalendarDays className="size-4 text-site-signal" />{formatSlot(t)}</li>)}</ul>
        )}
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/demos" className="s-btn-quiet">Explore the demos</Link>
          <Link href="/" className="s-btn-quiet">Back to the homepage</Link>
        </div>
      </div>
    );
  }

  const day = days[dayIndex];
  const err = (k: string) => errors[k] ? <p id={`${k}-error`} className="mt-1.5 text-[0.82rem] text-[#B4382A]">{errors[k]}</p> : null;
  const aria = (k: string) => ({ 'aria-invalid': Boolean(errors[k]) || undefined, 'aria-describedby': errors[k] ? `${k}-error` : undefined });

  return (
    <form onSubmit={submit} noValidate className="relative s-card p-6 sm:p-9">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block"><span className="text-[0.9rem] font-medium">Your name</span>
          <input name="name" autoComplete="name" value={fields.name} onChange={set('name')} className="s-field mt-2" {...aria('name')} />{err('name')}</label>
        <label className="block"><span className="text-[0.9rem] font-medium">Company</span>
          <input name="company" autoComplete="organization" value={fields.company} onChange={set('company')} placeholder="Or your name, if you are just starting" className="s-field mt-2" {...aria('company')} />{err('company')}</label>
        <label className="block"><span className="text-[0.9rem] font-medium">Business email</span>
          <input name="email" type="email" autoComplete="email" value={fields.email} onChange={set('email')} className="s-field mt-2" {...aria('email')} />{err('email')}</label>
        <label className="block"><span className="text-[0.9rem] font-medium">Phone <span className="text-site-fog font-normal">(optional)</span></span>
          <input name="phone" type="tel" autoComplete="tel" value={fields.phone} onChange={set('phone')} className="s-field mt-2" {...aria('phone')} />{err('phone')}</label>
        <label className="block"><span className="text-[0.9rem] font-medium">Industry</span>
          <select name="industry" value={fields.industry} onChange={set('industry')} className="s-field mt-2" {...aria('industry')}>
            <option value="">Choose one (optional)</option>
            {INDUSTRY_CHOICES.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>{err('industry')}</label>
        <label className="block"><span className="text-[0.9rem] font-medium">Website <span className="text-site-fog font-normal">(if you have one)</span></span>
          <input name="website" inputMode="url" autoComplete="url" value={fields.website} onChange={set('website')} placeholder="yourbusiness.ca" className="s-field mt-2" {...aria('website')} />{err('website')}</label>
      </div>

      <fieldset className="mt-7">
        <legend className="text-[0.9rem] font-medium">What are you interested in?</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {SERVICE_CHOICES.map((s) => (
            <label key={s.value} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 h-12 text-[0.92rem] transition-colors ${fields.service === s.value ? 'border-site-signal bg-site-signal/[0.06]' : 'border-site-rule bg-white hover:border-site-night/30'}`}>
              <input type="radio" name="service" value={s.value} checked={fields.service === s.value} onChange={set('service')} className="accent-site-signal" />
              {s.label}
            </label>
          ))}
        </div>
        {err('service')}
      </fieldset>

      <label className="mt-7 block"><span className="text-[0.9rem] font-medium">Tell us about the problem</span>
        <span className="block text-[0.84rem] text-site-fog mt-0.5">How things work today, what gets in the way, and what you would like to change.</span>
        <textarea name="message" rows={5} maxLength={4000} value={fields.message} onChange={set('message')} className="s-field mt-2 h-auto py-3 leading-relaxed" {...aria('message')} />{err('message')}</label>

      <fieldset className="mt-7 rounded-2xl border border-site-rule bg-site-paper/50 p-4 sm:p-5">
        <legend className="px-1 text-[0.9rem] font-medium">Suggest times for a free 30-minute consultation <span className="text-site-fog font-normal">(optional, up to 3)</span></legend>
        {days.length === 0 ? <p className="mt-2 text-[0.88rem] text-site-fog">Loading available times…</p> : (
          <>
            <div className="mt-3 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Day">
              {days.map((d, i) => (
                <button key={d.key} type="button" onClick={() => setDayIndex(i)} aria-pressed={i === dayIndex}
                  className={`shrink-0 rounded-full border px-3 h-8 text-[0.8rem] transition-colors ${i === dayIndex ? 'border-site-night bg-site-night text-site-paper' : 'border-site-rule bg-white'}`}>
                  {d.label}{d.slots.some((s) => times.includes(s.iso)) ? ' •' : ''}
                </button>
              ))}
            </div>
            {day && (
              <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={`Times on ${day.label}`}>
                {day.slots.map((s) => {
                  const on = times.includes(s.iso);
                  return (
                    <button key={s.iso} type="button" aria-pressed={on} onClick={() => toggleTime(s.iso)} disabled={!on && times.length >= 3}
                      className={`rounded-lg border px-3 h-9 text-[0.84rem] tabular transition-colors disabled:opacity-40 ${on ? 'border-site-signal bg-site-signal text-white' : 'border-site-rule bg-white hover:border-site-night/40'}`}>
                      {s.label}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="mt-3 text-[0.82rem] text-site-fog">{times.length ? `Selected: ${times.map(formatSlot).join(' · ')}` : 'Eastern Time. We confirm one of your times by email.'}</p>
            {err('preferredTimes')}
          </>
        )}
      </fieldset>

      {/* Hidden from people; bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label>Leave this field empty <input tabIndex={-1} autoComplete="off" name="leave_blank" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} /></label>
      </div>

      <label className="mt-6 flex items-start gap-3 text-[0.9rem] leading-snug cursor-pointer">
        <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-0.5 size-4 accent-site-signal" />
        <span>{MARKETING_CONSENT_TEXT} <span className="text-site-fog">(optional)</span></span>
      </label>
      <p className="mt-4 text-[0.82rem] leading-relaxed text-site-fog">
        We use what you send only to reply to this inquiry and follow up on it. See the <Link href="/privacy" className="s-link">privacy policy</Link>.
      </p>

      <div ref={statusRef} aria-live="polite">
        {state === 'error' && (
          <p className="mt-5 flex gap-2 rounded-xl bg-[#FF7A59]/10 px-4 py-3 text-[0.9rem] text-[#8A2E1C]">
            <CircleAlert className="size-4 shrink-0 mt-0.5" />
            <span>{failure}{fallbackEmail ? <> You can also email <a className="underline" href={`mailto:${fallbackEmail}`}>{fallbackEmail}</a>.</> : null}</span>
          </p>
        )}
      </div>

      <button type="submit" disabled={state === 'sending'} className="s-btn-primary mt-6 w-full sm:w-auto">
        {state === 'sending' ? <><Loader2 className="size-4 animate-spin" />Sending…</> : <>Send inquiry <ArrowRight className="size-4" /></>}
      </button>
    </form>
  );
}
