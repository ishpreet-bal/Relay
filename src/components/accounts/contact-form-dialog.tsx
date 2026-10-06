'use client';

import { useState } from 'react';
import type { Seniority } from '@prisma/client';
import { trpc } from '@/lib/trpc/client';
import { SENIORITIES, SENIORITY_LABELS } from '@/lib/domain';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { ErrorNote } from '@/components/ui/states';

export interface ContactFormValues {
  firstName: string; lastName: string; title: string; department: string; seniority: Seniority | '';
  isDecisionMaker: boolean; email: string; directPhone: string; mobilePhone: string; phone: string; linkedinUrl: string;
}

const EMPTY: ContactFormValues = {
  firstName: '', lastName: '', title: '', department: '', seniority: '', isDecisionMaker: false,
  email: '', directPhone: '', mobilePhone: '', phone: '', linkedinUrl: '',
};

/** Create a contact on an account, or edit an existing one. */
export function ContactFormDialog({ accountId, contact, onClose }: {
  accountId: string;
  contact?: { id: string } & Partial<Record<keyof ContactFormValues, string | boolean | null>>;
  onClose: () => void;
}) {
  const [f, setF] = useState<ContactFormValues>(() => {
    if (!contact) return EMPTY;
    const out = { ...EMPTY };
    for (const k of Object.keys(EMPTY) as Array<keyof ContactFormValues>) {
      const v = contact[k];
      if (v !== null && v !== undefined) (out as Record<string, unknown>)[k] = v;
    }
    return out;
  });
  const [duplicate, setDuplicate] = useState(false);
  const utils = trpc.useUtils();
  const done = () => { utils.accounts.byId.invalidate({ id: accountId }); utils.contacts.invalidate(); onClose(); };
  const create = trpc.contacts.create.useMutation({ onSuccess: (r) => (r.duplicate ? setDuplicate(true) : done()) });
  const update = trpc.contacts.update.useMutation({ onSuccess: done });
  const set = (k: keyof ContactFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      firstName: f.firstName || null, lastName: f.lastName || null, title: f.title || null, department: f.department || null,
      seniority: f.seniority || undefined, isDecisionMaker: f.isDecisionMaker, email: f.email || null,
      directPhone: f.directPhone || null, mobilePhone: f.mobilePhone || null, phone: f.phone || null, linkedinUrl: f.linkedinUrl || null,
    };
    if (contact) update.mutate({ id: contact.id, data });
    else create.mutate({ accountId, data: { ...data, source: 'MANUAL' } });
  };
  const pending = create.isPending || update.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={contact ? 'Edit contact' : 'Add a contact'} width="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="First name">{(id) => <input id={id} className="input" value={f.firstName} onChange={set('firstName')} />}</Field>
          <Field label="Last name">{(id) => <input id={id} className="input" value={f.lastName} onChange={set('lastName')} />}</Field>
          <Field label="Title">{(id) => <input id={id} className="input" value={f.title} onChange={set('title')} placeholder="e.g. Logistics Manager" />}</Field>
          <Field label="Department">{(id) => <input id={id} className="input" value={f.department} onChange={set('department')} placeholder="Inferred from title if blank" />}</Field>
          <Field label="Seniority" hint="Inferred from the title if left blank.">
            {(id) => (
              <select id={id} className="input" value={f.seniority} onChange={set('seniority')}>
                <option value="">Infer from title</option>
                {SENIORITIES.map((s) => <option key={s} value={s}>{SENIORITY_LABELS[s]}</option>)}
              </select>
            )}
          </Field>
          <label className="flex items-center gap-2 text-[13px] sm:mt-6">
            <input type="checkbox" checked={f.isDecisionMaker} onChange={(e) => setF((s) => ({ ...s, isDecisionMaker: e.target.checked }))} />
            Decision maker for this purchase
          </label>
          <Field label="Email">{(id) => <input id={id} type="email" className="input" value={f.email} onChange={set('email')} />}</Field>
          <Field label="Direct line">{(id) => <input id={id} className="input" value={f.directPhone} onChange={set('directPhone')} />}</Field>
          <Field label="Mobile">{(id) => <input id={id} className="input" value={f.mobilePhone} onChange={set('mobilePhone')} />}</Field>
          <Field label="Other phone">{(id) => <input id={id} className="input" value={f.phone} onChange={set('phone')} />}</Field>
          <Field label="LinkedIn" className="sm:col-span-2">{(id) => <input id={id} className="input" value={f.linkedinUrl} onChange={set('linkedinUrl')} />}</Field>
        </div>
        {duplicate && <p className="text-[12px] text-held">A contact with that email already exists on this account.</p>}
        <ErrorNote error={create.error ?? update.error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={pending || !(f.firstName || f.lastName || f.email)}>
            {pending ? 'Saving…' : contact ? 'Save' : 'Add contact'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
