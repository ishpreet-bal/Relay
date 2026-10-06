import type { AccountStatus, MeetingOutcome, MeetingStatus, SignalType, VerificationStatus, CallOutcome } from '@prisma/client';
import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { Pill, type Tone } from '@/components/ui/pill';
import {
  ACCOUNT_STATUS_LABELS, MEETING_OUTCOME_LABELS, MEETING_STATUS_LABELS, OUTCOME_LABELS, SIGNAL_LABELS, VERIFICATION_LABELS,
} from '@/lib/domain';

// Tinted by stage of the funnel rather than one colour per status: ten
// colours are noise, four phases are scannable.
const ACCOUNT_TONE: Record<AccountStatus, Tone> = {
  DISCOVERED: 'neutral', ENRICHED: 'neutral', QUALIFIED: 'accent', ACTIVE_OUTREACH: 'accent',
  ENGAGED: 'warning', CALLING: 'warning', MEETING_BOOKED: 'positive', WON: 'positive',
  LOST: 'negative', DISQUALIFIED: 'negative',
};

export function AccountStatusPill({ status }: { status: AccountStatus }) {
  return <Pill tone={ACCOUNT_TONE[status]}>{ACCOUNT_STATUS_LABELS[status]}</Pill>;
}

const VERIFICATION_TONE: Record<VerificationStatus, Tone> = {
  VERIFIED: 'positive', PARTIALLY_VERIFIED: 'warning', REVIEW_REQUIRED: 'warning', UNSUPPORTED: 'negative', BLOCKED: 'negative',
};

const VERIFICATION_HINT: Record<VerificationStatus, string> = {
  VERIFIED: 'Every factual claim is supported by evidence, and of a type approved for sending.',
  PARTIALLY_VERIFIED: 'Some claims are only partly supported by their evidence.',
  REVIEW_REQUIRED: 'Supported, but stale or of a type that needs a human to approve.',
  UNSUPPORTED: 'At least one claim has no supporting evidence.',
  BLOCKED: 'A claim contradicts its source.',
};

export function VerificationBadge({ status, score }: { status: VerificationStatus | null; score?: number | null }) {
  if (!status) return <Pill tone="neutral">Not verified</Pill>;
  const Icon = status === 'VERIFIED' ? ShieldCheck : status === 'UNSUPPORTED' || status === 'BLOCKED' ? ShieldAlert : ShieldQuestion;
  return (
    <Pill tone={VERIFICATION_TONE[status]} title={VERIFICATION_HINT[status]}>
      <Icon className="size-3" />
      {VERIFICATION_LABELS[status]}
      {score !== null && score !== undefined && <span className="num opacity-70">{score.toFixed(2)}</span>}
    </Pill>
  );
}

const MEETING_TONE: Record<MeetingStatus, Tone> = {
  BOOKED: 'accent', CONFIRMED: 'positive', RESCHEDULED: 'warning', ATTENDED: 'positive', NO_SHOW: 'negative', CANCELLED: 'neutral',
};

export function MeetingStatusPill({ status }: { status: MeetingStatus }) {
  return <Pill tone={MEETING_TONE[status]}>{MEETING_STATUS_LABELS[status]}</Pill>;
}

const OUTCOME_TONE: Record<MeetingOutcome, Tone> = {
  PENDING: 'neutral', QUALIFIED_OPPORTUNITY: 'accent', NOT_QUALIFIED: 'negative', WON: 'positive', LOST: 'negative',
};

export function MeetingOutcomePill({ outcome }: { outcome: MeetingOutcome }) {
  return <Pill tone={OUTCOME_TONE[outcome]}>{MEETING_OUTCOME_LABELS[outcome]}</Pill>;
}

export function SignalPill({ type }: { type: SignalType }) {
  return <Pill tone="accent">{SIGNAL_LABELS[type]}</Pill>;
}

const CALL_TONE: Partial<Record<CallOutcome, Tone>> = {
  MEETING_BOOKED: 'positive', QUALIFIED: 'positive', INTERESTED: 'positive', CONNECTED: 'accent', CALL_BACK: 'accent',
  REFERRED: 'accent', NOT_INTERESTED: 'negative', DO_NOT_CALL: 'negative', WRONG_NUMBER: 'negative', WRONG_PERSON: 'warning',
};

export function CallOutcomePill({ outcome }: { outcome: CallOutcome }) {
  return <Pill tone={CALL_TONE[outcome] ?? 'neutral'}>{OUTCOME_LABELS[outcome]}</Pill>;
}
