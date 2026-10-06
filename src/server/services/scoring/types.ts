import type {
  CallOutcome, EmailVerification, EvidenceStatus, ReplyClass, Seniority, SignalType,
} from '@prisma/client';

/** Outcomes where a human answered and a conversation happened. */
export const CONNECTED_OUTCOMES: readonly CallOutcome[] = [
  'CONNECTED', 'NOT_INTERESTED', 'CALL_BACK', 'WRONG_PERSON', 'REFERRED', 'INTERESTED', 'QUALIFIED', 'MEETING_BOOKED', 'DO_NOT_CALL',
];

/**
 * Scores are explanations first and numbers second. Every point is attached
 * to a reason a salesperson can read ("Ontario — inside the ICP's service
 * area"), and the components are stored so the UI can show
 * Fit 36/40 · Contact 18/20 · Signals 14/20 · Engagement 10/10 · Data 8/10.
 *
 * The weights are rules today. When enough outcomes exist, a learned model can
 * replace any component without changing this shape.
 */

export type ReasonTone = 'positive' | 'neutral' | 'negative';

export interface ScoreReason {
  label: string;
  points: number;
  tone: ReasonTone;
}

export type AccountComponentKey = 'fit' | 'contact' | 'signals' | 'engagement' | 'data';

export interface ScoreComponent<K extends string = string> {
  key: K;
  label: string;
  points: number;
  max: number;
  reasons: ScoreReason[];
}

export interface AccountScore {
  version: 2;
  total: number;
  components: Array<ScoreComponent<AccountComponentKey>>;
  /** Conditions that make the account unworkable regardless of score. */
  flags: string[];
  /** One plain-English sentence: why this account. */
  summary: string;
}

export type ContactComponentKey = 'role' | 'reach' | 'engagement';

export interface ContactScore {
  version: 2;
  total: number;
  components: Array<ScoreComponent<ContactComponentKey>>;
  flags: string[];
  summary: string;
}

export interface IcpCriteria {
  industries: string[];
  industryKeywords: string[];
  excludedIndustries: string[];
  employeeMin: number | null;
  employeeMax: number | null;
  locations: string[];
  targetTitles: string[];
  targetDepartments: string[];
  targetSeniorities: Seniority[];
  smallCompanyMaxEmployees: number | null;
  smallCompanyTitles: string[];
  preferredSignals: SignalType[];
}

export interface AccountFacts {
  industry: string | null;
  description: string | null;
  keywords: string[];
  employeeCount: number | null;
  employeeRange: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  websiteUrl: string | null;
  doNotContact: boolean;
}

export interface ContactFacts {
  title: string | null;
  seniority: Seniority;
  department: string | null;
  isDecisionMaker: boolean;
  email: string | null;
  emailVerification: EmailVerification;
  phone: string | null;
  directPhone: string | null;
  mobilePhone: string | null;
  doNotEmail: boolean;
  doNotCall: boolean;
}

export interface SignalFacts {
  type: SignalType;
  title: string;
  detectedAt: Date;
  eventDate: Date | null;
  confidence: number;
  evidenceStatus: EvidenceStatus;
}

/** Engagement observed so far, for one contact or summed over an account. */
export interface EngagementFacts {
  emailsSent: number;
  opened: number;
  clicked: number;
  replies: Array<{ replyClass: ReplyClass | null; at: Date }>;
  callsConnected: number;
  meetingsBooked: number;
}

export const EMPTY_ENGAGEMENT: EngagementFacts = {
  emailsSent: 0, opened: 0, clicked: 0, replies: [], callsConnected: 0, meetingsBooked: 0,
};
