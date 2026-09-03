'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Check, X, RefreshCw, Pencil, AlertTriangle, ShieldAlert, ExternalLink, Loader2,
} from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { TierBadge } from './tier-badge';

interface Finding { severity: 'block' | 'warn'; rule: string; message: string; excerpt: string }
interface Fact { claim: string; statement: string; sourceUrl: string; factId: string }

export function DraftCard({ message, canApprove, canSend, onDone }: {
  message: any; canApprove: boolean; canSend: boolean; onDone: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(message.subject ?? '');
  const [body, setBody] = useState(message.bodyText ?? '');

  const utils = trpc.useUtils();
  const invalidate = () => { utils.messages.reviewQueue.invalidate(); utils.messages.queueSummary.invalidate(); onDone(); };

  const edit = trpc.messages.edit.useMutation({ onSuccess: () => { setEditing(false); invalidate(); } });
  const approve = trpc.messages.approve.useMutation({ onSuccess: invalidate });
  const reject = trpc.messages.reject.useMutation({ onSuccess: invalidate });
  const send = trpc.messages.send.useMutation({ onSuccess: invalidate });

  const findings = (message.lintFindings ?? []) as Finding[];
  const facts = (message.personalizationFacts ?? []) as Fact[];
  const blockers = findings.filter((f) => f.severity === 'block');
  const warnings = findings.filter((f) => f.severity === 'warn');
  const busy = edit.isPending || approve.isPending || reject.isPending || send.isPending;

  return (
    <article className="card overflow-hidden">
      <header className="flex items-center gap-2.5 px-4 h-11 border-b border-hairline bg-raised/50">
        <Link href={`/leads/${message.lead.id}`} className="text-[13px] font-medium hover:text-accent truncate">
          {message.lead.companyName}
        </Link>
        <TierBadge tier={message.personalizationTier} />
        {message.editedByHuman && <span className="eyebrow">edited</span>}
        <div className="flex-1" />
        <span className="num text-[11px] text-muted">score {message.lead.score}</span>
        <span className="text-[11px] text-muted capitalize truncate max-w-[120px]">
          {[message.lead.industry, message.lead.city].filter(Boolean).join(' · ') || '—'}
        </span>
      </header>

      {blockers.length > 0 && (
        <div className="px-4 py-2.5 bg-blocked/8 border-b border-hairline">
          <p className="text-[11px] font-medium text-blocked flex items-center gap-1.5 mb-1.5">
            <ShieldAlert className="size-3.5" />
            Must be fixed before this can be approved
          </p>
          <ul className="space-y-1">
            {blockers.map((f, i) => (
              <li key={i} className="text-[11px] text-muted">
                <span className="text-ink">{f.message}</span>
                {f.excerpt && <span className="block opacity-70 italic">…{f.excerpt}…</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="p-4">
        {editing ? (
          <div className="space-y-2">
            <input className="input font-medium" value={subject} onChange={(e) => setSubject(e.target.value)}
                   aria-label="Subject" />
            <textarea className="input h-auto py-2 resize-y leading-relaxed" rows={10} value={body}
                      onChange={(e) => setBody(e.target.value)} aria-label="Email body" />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost h-8 text-micro" onClick={() => setEditing(false)}>Cancel</button>
              <button type="button" className="btn-primary h-8 text-micro" disabled={busy}
                      onClick={() => edit.mutate({ id: message.id, subject, bodyText: body })}>
                {edit.isPending ? 'Saving…' : 'Save and re-check'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-[13px] font-medium mb-2">{message.subject}</p>
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-muted">{message.bodyText}</p>
          </>
        )}
      </div>

      {/* Claim provenance. Each specific statement in the email is shown next to
          the research fact and source URL it came from, so approval is
          verification rather than trust. */}
      {facts.length > 0 && !editing && (
        <details className="px-4 pb-3">
          <summary className="eyebrow cursor-pointer">
            What this email claims <span className="num">({facts.length})</span>
          </summary>
          <ul className="mt-2 space-y-2">
            {facts.map((f, i) => (
              <li key={i} className="text-[11px] border-l-2 border-hairline pl-2.5">
                <p className="text-ink">“{f.claim}”</p>
                <p className="text-muted mt-0.5">{f.statement}</p>
                {f.sourceUrl.startsWith('http') && (
                  <a href={f.sourceUrl} target="_blank" rel="noopener noreferrer"
                     className="inline-flex items-center gap-1 text-accent hover:underline mt-0.5">
                    source <ExternalLink className="size-2.5" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {warnings.length > 0 && !editing && (
        <details className="px-4 pb-3">
          <summary className="text-[11px] cursor-pointer text-held flex items-center gap-1.5">
            <AlertTriangle className="size-3" /> {warnings.length} suggestion{warnings.length > 1 ? 's' : ''}
          </summary>
          <ul className="mt-1.5 space-y-1">
            {warnings.map((f, i) => (
              <li key={i} className="text-[11px] text-muted">{f.message}</li>
            ))}
          </ul>
        </details>
      )}

      {!editing && (
        <footer className="flex items-center gap-2 px-4 h-12 border-t border-hairline bg-raised/30">
          <button type="button" className="btn-ghost h-8 text-micro" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" /> Edit
          </button>
          <button type="button" className="btn-ghost h-8 text-micro" disabled={busy}
                  onClick={() => reject.mutate({ id: message.id, reason: 'Rejected in review' })}>
            <X className="size-3.5" /> Reject
          </button>
          <div className="flex-1" />
          {canApprove && (
            <button type="button" className="btn-outline h-8 text-micro"
                    disabled={busy || blockers.length > 0}
                    title={blockers.length ? 'Resolve the blockers first' : undefined}
                    onClick={() => approve.mutate({ id: message.id })}>
              <Check className="size-3.5" /> Approve
            </button>
          )}
          {canSend && (
            <button type="button" className="btn-primary h-8 text-micro"
                    disabled={busy || blockers.length > 0}
                    onClick={() => send.mutate({ id: message.id })}>
              {send.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Approve and send
            </button>
          )}
        </footer>
      )}

      {send.data && !send.data.sent && (
        <p className="px-4 py-2 text-[11px] text-held border-t border-hairline">
          Held by the send gate: {'reason' in send.data.verdict ? send.data.verdict.reason : 'blocked'}
        </p>
      )}
      {(send.error || approve.error || edit.error) && (
        <p className="px-4 py-2 text-[11px] text-blocked border-t border-hairline">
          {send.error?.message ?? approve.error?.message ?? edit.error?.message}
        </p>
      )}
    </article>
  );
}
