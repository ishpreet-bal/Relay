import type {
  AccountStatus, CallOutcome, CallTaskCategory, ClaimStatus, ClaimType, DataSource, MeetingOutcome, MeetingStatus,
  ObjectionType, ReplyClass, Seniority, SignalType, VerificationStatus,
} from '@prisma/client';

/**
 * Domain vocabularies and their human labels, shared by server code and
 * client components. Type-only Prisma imports keep this safe for the browser.
 */

export const ACCOUNT_STATUSES = [
  'DISCOVERED', 'ENRICHED', 'QUALIFIED', 'ACTIVE_OUTREACH', 'ENGAGED', 'CALLING', 'MEETING_BOOKED', 'WON', 'LOST', 'DISQUALIFIED',
] as const satisfies readonly AccountStatus[];

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  DISCOVERED: 'Discovered',
  ENRICHED: 'Enriched',
  QUALIFIED: 'Qualified',
  ACTIVE_OUTREACH: 'In outreach',
  ENGAGED: 'Engaged',
  CALLING: 'Calling',
  MEETING_BOOKED: 'Meeting booked',
  WON: 'Won',
  LOST: 'Lost',
  DISQUALIFIED: 'Disqualified',
};

export const DATA_SOURCES = [
  'MANUAL', 'CSV_IMPORT', 'GOOGLE_PLACES', 'OPENCORPORATES', 'COMPANY_WEBSITE', 'LINKEDIN', 'APOLLO',
  'REFERRAL', 'INBOUND', 'OTHER', 'PROVIDER', 'RESEARCH', 'CLIENT_PROVIDED',
] as const satisfies readonly DataSource[];

export const SENIORITIES = ['OWNER', 'C_LEVEL', 'VP', 'DIRECTOR', 'MANAGER', 'SENIOR', 'ENTRY', 'UNKNOWN'] as const satisfies readonly Seniority[];

export const SENIORITY_LABELS: Record<Seniority, string> = {
  OWNER: 'Owner', C_LEVEL: 'C-level', VP: 'VP', DIRECTOR: 'Director', MANAGER: 'Manager',
  SENIOR: 'Senior', ENTRY: 'Entry', UNKNOWN: 'Unknown',
};

export const SIGNAL_TYPES = [
  'HIRING', 'FUNDING', 'EXPANSION', 'NEW_LOCATION', 'NEW_CONTRACT', 'NEW_PRODUCT',
  'TECHNOLOGY_CHANGE', 'LEADERSHIP_CHANGE', 'REGULATORY_EVENT', 'CUSTOM_SIGNAL',
] as const satisfies readonly SignalType[];

export const SIGNAL_LABELS: Record<SignalType, string> = {
  HIRING: 'Hiring',
  FUNDING: 'Funding',
  EXPANSION: 'Expansion',
  NEW_LOCATION: 'New location',
  NEW_CONTRACT: 'New contract',
  NEW_PRODUCT: 'New product',
  TECHNOLOGY_CHANGE: 'Technology change',
  LEADERSHIP_CHANGE: 'Leadership change',
  REGULATORY_EVENT: 'Regulatory event',
  CUSTOM_SIGNAL: 'Other signal',
};

export const CLAIM_TYPES = [
  'JOB_TITLE', 'COMPANY_LOCATION', 'COMPANY_INDUSTRY', 'COMPANY_SIZE', 'PRODUCTS_SERVICES', 'SERVICE_AREA',
  'HIRING', 'EXPANSION', 'NEW_LOCATION', 'FUNDING', 'NEW_CONTRACT', 'NEW_PRODUCT', 'TECHNOLOGY_USED',
  'LEADERSHIP_CHANGE', 'CUSTOMER_OR_PARTNER', 'AWARD_OR_CERTIFICATION', 'REGULATORY_EVENT', 'OTHER_FACT',
] as const satisfies readonly ClaimType[];

export const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
  JOB_TITLE: 'Job title',
  COMPANY_LOCATION: 'Company location',
  COMPANY_INDUSTRY: 'Company industry',
  COMPANY_SIZE: 'Company size',
  PRODUCTS_SERVICES: 'Products and services',
  SERVICE_AREA: 'Service area',
  HIRING: 'Publicly announced hiring',
  EXPANSION: 'Publicly announced expansion',
  NEW_LOCATION: 'New location',
  FUNDING: 'Publicly announced funding',
  NEW_CONTRACT: 'New contract',
  NEW_PRODUCT: 'New product',
  TECHNOLOGY_USED: 'Technology used',
  LEADERSHIP_CHANGE: 'Leadership change',
  CUSTOMER_OR_PARTNER: 'Customer or partner',
  AWARD_OR_CERTIFICATION: 'Award or certification',
  REGULATORY_EVENT: 'Regulatory event',
  OTHER_FACT: 'Other fact',
};

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  SUPPORTED: 'Supported',
  PARTIALLY_SUPPORTED: 'Partly supported',
  UNSUPPORTED: 'Unsupported',
  CONTRADICTED: 'Contradicts source',
  STALE: 'Out of date',
  NOT_REQUIRED: 'No evidence needed',
};

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  VERIFIED: 'Verified',
  PARTIALLY_VERIFIED: 'Partly verified',
  REVIEW_REQUIRED: 'Needs review',
  UNSUPPORTED: 'Unsupported claims',
  BLOCKED: 'Blocked',
};

export const CALL_OUTCOMES = [
  'NO_ANSWER', 'VOICEMAIL', 'CONNECTED', 'NOT_INTERESTED', 'CALL_BACK', 'WRONG_PERSON', 'WRONG_NUMBER',
  'REFERRED', 'INTERESTED', 'QUALIFIED', 'MEETING_BOOKED', 'DO_NOT_CALL',
] as const satisfies readonly CallOutcome[];

export const OUTCOME_LABELS: Record<CallOutcome, string> = {
  NO_ANSWER: 'No answer',
  VOICEMAIL: 'Left voicemail',
  CONNECTED: 'Connected',
  NOT_INTERESTED: 'Not interested',
  CALL_BACK: 'Call back',
  WRONG_PERSON: 'Wrong person',
  WRONG_NUMBER: 'Wrong number',
  REFERRED: 'Referred',
  INTERESTED: 'Interested',
  QUALIFIED: 'Qualified',
  MEETING_BOOKED: 'Meeting booked',
  DO_NOT_CALL: 'Do not call',
};

export const OBJECTIONS = [
  'TOO_EXPENSIVE', 'ALREADY_HAVE_PROVIDER', 'BAD_TIMING', 'NO_NEED', 'SEND_INFORMATION', 'NOT_DECISION_MAKER', 'OTHER',
] as const satisfies readonly ObjectionType[];

export const OBJECTION_LABELS: Record<ObjectionType, string> = {
  TOO_EXPENSIVE: 'Too expensive',
  ALREADY_HAVE_PROVIDER: 'Already have a provider',
  BAD_TIMING: 'Bad timing',
  NO_NEED: 'No need',
  SEND_INFORMATION: 'Send information',
  NOT_DECISION_MAKER: 'Not the decision-maker',
  OTHER: 'Other',
};

export const QUEUE_CATEGORY_LABELS: Record<CallTaskCategory, string> = {
  CALLBACK_DUE: 'Callback due',
  REPLIED: 'Recent reply',
  ENGAGED: 'Engaged',
  SIGNAL: 'Fresh signal',
  HIGH_FIT: 'High fit',
  MANUAL: 'Added by hand',
};

export const MEETING_STATUSES = ['BOOKED', 'CONFIRMED', 'RESCHEDULED', 'ATTENDED', 'NO_SHOW', 'CANCELLED'] as const satisfies readonly MeetingStatus[];
export const MEETING_OUTCOMES = ['PENDING', 'QUALIFIED_OPPORTUNITY', 'NOT_QUALIFIED', 'WON', 'LOST'] as const satisfies readonly MeetingOutcome[];

export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  BOOKED: 'Booked', CONFIRMED: 'Confirmed', RESCHEDULED: 'Rescheduled', ATTENDED: 'Attended', NO_SHOW: 'No-show', CANCELLED: 'Cancelled',
};

export const MEETING_OUTCOME_LABELS: Record<MeetingOutcome, string> = {
  PENDING: 'Pending', QUALIFIED_OPPORTUNITY: 'Qualified opportunity', NOT_QUALIFIED: 'Not qualified', WON: 'Won', LOST: 'Lost',
};

export const REPLY_CLASSES = ['UNCLASSIFIED', 'POSITIVE', 'NEUTRAL', 'NEGATIVE', 'OUT_OF_OFFICE', 'REFERRAL', 'UNSUBSCRIBE'] as const satisfies readonly ReplyClass[];

export const REPLY_CLASS_LABELS: Record<ReplyClass, string> = {
  UNCLASSIFIED: 'Unclassified', POSITIVE: 'Positive', NEUTRAL: 'Neutral', NEGATIVE: 'Not interested',
  OUT_OF_OFFICE: 'Out of office', REFERRAL: 'Referral', UNSUBSCRIBE: 'Unsubscribe',
};

export function humanize(value: string) {
  return value.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export function personName(c: { firstName: string | null; lastName: string | null; email?: string | null }) {
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || 'Unnamed contact';
}
