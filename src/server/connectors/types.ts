import type { DataSource, EmailVerification, Seniority } from '@prisma/client';

/**
 * Relay is an orchestration layer over data and communication providers.
 * Each capability below is an interface; providers implement the ones they
 * support and are chosen at runtime by the registry, in the order a workspace
 * configures (a fallback chain). Nothing outside src/server/connectors knows
 * which vendor answered.
 */

export type Capability =
  | 'COMPANY_DISCOVERY'
  | 'COMPANY_DATA'
  | 'CONTACT_DATA'
  | 'EMAIL_FINDER'
  | 'EMAIL_VERIFICATION'
  | 'PHONE_DATA'
  | 'RESEARCH_SOURCE'
  | 'EMAIL_SENDING'
  | 'PHONE'
  | 'CALENDAR'
  | 'CRM'
  | 'AI';

export interface ProviderContext {
  organizationId: string;
  clientId?: string | null;
  accountId?: string | null;
  contactId?: string | null;
}

export type ProviderStatus = 'SUCCESS' | 'NOT_FOUND' | 'ERROR';

export interface ProviderResult<T> {
  status: ProviderStatus;
  data?: T;
  externalId?: string | null;
  confidence?: number | null;
  costMillicents: number;
  /** The provider's own response, kept for provenance. */
  raw?: unknown;
  error?: string;
}

export interface CompanyProfile {
  name: string | null;
  domain: string | null;
  websiteUrl: string | null;
  linkedinUrl: string | null;
  phone: string | null;
  industry: string | null;
  employeeCount: number | null;
  employeeRange: string | null;
  revenueRange: string | null;
  description: string | null;
  foundedYear: number | null;
  city: string | null;
  region: string | null;
  country: string | null;
  keywords: string[];
  techStack: string[];
}

export interface ContactCandidate {
  externalId: string | null;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  seniority: Seniority | null;
  department: string | null;
  email: string | null;
  emailVerification: EmailVerification | null;
  phone: string | null;
  directPhone: string | null;
  mobilePhone: string | null;
  linkedinUrl: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
}

export interface CompanyProvider {
  enrichCompany(input: { domain: string; name?: string | null }, ctx: ProviderContext): Promise<ProviderResult<CompanyProfile>>;
}

export interface ContactProvider {
  findContacts(
    input: { domain: string; titles: string[]; seniorities: Seniority[]; limit: number },
    ctx: ProviderContext,
  ): Promise<ProviderResult<ContactCandidate[]>>;
}

export interface EmailFinderProvider {
  findEmail(
    input: { firstName: string; lastName: string; domain: string; externalId?: string | null },
    ctx: ProviderContext,
  ): Promise<ProviderResult<{ email: string; verification: EmailVerification }>>;
}

export interface EmailVerificationProvider {
  verifyEmail(input: { email: string }, ctx: ProviderContext): Promise<ProviderResult<{ verification: EmailVerification }>>;
}

export interface PhoneDataProvider {
  findPhone(
    input: { firstName: string; lastName: string; domain: string; externalId?: string | null },
    ctx: ProviderContext,
  ): Promise<ProviderResult<{ directPhone: string | null; mobilePhone: string | null }>>;
}

/** One search against a discovery source: a category in a place. */
export interface DiscoveryQuery {
  /** Free-text form, e.g. "machine shop in Mississauga, ON, Canada". */
  text: string;
  industry: string | null;
  city: string | null;
  region: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  radiusKm: number | null;
  employeeMin: number | null;
  employeeMax: number | null;
  keywords: string[];
  /** For structured sources: every place to search, in one request. */
  locations: string[];
  pageSize: number;
  pageToken: string | null;
}

/**
 * A business as a source reports it. Only business facts: no personal data
 * is requested from discovery sources.
 */
export interface DiscoveredCompany {
  externalId: string;
  name: string;
  websiteUrl: string | null;
  phone: string | null;
  addressLine: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  industry: string | null;
  categories: string[];
  employeeCount: number | null;
  linkedinUrl: string | null;
  description: string | null;
  foundedYear: number | null;
  /** OPERATIONAL, CLOSED_TEMPORARILY, CLOSED_PERMANENTLY, or null when unknown. */
  businessStatus: string | null;
  /** The source's own page for this business, for attribution. */
  sourceUrl: string | null;
}

export interface DiscoveryPage {
  companies: DiscoveredCompany[];
  nextPageToken: string | null;
}

export interface DiscoveryProvider {
  source: DataSource;
  /**
   * text: one free-text search per category and place (map-style sources).
   * structured: one filtered search across all categories and places.
   */
  queryStyle: 'text' | 'structured';
  /**
   * licensed: results may be stored as the account record (under your
   * subscription's terms).
   * locate-only: results may only be used to find the business; the record
   * is built from its own website, and only the source's id is kept.
   */
  storage: 'licensed' | 'locate-only';
  /** Days this source's coordinates may be cached, when it allows that at all. */
  coordinateRetentionDays: number | null;
  /** Most pages one query may be paged through. */
  maxPages: number;
  /** Cost of one request, and whether that figure is an estimate. */
  requestCost(): { millicents: number; isEstimate: boolean };
  search(query: DiscoveryQuery): Promise<ProviderResult<DiscoveryPage>>;
}

export interface OutboundEmail {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
}

export interface DomainAuthStatus {
  /** The provider knows this sending domain. */
  found: boolean;
  spf: boolean;
  dkim: boolean;
  detail: string;
}

export interface EmailSendingProvider {
  send(email: OutboundEmail): Promise<{ providerMessageId: string | null; costMillicents: number }>;
  /** SPF/DKIM state of a sending domain as the provider sees it. */
  domainStatus?(domain: string): Promise<DomainAuthStatus>;
}

/** Placeholders for integrations designed but not built. */
export interface CalendarProvider {
  createEvent(input: { title: string; startsAt: Date; endsAt: Date; attendees: string[]; description?: string }, ctx: ProviderContext):
    Promise<ProviderResult<{ eventId: string; meetingUrl: string | null }>>;
}

export interface CrmProvider {
  upsertCompany(input: { domain: string | null; name: string }, ctx: ProviderContext): Promise<ProviderResult<{ id: string }>>;
  upsertContact(input: { email: string | null; firstName: string | null; lastName: string | null }, ctx: ProviderContext): Promise<ProviderResult<{ id: string }>>;
}

export interface DialerProvider {
  startCall(input: { to: string; from: string; callerUserId: string }, ctx: ProviderContext): Promise<ProviderResult<{ callId: string }>>;
}

export interface ConnectorDefinition {
  id: string;
  name: string;
  capabilities: Capability[];
  description: string;
  /** Environment variables that must be set for this connector to work. */
  requiredEnv: string[];
  /** Whether an adapter exists in this codebase. */
  implemented: boolean;
  docsUrl?: string;
  /** Default position in fallback chains (lower runs first). */
  defaultPriority: number;
  discovery?: DiscoveryProvider;
  company?: CompanyProvider;
  contacts?: ContactProvider;
  emailFinder?: EmailFinderProvider;
  emailVerification?: EmailVerificationProvider;
  phoneData?: PhoneDataProvider;
  emailSending?: EmailSendingProvider;
  /** A cheap authenticated call proving the credentials work. */
  healthCheck?: () => Promise<{ ok: boolean; detail: string }>;
}
