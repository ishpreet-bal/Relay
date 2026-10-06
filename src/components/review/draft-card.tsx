'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, CheckCircle2, CircleDashed, Clock, ExternalLink, Loader2, Pencil, RefreshCw, ShieldAlert, X, XCircle } from 'lucide-react';
import type { ClaimStatus } from '@prisma/client';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/types';
import { CLAIM_STATUS_LABELS, CLAIM_TYPE_LABELS, personName } from '@/lib/domain';
import { VerificationBadge } from '@/components/domain/pills';
import { Pill } from '@/components/ui/pill';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { TierBadge } from './tier-badge';

interface Finding { severity: 'block' | 'warn'; rule: string; message: string; excerpt: string }
type Draft = RouterOutputs['messages']['reviewQueue']['items'][number];

const CLAIM_ICON: Record<ClaimStatus, typeof CheckCircle2> = {
  SUPPORTED: CheckCircle2, PARTIALLY_SUPPORTED: CircleDashed, UNSUPPORTED: XCircle, CONTRADICTED: XCircle, STALE: Clock, NOT_REQUIRED: CheckCircle2,
};
const CLAIM_TONE: Record<ClaimStatus, string> = {
  SUPPORTED: 'text-cleared', PARTIALLY_SUPPORTED: 'text-held', UNSUPPORTED: 'text-blocked', CONTRADICTED: 'text-blocked', STALE: 'text-held', NOT_REQUIRED: 'text-muted',
};

/**
 * One draft and everything needed to decide on it: who it is for, what it
 * claims, the evidence behind each claim, and why it is here rather than
 * sent automatically. Approval of unverified claims is possible, but only
 * with a note saying how they were checked — and that is audited.
 */
export function DraftCard({ message, canApprove, canSend, onDone }: { message: Draft; canApprove: boolean; canSend: boolean; onDone: () => void }) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(message.subject ?? '');
  const [body, setBody] = useState(message.bodyText ?? '');
  const [override, setOverride] = useState<'approve' | 'send' | null>(null);

  const utils = trpc.useUtils();
  const invalidate = () => { utils.messages.reviewQueue.invalidate(); utils.messages.queueSummary.invalidate(); onDone(); };
  const edit = trpc.messages.edit.useMutation({ onSuccess: () => { setEditing(false); invalidate(); } });
  const approve = trpc.messages.approve.useMutation({ onSuccess: invalidate });
  const reject = trpc.messages.reject.useMutation({ onSuccess: invalidate });
  const send = trpc.messages.send.useMutation({ onSuccess: (r) => { if (r.sent) invalidate(); } });
  const regenerate = trpc.messages.regenerate.useMutation({ onSuccess: invalidate });

  const findings = (message.lintFindings ?? []) as unknown as Finding[];
  const blockers = findings.filter((f) => f.severity === 'block');
  const warnings = findings.filter((f) => f.severity === 'warn');
  const needsOverride = message.verificationStatus === 'UNSUPPORTED' || message.verificationStatus === 'BLOCKED';
  const factual = message.claims.filter((c) => c.kind !== 'GENERAL_COPY' && c.status !== 'NOT_REQUIRED');
  const busy = edit.isPending || approve.isPending || reject.isPending || send.isPending || regenerate.isPending;
  const why = reasonInReview(message);

  return (
    <article className="card overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-hairline bg-raised/50">
        <Link href={`/accounts/${message.account.id}`} className="text-[13px] font-medium hover:text-accent truncate">{message.account.name}</Link>
        {message.contact && (
          <Link href={`/contacts/${message.contact.id}`} className="text-[12px] text-muted hover:text-accent truncate">
            → {personName(message.contact)}{message.contact.title && `, ${message.contact.title}`}
          </Link>
        )}
        <span className="flex-1" />
        <TierBadge tier={message.personalizationTier} />
        <VerificationBadge status={message.verificationStatus} score={message.verificationScore} />
      </header>
      <p className="px-4 pt-2 text-[11px] text-muted">
        {message.client.name}{message.campaign && <> · {message.campaign.name}</>}{message.stepOrder !== null && <> · step {message.stepOrder + 1}</>}
        {message.angle && <> · angle: {message.angle}</>}
        {why && <> · <span className="text-held">{why}</span></>}
      </p>

      {blockers.length > 0 && (
        <div className="mx-4 mt-2 px-3 py-2 rounded-md bg-blocked/8">
          <p className="text-[11px] font-medium text-blocked flex items-center gap-1.5 mb-1"><ShieldAlert className="size-3.5" /> Must be edited before approval</p>
          <ul className="space-y-0.5">
            {blockers.map((f, i) => <li key={i} className="text-[11px] text-ink">{f.message}{f.excerpt && <span className="block text-muted italic">…{f.excerpt}…</span>}</li>)}
          </ul>
        </div>
      )}

      <div className="p-4">
        {editing ? (
          <div className="space-y-2">
            <input className="input font-medium" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" />
            <textarea className="input h-auto py-2 resize-y leading-relaxed" rows={10} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Email body" />
            <p className="text-[11px] text-muted">Saving re-checks every claim against the same evidence.</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost h-8 text-micro" onClick={() => setEditing(false)}>Cancel</button>
              <button type="button" className="btn-primary h-8 text-micro" disabled={busy} onClick={() => edit.mutate({ id: message.id, subject, bodyText: body })}>
                {edit.isPending ? 'Checking…' : 'Save and re-check'}
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

      {!editing && factual.length > 0 && (
        <div className="px-4 pb-3">
          <p className="eyebrow mb-1.5">Claims and evidence <span className="num">({factual.length})</span></p>
          <ul className="space-y-1.5">
            {factual.map((c) => {
              const Icon = CLAIM_ICON[c.status];
              return (
                <li key={c.id} className="text-[12px] flex items-start gap-2">
                  <Icon className={cn('size-3.5 shrink-0 mt-0.5', CLAIM_TONE[c.status])} />
                  <div className="flex-1 min-w-0">
                    <p className="text-ink">“{c.text}”</p>
                    <p className="text-[11px] text-muted">
                      {CLAIM_STATUS_LABELS[c.status]}
                      {c.claimType && <> · {CLAIM_TYPE_LABELS[c.claimType]}{!c.approvedType && <span className="text-held"> (not approved for automatic sending)</span>}</>}
                      {c.reason && <> · {c.reason}</>}
                    </p>
                    {c.sourceQuote && <p className="text-[11px] text-muted italic border-l-2 border-hairline pl-2 mt-0.5 line-clamp-2">“{c.sourceQuote}”</p>}
                    {c.sourceUrl?.startsWith('http') && (
                      <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[11px] text-accent hover:underline">source <ExternalLink className="size-2.5" /></a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!editing && warnings.length > 0 && (
        <details className="px-4 pb-3">
          <summary className="text-[11px] cursor-pointer text-held inline-flex items-center gap-1.5"><AlertTriangle className="size-3" /> {warnings.length} suggestion{warnings.length > 1 ? 's' : ''}</summary>
          <ul className="mt-1.5 space-y-1">{warnings.map((f, i) => <li key={i} className="text-[11px] text-muted">{f.message}</li>)}</ul>
        </details>
      )}

      {!editing && (
        <footer className="flex flex-wrap items-center gap-2 px-4 py-2 border-t border-hairline bg-raised/30">
          <button type="button" className="btn-ghost h-8 text-micro" onClick={() => setEditing(true)}><Pencil className="size-3.5" /> Edit</button>
          <button type="button" className="btn-ghost h-8 text-micro" disabled={busy} onClick={() => regenerate.mutate({ id: message.id })}>
            <RefreshCw className={cn('size-3.5', regenerate.isPending && 'animate-spin')} /> Rewrite
          </button>
          <button type="button" className="btn-ghost h-8 text-micro" disabled={busy} onClick={() => reject.mutate({ id: message.id, reason: 'Rejected in review' })}>
            <X className="size-3.5" /> Reject
          </button>
          <span className="flex-1" />
          {canApprove && (
            <button type="button" className="btn-outline h-8 text-micro" disabled={busy || blockers.length > 0}
                    onClick={() => (needsOverride ? setOverride('approve') : approve.mutate({ id: message.id }))}>
              <Check className="size-3.5" /> Approve
            </button>
          )}
          {canSend && (
            <button type="button" className="btn-primary h-8 text-micro" disabled={busy || blockers.length > 0}
                    onClick={() => (needsOverride ? setOverride('send') : send.mutate({ id: message.id }))}>
              {send.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Approve and send
            </button>
          )}
        </footer>
      )}

      {send.data && !send.data.sent && (
        <p className="px-4 py-2 text-[11px] text-held border-t border-hairline">
          Approved, but held by the send gate: {!send.data.verdict.allowed ? send.data.verdict.reason : 'blocked'}
        </p>
      )}
      {(send.error || approve.error || edit.error || regenerate.error || reject.error) && (
        <p className="px-4 py-2 text-[11px] text-blocked border-t border-hairline">
          {(send.error ?? approve.error ?? edit.error ?? regenerate.error ?? reject.error)?.message}
        </p>
      )}

      {override && (
        <OverrideDialog
          claims={factual.filter((c) => c.status === 'UNSUPPORTED' || c.status === 'CONTRADICTED')}
          pending={approve.isPending || send.isPending}
          onClose={() => setOverride(null)}
          onConfirm={(note) => {
            const input = { id: message.id, acknowledgeUnverified: true, note };
            if (override === 'send') send.mutate(input, { onSettled: () => setOverride(null) });
            else approve.mutate(input, { onSettled: () => setOverride(null) });
          }}
        />
      )}
    </article>
  );
}

function reasonInReview(m: Draft): string | null {
  if (m.status === 'NEEDS_EDIT') return 'needs an edit';
  if (!m.campaign || m.campaign.approvalMode === 'REVIEW_ALL') return null;
  if (m.verificationStatus !== 'VERIFIED') return 'not fully verified, so not sent automatically';
  if ((m.verificationScore ?? 0) < m.campaign.autoApproveThreshold) return `scored below the ${m.campaign.autoApproveThreshold.toFixed(2)} threshold`;
  if (m.claims.some((c) => c.claimType && !c.approvedType)) return 'uses a claim type that needs review';
  return null;
}

function OverrideDialog({ claims, pending, onClose, onConfirm }: {
  claims: Draft['claims'];
  pending: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [checked, setChecked] = useState(false);
  const [note, setNote] = useState('');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Approve with unverified claims"
            description="These statements could not be matched to evidence. Edit them out if you can. If you've confirmed them yourself, say how — the note is kept with the email and in the audit log.">
      <div className="space-y-3">
        <ul className="space-y-1">
          {claims.map((c) => <li key={c.id} className="text-[12px]"><Pill tone="negative">{c.status === 'CONTRADICTED' ? 'contradicted' : 'unsupported'}</Pill> “{c.text}”</li>)}
        </ul>
        <label className="block">
          <span className="block text-[12px] font-medium mb-1.5">How did you verify these?</span>
          <textarea rows={3} className="input h-auto py-2" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Confirmed with the client on our 3 Oct call that they serve this customer." />
        </label>
        <label className="flex items-start gap-2 text-[12px]">
          <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          I checked these statements myself and they are true.
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={!checked || note.trim().length < 10 || pending} onClick={() => onConfirm(note.trim())}>Approve</button>
        </div>
      </div>
    </Dialog>
  );
}
