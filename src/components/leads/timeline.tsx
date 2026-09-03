'use client';

import { formatDistanceToNow } from 'date-fns';
import {
  StickyNote, Phone, MailOpen, Send, CalendarCheck, GitBranch,
  CheckSquare, FileText, Eye, Microscope, Cog,
} from 'lucide-react';
import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import type { ActivityType } from '@prisma/client';

const ICONS: Record<ActivityType, typeof StickyNote> = {
  NOTE: StickyNote, CALL: Phone, EMAIL_SENT: Send, EMAIL_RECEIVED: MailOpen,
  MEETING: CalendarCheck, STATUS_CHANGE: GitBranch, TASK_COMPLETED: CheckSquare,
  PROPOSAL_SENT: FileText, PROPOSAL_VIEWED: Eye, RESEARCH_COMPLETED: Microscope,
  SYSTEM: Cog,
};

// Inbound signals get colour; everything the agency did itself stays neutral.
// The point of scanning a timeline is spotting what the prospect did.
const ACCENTED = new Set<ActivityType>(['EMAIL_RECEIVED', 'PROPOSAL_VIEWED', 'MEETING']);

export function Timeline({ leadId }: { leadId: string }) {
  const [note, setNote] = useState('');
  const utils = trpc.useUtils();
  const timeline = trpc.leads.timeline.useQuery({ leadId });
  const addNote = trpc.leads.addNote.useMutation({
    onSuccess: () => { setNote(''); utils.leads.timeline.invalidate({ leadId }); },
  });

  return (
    <div className="space-y-4">
      <div className="card p-3">
        <label htmlFor="note" className="eyebrow block mb-2">Add a note</label>
        <textarea
          id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="What happened on this account?"
          className="input h-auto py-2 resize-y"
        />
        <div className="flex justify-end mt-2">
          <button
            type="button" className="btn-primary h-8 text-micro"
            disabled={!note.trim() || addNote.isPending}
            onClick={() => addNote.mutate({ leadId, body: note.trim() })}
          >
            {addNote.isPending ? 'Saving…' : 'Save note'}
          </button>
        </div>
      </div>

      {timeline.data?.length === 0 && (
        <p className="text-sm text-muted py-6 text-center">
          Nothing has happened on this account yet. Research it to get started.
        </p>
      )}

      <ol className="relative">
        {/* One continuous rule behind the markers reads as a spine rather than
            a stack of cards, which matters when the history gets long. */}
        <div className="absolute left-[13px] top-2 bottom-2 w-px bg-hairline" aria-hidden />
        {timeline.data?.map((entry) => {
          const Icon = ICONS[entry.type];
          const accented = ACCENTED.has(entry.type);
          return (
            <li key={entry.id} className="relative pl-9 pb-5">
              <span className={cn(
                'absolute left-0 top-0 size-[27px] rounded-full grid place-items-center border',
                accented ? 'bg-accent-soft border-accent/30 text-accent' : 'bg-surface border-hairline text-muted',
              )}>
                <Icon className="size-3.5" strokeWidth={1.75} />
              </span>
              <div className="flex items-baseline gap-2 flex-wrap">
                <p className="text-[13px] font-medium">{entry.title}</p>
                <time
                  dateTime={entry.occurredAt.toISOString()}
                  className="num text-[11px] text-muted"
                  title={entry.occurredAt.toLocaleString('en-CA')}
                >
                  {formatDistanceToNow(entry.occurredAt, { addSuffix: true })}
                </time>
                {entry.user && (
                  <span className="text-[11px] text-muted">
                    · {[entry.user.firstName, entry.user.lastName].filter(Boolean).join(' ')}
                  </span>
                )}
              </div>
              {entry.body && (
                <p className="text-micro text-muted mt-1 whitespace-pre-wrap">{entry.body}</p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
