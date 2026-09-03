'use client';

import { useState } from 'react';
import { Upload, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

type Step = 'upload' | 'map' | 'done';

/**
 * Import is three explicit steps. The mapping screen is the important one: the
 * operator confirms which column is which before a single row is written, and
 * sees five real rows rendered under the mapping they chose.
 */
export function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [step, setStep] = useState<Step>('upload');
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [mapping, setMapping] = useState<Record<string, number>>({});

  const preview = trpc.leads.previewImport.useMutation({
    onSuccess: (data) => {
      setMapping(data.mapping as Record<string, number>);
      setStep('map');
    },
  });
  const run = trpc.leads.runImport.useMutation({ onSuccess: () => setStep('done') });

  const handleFile = async (file: File) => {
    const text = await file.text();
    setFileName(file.name);
    setCsv(text);
    preview.mutate({ csv: text });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 backdrop-blur-sm p-4"
         role="dialog" aria-modal="true" aria-label="Import leads">
      <div className="card w-full max-w-2xl max-h-[85vh] flex flex-col animate-fade-up">
        <div className="h-12 shrink-0 flex items-center px-4 border-b border-hairline">
          <h2 className="text-sm font-semibold flex-1">Import leads from CSV</h2>
          <button type="button" onClick={onClose} className="btn-ghost size-7 p-0" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {step === 'upload' && (
            <label className="block border border-dashed border-hairline rounded-card p-10 text-center cursor-pointer hover:border-accent hover:bg-raised transition-colors">
              <Upload className="size-6 mx-auto text-muted mb-3" strokeWidth={1.5} />
              <p className="text-sm font-medium mb-1">Choose a CSV file</p>
              <p className="text-micro text-muted">
                One row per company. A header row is required.
              </p>
              <input
                type="file" accept=".csv,text/csv" className="sr-only"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </label>
          )}

          {step === 'map' && preview.data && (
            <div className="space-y-4">
              <p className="text-micro text-muted">
                <span className="num">{preview.data.totalRows}</span> rows in {fileName}. Confirm which
                column feeds which field — anything set to “Skip” is ignored.
              </p>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {preview.data.fields.map((field) => (
                  <label key={field} className="flex items-center gap-2 text-micro">
                    <span className={cn('flex-1 truncate', field === 'companyName' && 'font-medium')}>
                      {field.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}
                      {field === 'companyName' && <span className="text-blocked"> *</span>}
                    </span>
                    <select
                      className="input h-7 w-32 text-[11px]"
                      value={mapping[field] ?? ''}
                      onChange={(e) => {
                        const next = { ...mapping };
                        if (e.target.value === '') delete next[field];
                        else next[field] = Number(e.target.value);
                        setMapping(next);
                      }}
                    >
                      <option value="">Skip</option>
                      {preview.data!.headers.map((h, i) => (
                        <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              <div>
                <p className="eyebrow mb-2">Preview</p>
                <div className="border border-hairline rounded-card overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead className="bg-raised">
                      <tr>
                        {preview.data.headers.map((h, i) => (
                          <th key={i} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.data.sample.map((row, i) => (
                        <tr key={i} className="border-t border-hairline">
                          {preview.data!.headers.map((_, j) => (
                            <td key={j} className="px-2 py-1.5 text-muted whitespace-nowrap max-w-[160px] truncate">
                              {row[j] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {step === 'done' && run.data && (
            <div className="text-center py-6">
              <CheckCircle2 className="size-8 mx-auto text-cleared mb-3" strokeWidth={1.5} />
              <h3 className="font-display font-semibold mb-1">Import finished</h3>
              <p className="text-sm text-muted mb-4">
                <span className="num">{run.data.created}</span> added,{' '}
                <span className="num">{run.data.duplicates}</span> already in your pipeline
                {run.data.failed.length > 0 && (
                  <>, <span className="num text-blocked">{run.data.failed.length}</span> skipped</>
                )}.
              </p>
              {run.data.failed.length > 0 && (
                <div className="text-left border border-hairline rounded-card p-3 max-h-40 overflow-y-auto">
                  <p className="eyebrow mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="size-3 text-held" /> Skipped rows
                  </p>
                  <ul className="space-y-1">
                    {run.data.failed.map((f) => (
                      <li key={f.row} className="text-[11px] text-muted">
                        <span className="num">Row {f.row}</span> — {f.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="h-13 shrink-0 flex items-center justify-end gap-2 px-4 py-3 border-t border-hairline">
          {step === 'map' && (
            <>
              <button type="button" className="btn-ghost" onClick={() => setStep('upload')}>Back</button>
              <button
                type="button" className="btn-primary"
                disabled={mapping.companyName === undefined || run.isPending}
                onClick={() => run.mutate({ csv, mapping })}
              >
                {run.isPending ? 'Importing…' : `Import ${preview.data?.totalRows ?? 0} rows`}
              </button>
            </>
          )}
          {step === 'done' && (
            <button type="button" className="btn-primary" onClick={() => { onImported(); onClose(); }}>
              View leads
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
