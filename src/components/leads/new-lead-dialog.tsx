'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, AlertTriangle } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';

/**
 * Manual single-lead entry. Company name is the only hard requirement; a
 * website matters most in practice, because research reads the site and a lead
 * without one can never produce a verified draft.
 */
export function NewLeadDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const router = useRouter();
  const [companyName, setCompanyName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [industry, setIndustry] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');

  const [duplicate, setDuplicate] = useState<string | null>(null);

  const create = trpc.leads.create.useMutation({
    onSuccess: ({ lead, duplicate: isDupe }) => {
      if (isDupe) {
        setDuplicate(lead.id);
        return;
      }
      onCreated();
      router.push(`/leads/${lead.id}`);
    },
  });

  const normalizedUrl = (() => {
    const raw = websiteUrl.trim();
    if (!raw) return null;
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  })();

  const valid = companyName.trim().length > 0;

  function submit() {
    if (!valid) return;
    setDuplicate(null);
    const hasContact = Boolean(firstName.trim() || lastName.trim() || email.trim() || title.trim());
    create.mutate({
      companyName: companyName.trim(),
      websiteUrl: normalizedUrl,
      industry: industry.trim() || null,
      city: city.trim() || null,
      region: region.trim() || null,
      phone: phone.trim() || null,
      notes: notes.trim() || null,
      country: 'CA',
      techStack: [],
      tags: [],
      source: 'MANUAL',
      ...(hasContact
        ? {
            contact: {
              firstName: firstName.trim() || null,
              lastName: lastName.trim() || null,
              title: title.trim() || null,
              email: email.trim() || null,
              role: 'OTHER' as const,
            },
          }
        : {}),
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 backdrop-blur-sm p-4"
         role="dialog" aria-modal="true" aria-label="Add a lead">
      <div className="card w-full max-w-lg max-h-[85vh] flex flex-col animate-fade-up">
        <div className="h-12 shrink-0 flex items-center px-4 border-b border-hairline">
          <h2 className="text-sm font-semibold flex-1">Add a lead</h2>
          <button type="button" onClick={onClose} className="btn-ghost size-7 p-0" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <form
          className="flex-1 overflow-y-auto p-5 space-y-4"
          onSubmit={(e) => { e.preventDefault(); submit(); }}
        >
          <div>
            <label htmlFor="companyName" className="eyebrow block mb-1">Company name *</label>
            <input id="companyName" className="input" autoFocus required maxLength={200}
                   placeholder="Riverside Dental" value={companyName}
                   onChange={(e) => setCompanyName(e.target.value)} />
          </div>

          <div>
            <label htmlFor="websiteUrl" className="eyebrow block mb-1">Website</label>
            <input id="websiteUrl" className="input" maxLength={300}
                   placeholder="riversidedental.ca" value={websiteUrl}
                   onChange={(e) => setWebsiteUrl(e.target.value)} />
            <p className="text-[11px] text-muted mt-1">
              Research reads this site. Without it, drafts can only speak to the industry.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="industry" className="eyebrow block mb-1">Industry</label>
              <input id="industry" className="input" maxLength={80} placeholder="Dental"
                     value={industry} onChange={(e) => setIndustry(e.target.value)} />
            </div>
            <div>
              <label htmlFor="phone" className="eyebrow block mb-1">Phone</label>
              <input id="phone" className="input" maxLength={40} placeholder="(613) 555-0134"
                     value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label htmlFor="city" className="eyebrow block mb-1">City</label>
              <input id="city" className="input" maxLength={80} placeholder="Ottawa"
                     value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div>
              <label htmlFor="region" className="eyebrow block mb-1">Province / state</label>
              <input id="region" className="input" maxLength={80} placeholder="ON"
                     value={region} onChange={(e) => setRegion(e.target.value)} />
            </div>
          </div>

          <fieldset className="border-t border-hairline pt-4">
            <legend className="sr-only">Primary contact</legend>
            <p className="eyebrow mb-2">Primary contact (optional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="firstName" className="eyebrow block mb-1">First name</label>
                <input id="firstName" className="input" maxLength={80} value={firstName}
                       onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div>
                <label htmlFor="lastName" className="eyebrow block mb-1">Last name</label>
                <input id="lastName" className="input" maxLength={80} value={lastName}
                       onChange={(e) => setLastName(e.target.value)} />
              </div>
              <div>
                <label htmlFor="title" className="eyebrow block mb-1">Title</label>
                <input id="title" className="input" maxLength={120} placeholder="Owner"
                       value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <label htmlFor="email" className="eyebrow block mb-1">Email</label>
                <input id="email" type="email" className="input" placeholder="name@company.com"
                       value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <p className="text-[11px] text-muted mt-2">
              A contact with an email is required before this lead can be drafted to.
            </p>
          </fieldset>

          <div>
            <label htmlFor="notes" className="eyebrow block mb-1">Notes</label>
            <textarea id="notes" className="input h-auto py-2 resize-y" rows={2} maxLength={5000}
                      value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {duplicate && (
            <p className="text-[11px] text-held flex items-start gap-1.5">
              <AlertTriangle className="size-3 mt-0.5 shrink-0" />
              This company is already in your pipeline.{' '}
              <button type="button" className="text-accent hover:underline"
                      onClick={() => router.push(`/leads/${duplicate}`)}>
                Open the existing lead
              </button>
            </p>
          )}
          {create.error && (
            <p className="text-[11px] text-blocked">{create.error.message}</p>
          )}
        </form>

        <div className="h-14 shrink-0 flex items-center justify-end gap-2 px-4 border-t border-hairline">
          <button type="button" className="btn-ghost h-8 text-micro" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary h-8 text-micro"
                  disabled={!valid || create.isPending} onClick={submit}>
            {create.isPending ? 'Adding…' : 'Add lead'}
          </button>
        </div>
      </div>
    </div>
  );
}
