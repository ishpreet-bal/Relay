'use client';

import { X, ExternalLink } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useMemo } from 'react';

/**
 * Opens the exact page text a claim was drawn from, with the cited passage
 * highlighted. The reviewer verifies rather than trusts — which is only
 * possible because the crawl is stored, not discarded after generation.
 */
export function EvidenceDrawer({ accountId, pageId, quote, onClose }: {
  accountId: string; pageId: string; quote: string; onClose: () => void;
}) {
  const extract = trpc.research.extract.useQuery({ accountId, pageId });

  const highlighted = useMemo(() => {
    if (!extract.data) return null;
    const text = extract.data.text;
    const idx = text.toLowerCase().indexOf(quote.toLowerCase().slice(0, 60));
    if (idx === -1) return [{ text, match: false }];
    return [
      { text: text.slice(Math.max(0, idx - 700), idx), match: false },
      { text: text.slice(idx, idx + quote.length), match: true },
      { text: text.slice(idx + quote.length, idx + quote.length + 700), match: false },
    ];
  }, [extract.data, quote]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30 backdrop-blur-sm"
         role="dialog" aria-modal="true" aria-label="Source evidence" onClick={onClose}>
      <div className="w-full max-w-lg bg-surface border-l border-hairline flex flex-col animate-fade-up"
           onClick={(e) => e.stopPropagation()}>
        <div className="h-12 shrink-0 flex items-center gap-2 px-4 border-b border-hairline">
          <h2 className="text-sm font-semibold flex-1">Source text</h2>
          {extract.data && (
            <a href={extract.data.url} target="_blank" rel="noopener noreferrer"
               className="btn-ghost h-7 text-micro">
              Open page <ExternalLink className="size-3" />
            </a>
          )}
          <button type="button" onClick={onClose} className="btn-ghost size-7 p-0" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="p-4 border-b border-hairline">
          <p className="eyebrow mb-1.5">Cited passage</p>
          <blockquote className="text-micro border-l-2 border-accent pl-3 text-ink">“{quote}”</blockquote>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {extract.isPending && <p className="text-micro text-muted">Loading page text…</p>}
          {extract.isError && (
            <p className="text-micro text-blocked">
              The stored page text is no longer available. Re-run research to refresh it.
            </p>
          )}
          {highlighted && (
            <p className="text-[12px] leading-relaxed text-muted whitespace-pre-wrap">
              {highlighted.map((seg, i) =>
                seg.match
                  ? <mark key={i} className="bg-held/25 text-ink rounded px-0.5">{seg.text}</mark>
                  : <span key={i}>{seg.text}</span>,
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
