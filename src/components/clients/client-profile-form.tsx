'use client';

import { useState } from 'react';
import { Field, ListInput } from '@/components/ui/field';
import { ErrorNote } from '@/components/ui/states';

export interface ClientProfileValues {
  name: string;
  websiteUrl: string;
  description: string;
  productsServices: string[];
  serviceAreas: string[];
  industriesServed: string[];
  differentiators: string[];
  existingCustomers: string[];
  averageDealValue: string;
  currency: string;
  timezone: string;
  senderName: string;
  senderTitle: string;
  bookingUrl: string;
  mailingAddress: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone: string;
  status?: 'ONBOARDING' | 'ACTIVE' | 'PAUSED' | 'CHURNED';
  notes?: string;
}

type ClientLike = Partial<Record<keyof ClientProfileValues | 'averageDealValueCents', unknown>>;

export function profileValuesFrom(c: ClientLike | null | undefined, internal: boolean): ClientProfileValues {
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  const l = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
  return {
    name: s(c?.name), websiteUrl: s(c?.websiteUrl), description: s(c?.description),
    productsServices: l(c?.productsServices), serviceAreas: l(c?.serviceAreas), industriesServed: l(c?.industriesServed),
    differentiators: l(c?.differentiators), existingCustomers: l(c?.existingCustomers),
    averageDealValue: typeof c?.averageDealValueCents === 'number' ? String(c.averageDealValueCents / 100) : '',
    currency: s(c?.currency) || 'CAD', timezone: s(c?.timezone) || 'America/Toronto',
    senderName: s(c?.senderName), senderTitle: s(c?.senderTitle), bookingUrl: s(c?.bookingUrl), mailingAddress: s(c?.mailingAddress),
    primaryContactName: s(c?.primaryContactName), primaryContactEmail: s(c?.primaryContactEmail), primaryContactPhone: s(c?.primaryContactPhone),
    ...(internal ? { status: (c?.status as ClientProfileValues['status']) ?? 'ONBOARDING', notes: s(c?.notes) } : {}),
  };
}

/** Converts form values into the API's client profile input. */
export function profilePayload(v: ClientProfileValues) {
  const n = (s: string) => s.trim() || null;
  return {
    name: v.name.trim(),
    websiteUrl: n(v.websiteUrl),
    description: n(v.description),
    productsServices: v.productsServices,
    serviceAreas: v.serviceAreas,
    industriesServed: v.industriesServed,
    differentiators: v.differentiators,
    existingCustomers: v.existingCustomers,
    averageDealValueCents: v.averageDealValue ? Math.round(Number(v.averageDealValue) * 100) : null,
    currency: v.currency.toUpperCase(),
    timezone: v.timezone,
    senderName: n(v.senderName),
    senderTitle: n(v.senderTitle),
    bookingUrl: v.bookingUrl.trim(),
    mailingAddress: n(v.mailingAddress),
    primaryContactName: n(v.primaryContactName),
    primaryContactEmail: v.primaryContactEmail.trim(),
    primaryContactPhone: n(v.primaryContactPhone),
    ...(v.status ? { status: v.status } : {}),
    ...(v.notes !== undefined ? { notes: n(v.notes) } : {}),
  };
}

const TIMEZONES = [
  'America/St_Johns', 'America/Halifax', 'America/Toronto', 'America/Winnipeg', 'America/Regina', 'America/Edmonton',
  'America/Vancouver', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
];

/**
 * The client's business profile: what they sell, where, to whom, and who
 * signs the emails. This is what research and drafting are framed around,
 * so the hints say why each field matters.
 */
export function ClientProfileForm({ initial, internal, submitLabel, pending, error, onSubmit }: {
  initial: ClientProfileValues;
  internal: boolean;
  submitLabel: string;
  pending: boolean;
  error?: { message: string } | null;
  onSubmit: (values: ClientProfileValues) => void;
}) {
  const [v, setV] = useState(initial);
  const set = <K extends keyof ClientProfileValues>(k: K) => (value: ClientProfileValues[K]) => setV((s) => ({ ...s, [k]: value }));
  const text = (k: keyof ClientProfileValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));

  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); onSubmit(v); }}>
      <fieldset className="space-y-3">
        <legend className="eyebrow mb-2">The business</legend>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Company name">{(id) => <input id={id} required className="input" value={v.name} onChange={text('name')} />}</Field>
          <Field label="Website">{(id) => <input id={id} className="input" value={v.websiteUrl} onChange={text('websiteUrl')} placeholder="https://" />}</Field>
        </div>
        <Field label="What they do" hint="Two or three plain sentences. Research uses this to decide why a prospect might care.">
          {(id) => <textarea id={id} rows={3} className="input h-auto py-2" value={v.description} onChange={text('description')} />}
        </Field>
        <Field label="Products and services" hint="Press Enter after each.">{(id) => <ListInput id={id} value={v.productsServices} onChange={set('productsServices')} placeholder="Cross-border LTL, Dedicated lanes…" />}</Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Service areas">{(id) => <ListInput id={id} value={v.serviceAreas} onChange={set('serviceAreas')} placeholder="Ontario, Michigan…" />}</Field>
          <Field label="Industries they serve">{(id) => <ListInput id={id} value={v.industriesServed} onChange={set('industriesServed')} placeholder="Manufacturing…" />}</Field>
        </div>
        <Field label="Differentiators" hint="Only things that are true and that the client is happy to have repeated.">
          {(id) => <ListInput id={id} value={v.differentiators} onChange={set('differentiators')} placeholder="Own fleet, no brokering…" />}
        </Field>
        <Field label="Existing customers" hint="Names or websites. These companies are never added as prospects.">
          {(id) => <ListInput id={id} value={v.existingCustomers} onChange={set('existingCustomers')} max={500} />}
        </Field>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Average deal value">{(id) => <input id={id} type="number" min={0} className="input" value={v.averageDealValue} onChange={text('averageDealValue')} />}</Field>
          <Field label="Currency">{(id) => <input id={id} maxLength={3} className="input uppercase" value={v.currency} onChange={text('currency')} />}</Field>
          <Field label="Time zone" hint="Sending windows and call times use it.">
            {(id) => (
              <select id={id} className="input" value={v.timezone} onChange={text('timezone')}>
                {[...new Set([v.timezone, ...TIMEZONES])].map((tz) => <option key={tz} value={tz}>{tz.replace('America/', '').replace('_', ' ')}</option>)}
              </select>
            )}
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="eyebrow mb-2">Outreach identity</legend>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Emails signed by" hint="A real person at the client.">{(id) => <input id={id} className="input" value={v.senderName} onChange={text('senderName')} />}</Field>
          <Field label="Their title">{(id) => <input id={id} className="input" value={v.senderTitle} onChange={text('senderTitle')} />}</Field>
        </div>
        <Field label="Booking link" hint="Optional. Used when a prospect asks for a time.">{(id) => <input id={id} type="url" className="input" value={v.bookingUrl} onChange={text('bookingUrl')} />}</Field>
        <Field label="Mailing address" hint="Printed at the foot of every email, as Canada's anti-spam law (CASL) requires. Nothing is sent without it. A PO box or registered office is fine.">{(id) => <input id={id} className="input" value={v.mailingAddress} onChange={text('mailingAddress')} placeholder="123 Example St, Suite 400, Toronto, ON M5V 1A1" />}</Field>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="eyebrow mb-2">Primary contact at the client</legend>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Name">{(id) => <input id={id} className="input" value={v.primaryContactName} onChange={text('primaryContactName')} />}</Field>
          <Field label="Email">{(id) => <input id={id} type="email" className="input" value={v.primaryContactEmail} onChange={text('primaryContactEmail')} />}</Field>
          <Field label="Phone">{(id) => <input id={id} className="input" value={v.primaryContactPhone} onChange={text('primaryContactPhone')} />}</Field>
        </div>
      </fieldset>

      {internal && (
        <fieldset className="space-y-3">
          <legend className="eyebrow mb-2">Internal (not visible to the client)</legend>
          <Field label="Status">
            {(id) => (
              <select id={id} className="input sm:w-56" value={v.status} onChange={text('status')}>
                <option value="ONBOARDING">Onboarding</option>
                <option value="ACTIVE">Active</option>
                <option value="PAUSED">Paused</option>
                <option value="CHURNED">Churned</option>
              </select>
            )}
          </Field>
          <Field label="Notes">{(id) => <textarea id={id} rows={3} className="input h-auto py-2" value={v.notes} onChange={text('notes')} />}</Field>
        </fieldset>
      )}

      <ErrorNote error={error} />
      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={pending || !v.name.trim()}>{pending ? 'Saving…' : submitLabel}</button>
      </div>
    </form>
  );
}
