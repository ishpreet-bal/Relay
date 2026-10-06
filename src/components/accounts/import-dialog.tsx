'use client';

import { useState } from 'react';
import { Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useActiveClient } from '@/components/shell/active-client';
import { Dialog } from '@/components/ui/dialog';
import { ErrorNote } from '@/components/ui/states';
import { humanize } from '@/lib/domain';
import { cn } from '@/lib/utils';

type Step = 'upload' | 'map' | 'done';

const FIELD_LABELS: Record<string, string> = {
  companyName: 'Company name', websiteUrl: 'Website', linkedinUrl: 'Company LinkedIn', phone: 'Main phone',
  employeeCount: 'Employees', region: 'Province / state', contactFirstName: 'Contact first name',
  contactLastName: 'Contact last name', contactTitle: 'Contact title', contactEmail: 'Contact email',
  contactPhone: 'Contact phone', contactDirectPhone: 'Contact direct line', contactMobile: 'Contact mobile',
  contactLinkedin: 'Contact LinkedIn',
};

/**
 * Import is three explicit steps. The mapping screen is the important one:
 * the operator confirms which column is which before a row is written, and
 * sees real rows under the mapping they chose. Rows sharing a company are
 * merged into one account with several contacts.
 */
export function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { clientId: activeClientId, clients } = useActiveClient();
  const [clientId, setClientId] = useState(activeClientId ?? '');
  const [step, setStep] = useState<Step>('upload');
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [mapping, setMapping] = useState<Record<string, number>>({});

  const preview = trpc.accounts.previewImport.useMutation({
    onSuccess: (data) => { setMapping(data.mapping as Record<string, number>); setStep('map'); },
  });
  const run = trpc.accounts.runImport.useMutation({ onSuccess: () => { setStep('done'); onImported(); } });

  const handleFile = async (file: File) => {
    const text = await file.text();
    setFileName(file.name);
    setCsv(text);
    preview.mutate({ csv: text });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Import accounts" width="lg"
            description="One row per company or per contact. Rows with the same website (or name and city) become one account.">
      {step === 'upload' && (
        <div className="space-y-4">
          <label className="block">
            <span className="block text-[12px] font-medium mb-1.5">Import into client</span>
            <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Choose a client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className={cn('block border border-dashed border-hairline rounded-card p-10 text-center transition-colors',
            clientId ? 'cursor-pointer hover:border-accent hover:bg-raised' : 'opacity-50 cursor-not-allowed')}>
            <Upload className="size-6 mx-auto text-muted mb-3" strokeWidth={1.5} />
            <p className="text-sm font-medium mb-1">{preview.isPending ? 'Reading…' : 'Choose a CSV file'}</p>
            <p className="text-micro text-muted">A header row is required. The client&apos;s existing customers are skipped automatically.</p>
            <input type="file" accept=".csv,text/csv" className="sr-only" disabled={!clientId}
                   onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </label>
          <ErrorNote error={preview.error} />
        </div>
      )}

      {step === 'map' && preview.data && (
        <div className="space-y-4">
          <p className="text-micro text-muted">
            <span className="num">{preview.data.totalRows}</span> rows in {fileName}. Confirm which column feeds which field;
            anything left on &ldquo;Skip&rdquo; is ignored.
          </p>
          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
            {preview.data.fields.map((field) => (
              <label key={field} className="flex items-center gap-2 text-micro">
                <span className={cn('flex-1 truncate', field === 'companyName' && 'font-medium')}>
                  {FIELD_LABELS[field] ?? humanize(field)}
                  {field === 'companyName' && <span className="text-blocked"> *</span>}
                </span>
                <select className="input h-7 w-36 text-[11px]" value={mapping[field] ?? ''}
                        onChange={(e) => {
                          const next = { ...mapping };
                          if (e.target.value === '') delete next[field];
                          else next[field] = Number(e.target.value);
                          setMapping(next);
                        }}>
                  <option value="">Skip</option>
                  {preview.data!.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div>
            <p className="eyebrow mb-2">Preview</p>
            <div className="border border-hairline rounded-card overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-raised">
                  <tr>{preview.data.headers.map((h, i) => <th key={i} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.data.sample.map((row, i) => (
                    <tr key={i} className="border-t border-hairline">
                      {preview.data!.headers.map((_, j) => (
                        <td key={j} className="px-2 py-1.5 text-muted whitespace-nowrap max-w-[160px] truncate">{row[j] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <ErrorNote error={run.error} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setStep('upload')}>Back</button>
            <button type="button" className="btn-primary" disabled={mapping.companyName === undefined || run.isPending}
                    onClick={() => run.mutate({ clientId, csv, mapping })}>
              {run.isPending ? 'Importing…' : `Import ${preview.data.totalRows} rows`}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && run.data && (
        <div className="text-center py-4">
          <CheckCircle2 className="size-8 mx-auto text-cleared mb-3" strokeWidth={1.5} />
          <h3 className="font-display font-semibold mb-2">Import finished</h3>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-left mb-4">
            <Stat label="Accounts added" value={run.data.accountsCreated} />
            <Stat label="Matched existing" value={run.data.accountsMatched} />
            <Stat label="Contacts added" value={run.data.contactsCreated} />
            <Stat label="Duplicate contacts" value={run.data.contactsDuplicate} />
            <Stat label="Existing customers skipped" value={run.data.excluded} />
            <Stat label="Rows skipped" value={run.data.failed.length} />
          </dl>
          {run.data.failed.length > 0 && (
            <div className="text-left border border-hairline rounded-card p-3 max-h-40 overflow-y-auto mb-4">
              <p className="eyebrow mb-2 flex items-center gap-1.5"><AlertTriangle className="size-3 text-held" /> Skipped rows</p>
              <ul className="space-y-1">
                {run.data.failed.map((f) => (
                  <li key={f.row} className="text-[11px] text-muted"><span className="num">Row {f.row}</span> — {f.reason}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-micro text-muted mb-4">New accounts are scored now; research runs when you queue it.</p>
          <button type="button" className="btn-primary" onClick={onClose}>Done</button>
        </div>
      )}
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-raised px-3 py-2">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="num text-[15px]">{value}</dd>
    </div>
  );
}
