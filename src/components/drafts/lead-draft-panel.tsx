'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, Loader2, PenLine } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

const OPEN_STATUSES = ['DRAFT', 'NEEDS_EDIT', 'APPROVED', 'SCHEDULED'] as const;

/**
 * Drafting for a single lead, from the lead's own page. The batch path lives on
 * /drafts; this exists because the natural moment to write to someone is while
 * you are reading their research, not after navigating away from it.
 */
export function LeadDraftPanel({ leadId, canDraft }: { leadId: string; canDraft: boolean }) {
  const settings = trpc.admin.settings.useQuery();
  const lead = trpc.leads.byId.useQuery({ id: leadId });
  const utils = trpc.useUtils();

  const draft = trpc.messages.draft.useMutation({
    onSuccess: () => {
      utils.leads.byId.invalidate({ id: leadId });
      utils.leads.timeline.invalidate({ leadId });
      utils.messages.queueSummary.invalidate();
      utils.messages.draftable.invalidate();
    },
  });

  const senderName = settings.data?.defaultSenderName?.trim() ?? '';
  const offerBrief = settings.data?.offerBrief?.trim() ?? '';
  const briefReady = senderName.length > 0 && offerBrief.length > 0;

  const outbound = (lead.data?.messages ?? []).filter((m) => m.direction === 'OUTBOUND');
  const open = outbound.filter((m) => (OPEN_STATUSES as readonly string[]).includes(m.status));
  const hasEmail = (lead.data?.contacts ?? []).some((c) => c.email);

  return (
    <section className="card p-4">
      <div className="flex items-center gap-2 mb-3">
        <PenLine className="size-3.5 text-muted" strokeWidth={1.75} />
        <h3 className="text-[13px] font-medium flex-1">Outreach</h3>
        {canDraft && (
          <button
            type="button"
            className="btn-outline h-7 text-micro"
            disabled={!briefReady || !hasEmail || draft.isPending}
            title={
              !hasEmail ? 'This lead needs a contact with an email address'
                : !briefReady ? 'Add your outreach brief on the Drafts page first'
                : undefined
            }
            onClick={() => draft.mutate({
              leadId,
              options: {
                senderName,
                offerBrief,
                toneGuidelines: settings.data?.toneGuidelines ?? null,
                bannedPhrases: settings.data?.bannedPhrases ?? [],
                allowContextual: true,
              },
            })}
          >
            {draft.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {draft.isPending ? 'Writing…' : open.length > 0 ? 'Draft another' : 'Draft email'}
          </button>
        )}
      </div>

      {!hasEmail && (
        <p className="text-[11px] text-muted">
          No contact with an email address yet. Research can find one, or add it on the lead.
        </p>
      )}

      {hasEmail && !briefReady && (
        <p className="text-[11px] text-muted">
          Set your outreach brief on the{' '}
          <Link href="/drafts" className="text-accent hover:underline">Drafts page</Link> before
          writing — it is what the model is allowed to say about you.
        </p>
      )}

      {outbound.length === 0 && hasEmail && briefReady && !draft.isPending && (
        <p className="text-[11px] text-muted">
          Nothing written yet. A draft always goes to the review queue before it can send.
        </p>
      )}

      {outbound.length > 0 && (
        <ul className="space-y-2">
          {outbound.slice(0, 5).map((m) => (
            <li key={m.id} className="flex items-start gap-2">
              <span className={cn('mt-1.5 size-1.5 rounded-full shrink-0',
                m.status === 'NEEDS_EDIT' ? 'bg-blocked'
                  : m.status === 'DRAFT' ? 'bg-held'
                  : m.status === 'SENT' || m.status === 'DELIVERED' ? 'bg-cleared' : 'bg-muted')} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] truncate">{m.subject || 'Untitled draft'}</p>
                <p className="text-[10px] text-muted capitalize">
                  {m.status.toLowerCase().replace(/_/g, ' ')}
                  {m.personalizationTier === 'CONTEXTUAL' && ' · industry only'}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open.length > 0 && (
        <Link href="/review" className="btn-ghost h-7 text-micro w-full mt-3">
          Review {open.length > 1 ? `${open.length} drafts` : 'draft'} <ArrowRight className="size-3" />
        </Link>
      )}

      {draft.error && (
        <p className="text-[11px] text-blocked mt-2 flex items-start gap-1.5">
          <AlertTriangle className="size-3 mt-0.5 shrink-0" />
          {draft.error.message}
        </p>
      )}
    </section>
  );
}
