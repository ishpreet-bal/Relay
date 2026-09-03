import { cn } from '@/lib/utils';
import type { LeadStatus } from '@prisma/client';

// Pills are tinted by pipeline phase, not by one colour per status. Thirteen
// distinct colours would be noise; four phases are scannable.
const PHASE: Record<LeadStatus, 'neutral' | 'working' | 'live' | 'won' | 'closed'> = {
  DISCOVERED: 'neutral', RESEARCHING: 'working', RESEARCHED: 'working', DRAFTED: 'working',
  APPROVED: 'live', CONTACTED: 'live', ENGAGED: 'live', MEETING_BOOKED: 'live', PROPOSAL_SENT: 'live',
  WON: 'won', LOST: 'closed', DISQUALIFIED: 'closed', SUPPRESSED: 'closed',
};

const TONE = {
  neutral: 'bg-raised text-muted',
  working: 'bg-accent-soft text-accent',
  live: 'bg-held/12 text-held',
  won: 'bg-cleared/12 text-cleared',
  closed: 'bg-blocked/10 text-blocked',
};

export function StatusPill({ status }: { status: LeadStatus }) {
  return (
    <span className={cn('inline-flex items-center h-[20px] px-2 rounded-full text-[11px] font-medium whitespace-nowrap', TONE[PHASE[status]])}>
      {status.toLowerCase().replace(/_/g, ' ')}
    </span>
  );
}
