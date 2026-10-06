'use client';

import { useState } from 'react';
import {
  StickyNote, Phone, MailOpen, Send, CalendarCheck, GitBranch, CheckSquare, FileText, Eye, Microscope, Cog,
  Radio, Database, ShieldBan, SlidersHorizontal,
} from 'lucide-react';
import type { ActivityType } from '@prisma/client';
import { trpc } from '@/lib/trpc/client';
import { personName } from '@/lib/domain';
import { Ago } from '@/components/ui/time';
import { ErrorNote } from '@/components/ui/states';
import { cn } from '@/lib/utils';

const ICONS: Record<ActivityType, typeof StickyNote> = {
  NOTE: StickyNote, CALL: Phone, EMAIL_SENT: Send, EMAIL_RECEIVED: MailOpen, MEETING: CalendarCheck,
  STATUS_CHANGE: GitBranch, TASK_COMPLETED: CheckSquare, PROPOSAL_SENT: FileText, PROPOSAL_VIEWED: Eye,
  RESEARCH_COMPLETED: Microscope, SYSTEM: Cog, SIGNAL_DETECTED: Radio, ENRICHMENT: Database,
  SUPPRESSION: ShieldBan, SCORE_OVERRIDE: SlidersHorizontal,
};

// What the prospect did gets colour; what we did stays neutral. Scanning a
// history is mostly looking for the other side's moves.
const ACCENTED = new Set<ActivityType>(['EMAIL_RECEIVED', 'MEETING', 'SIGNAL_DETECTED']);

export function Timeline({ accountId, contactId, canWrite }: { accountId: string; contactId?: string; canWrite: boolean }) {
  const [note, setNote] = useState('');
  const utils = trpc.useUtils();
  const timeline = trpc.accounts.timeline.useQuery({ accountId, contactId });
  const addNote = trpc.accounts.addNote.useMutation({
    onSuccess: () => { setNote(''); utils.accounts.timeline.invalidate(); },
  });

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="card p-3">
          <label htmlFor="timeline-note" className="eyebrow block mb-2">Add a note</label>
          <textarea id="timeline-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder="What happened? Anything the next person should know?" className="input h-auto py-2 resize-y" />
          <ErrorNote error={addNote.error} className="mt-1" />
          <div className="flex justify-end mt-2">
            <button type="button" className="btn-primary h-8 text-micro" disabled={!note.trim() || addNote.isPending}
                    onClick={() => addNote.mutate({ accountId, contactId, body: note.trim() })}>
              {addNote.isPending ? 'Saving…' : 'Save note'}
            </button>
          </div>
        </div>
      )}

      {timeline.data?.length === 0 && <p className="text-sm text-muted py-6 text-center">Nothing has happened here yet.</p>}

      <ol className="relative">
        <div className="absolute left-[13px] top-2 bottom-2 w-px bg-hairline" aria-hidden />
        {timeline.data?.map((entry) => {
          const Icon = ICONS[entry.type] ?? Cog;
          const accented = ACCENTED.has(entry.type);
          return (
            <li key={entry.id} className="relative pl-9 pb-5">
              <span className={cn('absolute left-0 top-0 size-[27px] rounded-full grid place-items-center border',
                accented ? 'bg-accent-soft border-accent/30 text-accent' : 'bg-surface border-hairline text-muted')}>
                <Icon className="size-3.5" strokeWidth={1.75} />
              </span>
              <div className="flex items-baseline gap-2 flex-wrap">
                <p className="text-[13px] font-medium">{entry.title}</p>
                <Ago date={entry.occurredAt} className="num text-[11px] text-muted" />
                {entry.contact && !contactId && <span className="text-[11px] text-muted">· {personName(entry.contact)}</span>}
                {entry.user && <span className="text-[11px] text-muted">· {[entry.user.firstName, entry.user.lastName].filter(Boolean).join(' ')}</span>}
              </div>
              {entry.body && <p className="text-micro text-muted mt-1 whitespace-pre-wrap">{entry.body}</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
