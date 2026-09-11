'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowRight, Check, Loader2, PenLine, Settings2, Sparkles,
} from 'lucide-react';
import { Topbar } from '@/components/shell/topbar';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

type Result = { leadId: string; ok: boolean; message: string };

/**
 * The hand-off between research and review. Research leaves a lead with a fact
 * ledger and nothing to send; this is where those facts become a draft. Drafts
 * always land in the review queue — nothing here sends anything.
 */
export function DraftWorkspace({ canDraft }: { canDraft: boolean }) {
  const settings = trpc.admin.settings.useQuery();
  const draftable = trpc.messages.draftable.useQuery({ limit: 50 });
  const queue = trpc.messages.queueSummary.useQuery();
  const utils = trpc.useUtils();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);
  const [editingBrief, setEditingBrief] = useState(false);

  const draft = trpc.messages.draft.useMutation();

  const senderName = settings.data?.defaultSenderName?.trim() ?? '';
  const offerBrief = settings.data?.offerBrief?.trim() ?? '';
  const briefReady = senderName.length > 0 && offerBrief.length > 0;

  const leads = draftable.data ?? [];
  const pendingReview = (queue.data ?? [])
    .filter((q) => q.status === 'DRAFT' || q.status === 'NEEDS_EDIT')
    .reduce((n, q) => n + q.count, 0);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  async function generate() {
    if (!briefReady || selected.size === 0) return;
    setRunning(true);
    setResults([]);
    const out: Result[] = [];

    // Sequential on purpose: each draft is a model call against a shared
    // monthly budget, and a burst of parallel calls makes a budget overrun
    // impossible to stop halfway.
    for (const leadId of selected) {
      try {
        const res = await draft.mutateAsync({
          leadId,
          options: {
            senderName,
            offerBrief,
            toneGuidelines: settings.data?.toneGuidelines ?? null,
            bannedPhrases: settings.data?.bannedPhrases ?? [],
            allowContextual: true,
          },
        });
        out.push({
          leadId,
          ok: true,
          message: res.tier === 'VERIFIED' ? 'Drafted from research' : 'Drafted (industry only)',
        });
      } catch (err) {
        out.push({
          leadId,
          ok: false,
          message: err instanceof Error ? err.message : 'Failed',
        });
      }
      setResults([...out]);
    }

    setRunning(false);
    setSelected(new Set());
    utils.messages.draftable.invalidate();
    utils.messages.queueSummary.invalidate();
    utils.messages.reviewQueue.invalidate();
  }

  return (
    <>
      <Topbar
        title="Drafts"
        actions={
          pendingReview > 0 ? (
            <Link href="/review" className="btn-ghost h-8 text-micro">
              <span className="num">{pendingReview}</span> waiting in review
              <ArrowRight className="size-3.5" />
            </Link>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6">
          <p className="text-sm text-muted max-w-2xl mb-6">
            Turn researched leads into first-contact emails. Every draft is written only from
            facts research verified, and lands in the review queue for a human to approve —
            nothing sends from this page.
          </p>

          {/* The brief is what the model is allowed to say about you. Without it
              there is nothing to write from, so it gates the whole page. */}
          {(!briefReady || editingBrief) && (
            <OutreachBrief
              defaultSenderName={settings.data?.defaultSenderName ?? ''}
              defaultOfferBrief={settings.data?.offerBrief ?? ''}
              defaultTone={settings.data?.toneGuidelines ?? ''}
              onSaved={() => { setEditingBrief(false); settings.refetch(); }}
              onCancel={briefReady ? () => setEditingBrief(false) : undefined}
            />
          )}

          {briefReady && !editingBrief && (
            <div className="card p-3 mb-5 flex items-center gap-3">
              <Settings2 className="size-3.5 text-muted shrink-0" />
              <p className="text-[11px] text-muted flex-1 min-w-0 truncate">
                Writing as <span className="text-ink font-medium">{senderName}</span> · {offerBrief}
              </p>
              <button type="button" className="btn-ghost h-7 text-micro shrink-0"
                      onClick={() => setEditingBrief(true)}>
                Edit brief
              </button>
            </div>
          )}

          {draftable.isPending ? (
            <div className="card p-8 text-center text-micro text-muted flex items-center justify-center gap-2">
              <Loader2 className="size-3.5 animate-spin" /> Loading researched leads…
            </div>
          ) : leads.length === 0 ? (
            <div className="card p-10 text-center">
              <PenLine className="size-7 mx-auto text-muted mb-3" strokeWidth={1.5} />
              <h2 className="font-display font-semibold mb-1">Nothing to draft yet</h2>
              <p className="text-sm text-muted max-w-sm mx-auto">
                Leads appear here once research has finished and they have a contact with an email
                address. Queue some research first.
              </p>
              <Link href="/research" className="btn-outline h-8 text-micro mt-4 inline-flex">
                Go to research <ArrowRight className="size-3.5" />
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="eyebrow flex-1">
                  Ready to draft <span className="num">({leads.length})</span>
                </h2>
                <button type="button" className="btn-ghost h-7 text-micro"
                        onClick={() => setSelected(new Set(leads.map((l) => l.id)))}>
                  Select all
                </button>
                {selected.size > 0 && (
                  <button type="button" className="btn-ghost h-7 text-micro"
                          onClick={() => setSelected(new Set())}>
                    Clear
                  </button>
                )}
                {canDraft && (
                  <button
                    type="button"
                    className="btn-primary h-8 text-micro"
                    disabled={!briefReady || selected.size === 0 || running}
                    title={!briefReady ? 'Add your outreach brief first' : undefined}
                    onClick={generate}
                  >
                    {running
                      ? <><Loader2 className="size-3.5 animate-spin" /> Drafting…</>
                      : <><Sparkles className="size-3.5" /> Draft {selected.size > 0 ? selected.size : ''}</>}
                  </button>
                )}
              </div>

              <ul className="card divide-y divide-hairline">
                {leads.map((lead) => {
                  const result = results.find((r) => r.leadId === lead.id);
                  return (
                    <li key={lead.id} className="flex items-center gap-3 px-4 py-3">
                      <input
                        type="checkbox"
                        className="size-3.5 accent-[rgb(var(--accent))]"
                        checked={selected.has(lead.id)}
                        onChange={() => toggle(lead.id)}
                        disabled={running}
                        aria-label={`Select ${lead.companyName}`}
                      />
                      <div className="flex-1 min-w-0">
                        <Link href={`/leads/${lead.id}`} className="text-[13px] font-medium hover:text-accent">
                          {lead.companyName}
                        </Link>
                        <p className="text-[11px] text-muted truncate">
                          {lead.contact?.email ?? 'No email'}
                          {lead.industry ? ` · ${lead.industry}` : ''}
                        </p>
                      </div>

                      {!lead.researchSucceeded && (
                        <span className="text-[11px] text-held inline-flex items-center gap-1"
                              title="Research found nothing citable — this will be an industry-only draft">
                          <AlertTriangle className="size-3" /> industry only
                        </span>
                      )}
                      <span className="num text-[11px] text-muted w-14 text-right">score {lead.score}</span>

                      {result && (
                        <span className={cn('text-[11px] inline-flex items-center gap-1 w-40 justify-end text-right',
                          result.ok ? 'text-cleared' : 'text-blocked')}>
                          {result.ok ? <Check className="size-3 shrink-0" /> : <AlertTriangle className="size-3 shrink-0" />}
                          <span className="truncate">{result.message}</span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>

              {results.some((r) => r.ok) && (
                <p className="text-micro text-muted mt-3">
                  <span className="num">{results.filter((r) => r.ok).length}</span> draft(s) created.{' '}
                  <Link href="/review" className="text-accent hover:underline">
                    Review and approve them
                  </Link>{' '}
                  before anything can send.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

/** Inline brief editor. Saves to org settings so campaigns can reuse it. */
function OutreachBrief({ defaultSenderName, defaultOfferBrief, defaultTone, onSaved, onCancel }: {
  defaultSenderName: string;
  defaultOfferBrief: string;
  defaultTone: string;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [senderName, setSenderName] = useState(defaultSenderName);
  const [offerBrief, setOfferBrief] = useState(defaultOfferBrief);
  const [tone, setTone] = useState(defaultTone);
  const utils = trpc.useUtils();
  const save = trpc.admin.updateSettings.useMutation({
    onSuccess: () => { utils.admin.settings.invalidate(); onSaved(); },
  });

  const valid = senderName.trim().length > 0 && offerBrief.trim().length > 0;

  return (
    <section className="card p-4 mb-6">
      <h2 className="text-[13px] font-medium mb-1">Your outreach brief</h2>
      <p className="text-micro text-muted mb-4">
        This is the only thing the model may claim about you. Saved once and reused for every
        draft — it is not per-lead.
      </p>

      <div className="space-y-3">
        <div>
          <label htmlFor="senderName" className="eyebrow block mb-1">Sign-off name</label>
          <input id="senderName" className="input" value={senderName} maxLength={80}
                 placeholder="Ishpreet" onChange={(e) => setSenderName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="offerBrief" className="eyebrow block mb-1">What you do</label>
          <textarea id="offerBrief" className="input h-auto py-2 resize-y" rows={3} maxLength={2000}
                    placeholder="We build automations for trades businesses — dispatch, quote follow-up, and invoicing that runs without the office chasing it."
                    value={offerBrief} onChange={(e) => setOfferBrief(e.target.value)} />
          <p className="text-[11px] text-muted mt-1">
            Plain and specific beats broad. One or two sentences.
          </p>
        </div>
        <div>
          <label htmlFor="tone" className="eyebrow block mb-1">Tone notes (optional)</label>
          <input id="tone" className="input" value={tone} maxLength={2000}
                 placeholder="Direct, no hype, short sentences."
                 onChange={(e) => setTone(e.target.value)} />
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        {onCancel && (
          <button type="button" className="btn-ghost h-8 text-micro" onClick={onCancel}>Cancel</button>
        )}
        <button
          type="button"
          className="btn-primary h-8 text-micro"
          disabled={!valid || save.isPending}
          onClick={() => save.mutate({
            defaultSenderName: senderName.trim(),
            offerBrief: offerBrief.trim(),
            toneGuidelines: tone.trim() || null,
          })}
        >
          {save.isPending ? 'Saving…' : 'Save brief'}
        </button>
      </div>
      {save.error && <p className="text-[11px] text-blocked mt-2">{save.error.message}</p>}
    </section>
  );
}
