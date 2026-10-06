import { addDays, differenceInCalendarDays, differenceInHours } from 'date-fns';
import type { CallOutcome, CallTaskCategory, ReplyClass, SignalType, EvidenceStatus } from '@prisma/client';
import { CONNECTED_OUTCOMES } from '@/server/services/scoring/types';

/**
 * Who should a caller ring right now, and why?
 *
 * This is a transparent rule set, not a model. Each reason carries its own
 * points and a sentence a caller can read ("Replied 'send me more info' 2 days
 * ago"). The base is fit (account and contact score); engagement, fresh
 * signals and due callbacks move people up; unanswered attempts move them
 * down and space them out. When enough call outcomes exist, these weights are
 * what a learned ranking replaces — the inputs and the reasons stay.
 */

export interface QueueReason {
  code: 'CALLBACK_DUE' | 'REPLIED' | 'ENGAGED' | 'SIGNAL' | 'FIT' | 'PHONE' | 'ATTEMPTS' | 'MANUAL';
  label: string;
  points: number;
}

export interface QueueFacts {
  now: Date;
  accountScore: number;
  contactScore: number;
  accountStatus: string;
  hasDirectPhone: boolean;
  hasAnyPhone: boolean;
  doNotCall: boolean;
  contactStatus: string;
  replies: Array<{ at: Date; replyClass: ReplyClass | null; snippet: string | null }>;
  emails: Array<{ sentAt: Date; opened: boolean; clicked: boolean }>;
  calls: Array<{ at: Date; outcome: CallOutcome; callbackAt: Date | null }>;
  signals: Array<{ type: SignalType; title: string; at: Date; evidenceStatus: EvidenceStatus }>;
  upcomingMeeting: boolean;
  manual: boolean;
}

export type QueueDecision =
  | { eligible: false; reason: string }
  | {
      eligible: true;
      category: CallTaskCategory;
      priority: number;
      reasons: QueueReason[];
      /** Not before this time (spacing between unanswered attempts). */
      notBefore: Date | null;
      dueAt: Date | null;
    };

const UNANSWERED: readonly CallOutcome[] = ['NO_ANSWER', 'VOICEMAIL'];
const CLOSED: readonly CallOutcome[] = ['NOT_INTERESTED', 'DO_NOT_CALL', 'WRONG_PERSON', 'WRONG_NUMBER', 'MEETING_BOOKED'];
const MAX_UNANSWERED = 6;

function ago(now: Date, at: Date) {
  const days = differenceInCalendarDays(now, at);
  if (days <= 0) {
    const hours = Math.max(1, differenceInHours(now, at));
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function prioritize(f: QueueFacts): QueueDecision {
  if (f.doNotCall) return { eligible: false, reason: 'Do not call' };
  if (!f.hasAnyPhone) return { eligible: false, reason: 'No phone number' };
  if (f.contactStatus !== 'ACTIVE') return { eligible: false, reason: `Contact is ${f.contactStatus.toLowerCase().replace('_', ' ')}` };
  if (['WON', 'LOST', 'DISQUALIFIED'].includes(f.accountStatus)) return { eligible: false, reason: `Account is ${f.accountStatus.toLowerCase()}` };
  if (f.upcomingMeeting) return { eligible: false, reason: 'Meeting already booked' };

  const lastCall = [...f.calls].sort((a, b) => b.at.getTime() - a.at.getTime())[0];
  if (lastCall && CLOSED.includes(lastCall.outcome) && differenceInCalendarDays(f.now, lastCall.at) < 90) {
    return { eligible: false, reason: `Last call: ${lastCall.outcome.toLowerCase().replace(/_/g, ' ')}` };
  }
  const negative = f.replies.find((r) => r.replyClass === 'NEGATIVE' || r.replyClass === 'UNSUBSCRIBE');
  if (negative) return { eligible: false, reason: 'Replied that they are not interested' };

  const reasons: QueueReason[] = [];
  let dueAt: Date | null = null;
  let category: CallTaskCategory | null = f.manual ? 'MANUAL' : null;

  // Callbacks a prospect asked for come first.
  const callback = lastCall?.callbackAt ?? null;
  if (callback) {
    dueAt = callback;
    const overdue = callback.getTime() <= f.now.getTime();
    reasons.push({
      code: 'CALLBACK_DUE',
      label: overdue ? `Asked to be called back — due ${ago(f.now, callback)}` : `Callback scheduled ${callback.toLocaleString('en-CA', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`,
      points: overdue ? 35 : 20,
    });
    category = 'CALLBACK_DUE';
  }

  // Replies since the last conversation.
  const lastConnected = f.calls.filter((c) => CONNECTED_OUTCOMES.includes(c.outcome)).sort((a, b) => b.at.getTime() - a.at.getTime())[0];
  const freshReplies = f.replies
    .filter((r) => differenceInCalendarDays(f.now, r.at) <= 14 && (!lastConnected || r.at > lastConnected.at))
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  const reply = freshReplies[0];
  if (reply && reply.replyClass !== 'OUT_OF_OFFICE') {
    const positive = reply.replyClass === 'POSITIVE' || reply.replyClass === 'REFERRAL';
    const quote = reply.snippet ? ` "${reply.snippet.slice(0, 60)}${reply.snippet.length > 60 ? '…' : ''}"` : '';
    reasons.push({ code: 'REPLIED', label: `Replied${quote} ${ago(f.now, reply.at)}`, points: positive ? 35 : 25 });
    category ??= 'REPLIED';
  }

  // Email engagement in the last two weeks. Opens are weak evidence.
  const recent = f.emails.filter((e) => differenceInCalendarDays(f.now, e.sentAt) <= 14);
  const opened = recent.filter((e) => e.opened).length;
  const clicked = recent.filter((e) => e.clicked).length;
  if (clicked || opened >= 2) {
    const parts = [opened ? `opened ${opened} email${opened > 1 ? 's' : ''}` : null, clicked ? `clicked ${clicked > 1 ? `${clicked} links` : 'a link'}` : null].filter(Boolean);
    const label = parts.join(' and ');
    reasons.push({ code: 'ENGAGED', label: label.charAt(0).toUpperCase() + label.slice(1), points: clicked ? 15 : 8 });
    category ??= 'ENGAGED';
  }

  // Fresh, credible signals.
  const signal = f.signals
    .filter((s) => s.evidenceStatus !== 'REJECTED' && differenceInCalendarDays(f.now, s.at) <= 45)
    .sort((a, b) => b.at.getTime() - a.at.getTime())[0];
  if (signal) {
    const age = differenceInCalendarDays(f.now, signal.at);
    reasons.push({ code: 'SIGNAL', label: `${signal.title} — ${ago(f.now, signal.at)}`, points: age <= 14 ? 15 : 10 });
    category ??= 'SIGNAL';
  }

  // Fit is the base everyone starts from.
  const fitPoints = Math.round(0.45 * f.accountScore + 0.25 * f.contactScore);
  const highFit = f.accountScore >= 70 && f.contactScore >= 55;
  reasons.push({
    code: 'FIT',
    label: highFit ? `High ICP fit (account ${f.accountScore}, contact ${f.contactScore})` : `Fit: account ${f.accountScore}, contact ${f.contactScore}`,
    points: fitPoints,
  });
  if (f.hasDirectPhone) reasons.push({ code: 'PHONE', label: 'Direct phone number available', points: 5 });

  if (!category) {
    if (!highFit) return { eligible: false, reason: 'No reason to call yet' };
    category = 'HIGH_FIT';
  }

  // Unanswered attempts: penalize, cap, and space out.
  const sinceConnect = f.calls.filter((c) => !lastConnected || c.at > lastConnected.at);
  const unanswered = sinceConnect.filter((c) => UNANSWERED.includes(c.outcome)).length;
  if (unanswered >= MAX_UNANSWERED && !callback) {
    return { eligible: false, reason: `${unanswered} unanswered attempts — rest this contact` };
  }
  if (unanswered) reasons.push({ code: 'ATTEMPTS', label: `${unanswered} unanswered attempt${unanswered > 1 ? 's' : ''}`, points: -4 * unanswered });

  let notBefore: Date | null = null;
  if (lastCall && UNANSWERED.includes(lastCall.outcome) && !callback) {
    // Two days between unanswered attempts; sooner reads as pestering.
    const next = addDays(lastCall.at, 2);
    if (next > f.now) notBefore = next;
  }

  const priority = Math.max(0, Math.min(100, reasons.reduce((s, r) => s + r.points, 0) + (f.manual ? 10 : 0)));
  return { eligible: true, category, priority, reasons: reasons.filter((r) => r.points !== 0 || r.code === 'FIT'), notBefore, dueAt };
}
