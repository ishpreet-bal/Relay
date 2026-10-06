import type { ContactFacts, ContactScore, EngagementFacts, IcpCriteria, ScoreReason } from './types';
import { inferDepartment, inferSeniority, matchingTitle, normalizeText } from './text';

/**
 * Contact score, 0-100: how right this person is (role, 50), whether we can
 * actually reach them (30), and what they have done so far (20).
 */

export interface RoleFit {
  points: number; // 0-50
  reason: ScoreReason;
}

const ROLE_MAX = 50;

export function roleFit(contact: ContactFacts, icp: IcpCriteria | null, employeeCount: number | null): RoleFit {
  const title = contact.title?.trim() || null;
  const seniority = contact.seniority === 'UNKNOWN' ? inferSeniority(title) : contact.seniority;
  const department = contact.department ?? inferDepartment(title);

  if (!icp) {
    if (contact.isDecisionMaker || seniority === 'OWNER' || seniority === 'C_LEVEL') {
      return { points: 30, reason: { label: 'Senior decision-maker (no ICP to compare against)', points: 30, tone: 'neutral' } };
    }
    return { points: 15, reason: { label: 'No ICP to compare the role against', points: 15, tone: 'neutral' } };
  }

  const exact = matchingTitle(title, icp.targetTitles);
  if (exact) {
    return { points: ROLE_MAX, reason: { label: `${title} — a target title (${exact})`, points: ROLE_MAX, tone: 'positive' } };
  }

  // At a small company the owner usually makes the call.
  const small = icp.smallCompanyMaxEmployees != null && employeeCount != null && employeeCount <= icp.smallCompanyMaxEmployees;
  if (small && (matchingTitle(title, icp.smallCompanyTitles) || seniority === 'OWNER')) {
    return {
      points: 45,
      reason: { label: `${title ?? 'Owner'} at a ${employeeCount}-person company, where the owner usually decides`, points: 45, tone: 'positive' },
    };
  }

  const dept = department && icp.targetDepartments.some((d) => normalizeText(d) === normalizeText(department));
  const level = icp.targetSeniorities.includes(seniority);
  if (dept && level) {
    return { points: 40, reason: { label: `${department}, ${seniority.toLowerCase().replace('_', '-')} level — matches the ICP`, points: 40, tone: 'positive' } };
  }
  if (dept) {
    return { points: 30, reason: { label: `Works in ${department}, a target department`, points: 30, tone: 'positive' } };
  }
  if (level) {
    return { points: 22, reason: { label: `${title ?? 'Unknown title'} — right seniority, other department`, points: 22, tone: 'neutral' } };
  }
  if (contact.isDecisionMaker) {
    return { points: 25, reason: { label: 'Marked as a decision-maker', points: 25, tone: 'neutral' } };
  }
  if (!title) {
    return { points: 5, reason: { label: 'Title unknown', points: 5, tone: 'negative' } };
  }
  return { points: 8, reason: { label: `${title} — not a target role`, points: 8, tone: 'negative' } };
}

export function reachability(contact: ContactFacts): { points: number; reasons: ScoreReason[] } {
  const reasons: ScoreReason[] = [];
  let points = 0;

  if (contact.email && !contact.doNotEmail) {
    const p = contact.emailVerification === 'VALID' ? 15
      : contact.emailVerification === 'CATCH_ALL' || contact.emailVerification === 'RISKY' ? 8
      : contact.emailVerification === 'INVALID' ? 0 : 6;
    points += p;
    reasons.push({
      label: contact.emailVerification === 'VALID' ? 'Verified email'
        : contact.emailVerification === 'INVALID' ? 'Email bounced or invalid'
        : `Email ${contact.emailVerification.toLowerCase().replace('_', '-')}`,
      points: p,
      tone: p >= 15 ? 'positive' : p > 0 ? 'neutral' : 'negative',
    });
  } else {
    reasons.push({ label: contact.doNotEmail ? 'Do not email' : 'No email', points: 0, tone: 'negative' });
  }

  if (!contact.doNotCall) {
    if (contact.directPhone || contact.mobilePhone) {
      points += 15;
      reasons.push({ label: 'Direct phone number', points: 15, tone: 'positive' });
    } else if (contact.phone) {
      points += 8;
      reasons.push({ label: 'Company phone only', points: 8, tone: 'neutral' });
    } else {
      reasons.push({ label: 'No phone number', points: 0, tone: 'negative' });
    }
  } else {
    reasons.push({ label: 'Do not call', points: 0, tone: 'negative' });
  }

  return { points: Math.min(30, points), reasons };
}

export function contactEngagement(e: EngagementFacts): { points: number; reasons: ScoreReason[] } {
  const reasons: ScoreReason[] = [];
  const positive = e.replies.some((r) => r.replyClass === 'POSITIVE' || r.replyClass === 'REFERRAL');
  const negative = e.replies.some((r) => r.replyClass === 'NEGATIVE' || r.replyClass === 'UNSUBSCRIBE');

  if (e.meetingsBooked > 0) reasons.push({ label: 'Meeting booked', points: 20, tone: 'positive' });
  else if (positive) reasons.push({ label: 'Replied with interest', points: 20, tone: 'positive' });
  else if (negative) reasons.push({ label: 'Replied, not interested', points: 0, tone: 'negative' });
  else if (e.replies.length) reasons.push({ label: 'Replied', points: 14, tone: 'positive' });
  else if (e.callsConnected) reasons.push({ label: 'Spoke on the phone', points: 10, tone: 'positive' });
  else if (e.clicked) reasons.push({ label: 'Clicked a link', points: 8, tone: 'positive' });
  // Opens are unreliable (privacy proxies open everything), so they count little.
  else if (e.opened) reasons.push({ label: `Opened ${e.opened} email${e.opened > 1 ? 's' : ''}`, points: Math.min(4, e.opened * 2), tone: 'neutral' });
  else if (e.emailsSent) reasons.push({ label: 'No response yet', points: 0, tone: 'neutral' });

  return { points: Math.min(20, reasons.reduce((s, r) => s + r.points, 0)), reasons };
}

export function scoreContact(params: {
  contact: ContactFacts;
  icp: IcpCriteria | null;
  employeeCount: number | null;
  engagement: EngagementFacts;
}): ContactScore {
  const role = roleFit(params.contact, params.icp, params.employeeCount);
  const reach = reachability(params.contact);
  const engagement = contactEngagement(params.engagement);

  const flags: string[] = [];
  if (params.contact.doNotEmail && params.contact.doNotCall) flags.push('Do not contact');

  const total = flags.length ? 0 : Math.max(0, Math.min(100, role.points + reach.points + engagement.points));

  return {
    version: 2,
    total,
    components: [
      { key: 'role', label: 'Role fit', points: role.points, max: ROLE_MAX, reasons: [role.reason] },
      { key: 'reach', label: 'Reachability', points: reach.points, max: 30, reasons: reach.reasons },
      { key: 'engagement', label: 'Engagement', points: engagement.points, max: 20, reasons: engagement.reasons },
    ],
    flags,
    summary: flags.length ? 'Do not contact.' : role.reason.label,
  };
}
