'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { useActiveClient } from '@/components/shell/active-client';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { ErrorNote } from '@/components/ui/states';

const EMPTY = {
  name: '', websiteUrl: '', industry: '', city: '', region: '', country: 'CA', phone: '', employeeCount: '',
  firstName: '', lastName: '', title: '', email: '', contactPhone: '',
};

/** Add one account by hand, optionally with its first contact. */
export function AccountFormDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { clientId: activeClientId, clients } = useActiveClient();
  const [clientId, setClientId] = useState(activeClientId ?? '');
  const [f, setF] = useState(EMPTY);
  const [notice, setNotice] = useState<string | null>(null);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  const create = trpc.accounts.create.useMutation({
    onSuccess: (r) => {
      if (r.status === 'excluded') { setNotice(`Not added: ${r.reason.toLowerCase()}.`); return; }
      if (r.status === 'duplicate') { setNotice('This client already has that account — opening it.'); }
      router.push(`/accounts/${r.accountId}`);
      onClose();
    },
  });

  const hasContact = f.firstName || f.lastName || f.email || f.contactPhone;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    create.mutate({
      clientId,
      name: f.name,
      websiteUrl: f.websiteUrl || null,
      industry: f.industry || null,
      city: f.city || null,
      region: f.region || null,
      country: f.country || null,
      phone: f.phone || null,
      employeeCount: f.employeeCount ? Number(f.employeeCount) : null,
      source: 'MANUAL',
      contacts: hasContact ? [{
        firstName: f.firstName || null, lastName: f.lastName || null, title: f.title || null,
        email: f.email || null, directPhone: f.contactPhone || null, source: 'MANUAL',
      }] : [],
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Add an account" width="lg">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Client">
          {(id) => (
            <select id={id} required className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Choose a client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Company name">{(id) => <input id={id} required className="input" value={f.name} onChange={set('name')} />}</Field>
          <Field label="Website" hint="Used to dedupe and for research.">{(id) => <input id={id} className="input" placeholder="example.com" value={f.websiteUrl} onChange={set('websiteUrl')} />}</Field>
          <Field label="Industry">{(id) => <input id={id} className="input" value={f.industry} onChange={set('industry')} />}</Field>
          <Field label="Employees">{(id) => <input id={id} type="number" min={0} className="input" value={f.employeeCount} onChange={set('employeeCount')} />}</Field>
          <Field label="City">{(id) => <input id={id} className="input" value={f.city} onChange={set('city')} />}</Field>
          <Field label="Province / state">{(id) => <input id={id} className="input" value={f.region} onChange={set('region')} />}</Field>
          <Field label="Country">{(id) => <input id={id} className="input" value={f.country} onChange={set('country')} />}</Field>
          <Field label="Main phone">{(id) => <input id={id} className="input" value={f.phone} onChange={set('phone')} />}</Field>
        </div>

        <fieldset className="border-t border-hairline pt-4">
          <legend className="eyebrow pr-2">First contact (optional)</legend>
          <div className="grid sm:grid-cols-2 gap-3 mt-2">
            <Field label="First name">{(id) => <input id={id} className="input" value={f.firstName} onChange={set('firstName')} />}</Field>
            <Field label="Last name">{(id) => <input id={id} className="input" value={f.lastName} onChange={set('lastName')} />}</Field>
            <Field label="Title">{(id) => <input id={id} className="input" value={f.title} onChange={set('title')} />}</Field>
            <Field label="Email">{(id) => <input id={id} type="email" className="input" value={f.email} onChange={set('email')} />}</Field>
            <Field label="Direct phone">{(id) => <input id={id} className="input" value={f.contactPhone} onChange={set('contactPhone')} />}</Field>
          </div>
        </fieldset>

        {notice && <p className="text-[12px] text-held">{notice}</p>}
        <ErrorNote error={create.error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!clientId || !f.name.trim() || create.isPending}>
            {create.isPending ? 'Adding…' : 'Add account'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
