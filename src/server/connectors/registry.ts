import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { NotConfiguredError } from '@/server/errors';
import { recordUsage } from '@/server/services/usage';
import { findCachedRecord, recordProviderCall } from './records';
import type { Capability, ConnectorDefinition, ProviderContext, ProviderResult } from './types';
import { apolloConnector } from './providers/apollo';
import { googlePlacesConnector } from './providers/google-places';
import { resendConnector } from './providers/resend';

/**
 * Every connector Relay knows about, including the ones designed for but
 * not built yet. A connector is usable only when it is implemented, its
 * credentials are present, and the workspace has not disabled it. The UI shows
 * the honest state of each — "not configured" is never dressed up as data.
 */

const companyWebsite: ConnectorDefinition = {
  id: 'company_website',
  name: 'Company website',
  capabilities: ['RESEARCH_SOURCE'],
  description: "Reads up to eight pages of a prospect's own site (robots.txt respected) as the evidence base for research.",
  requiredEnv: [],
  implemented: true,
  defaultPriority: 10,
};

const anthropic: ConnectorDefinition = {
  id: 'anthropic',
  name: 'Anthropic',
  capabilities: ['AI'],
  description: 'Research, drafting and verification models. Every call is budgeted and logged.',
  requiredEnv: ['ANTHROPIC_API_KEY'],
  implemented: true,
  docsUrl: 'https://docs.anthropic.com',
  defaultPriority: 10,
};

const openai: ConnectorDefinition = {
  id: 'openai',
  name: 'OpenAI',
  capabilities: ['AI'],
  description: 'Fallback model provider when Anthropic is unavailable.',
  requiredEnv: ['OPENAI_API_KEY'],
  implemented: true,
  defaultPriority: 20,
};

function planned(id: string, name: string, capabilities: Capability[], description: string, requiredEnv: string[]): ConnectorDefinition {
  return { id, name, capabilities, description, requiredEnv, implemented: false, defaultPriority: 50 };
}

export const CONNECTORS: readonly ConnectorDefinition[] = [
  companyWebsite,
  googlePlacesConnector,
  apolloConnector,
  planned('hunter', 'Hunter', ['EMAIL_FINDER', 'EMAIL_VERIFICATION'], 'Email finding and verification.', ['HUNTER_API_KEY']),
  planned('zerobounce', 'ZeroBounce', ['EMAIL_VERIFICATION'], 'Email deliverability verification before sending.', ['ZEROBOUNCE_API_KEY']),
  resendConnector,
  planned('google_workspace', 'Gmail / Google Calendar', ['EMAIL_SENDING', 'CALENDAR'], 'Send from a real Gmail inbox and book meetings on Google Calendar.', ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']),
  planned('microsoft_365', 'Outlook / Microsoft Calendar', ['EMAIL_SENDING', 'CALENDAR'], 'Send from Outlook and book meetings on Microsoft calendars.', ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET']),
  planned('twilio', 'Twilio', ['PHONE'], 'Click-to-call, call recording and SMS.', ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN']),
  planned('hubspot', 'HubSpot', ['CRM'], 'Push qualified accounts, contacts and meetings into the client\'s CRM.', ['HUBSPOT_PRIVATE_APP_TOKEN']),
  planned('salesforce', 'Salesforce', ['CRM'], 'Push qualified accounts, contacts and meetings into Salesforce.', ['SALESFORCE_CLIENT_ID', 'SALESFORCE_CLIENT_SECRET']),
  anthropic,
  openai,
];

export function connectorById(id: string) {
  return CONNECTORS.find((c) => c.id === id) ?? null;
}

export function missingEnv(def: ConnectorDefinition): string[] {
  return def.requiredEnv.filter((k) => !process.env[k]);
}

export interface ConnectorState {
  id: string;
  name: string;
  description: string;
  capabilities: Capability[];
  implemented: boolean;
  configured: boolean;
  enabled: boolean;
  usable: boolean;
  priority: number;
  missingEnv: string[];
  docsUrl: string | null;
  lastCheckedAt: Date | null;
  lastError: string | null;
  hasHealthCheck: boolean;
}

export async function connectorStates(organizationId: string): Promise<ConnectorState[]> {
  const settings = await db.connectorSetting.findMany({ where: { organizationId } });
  const byId = new Map(settings.map((s) => [s.provider, s]));
  return CONNECTORS.map((def) => {
    const s = byId.get(def.id);
    const missing = missingEnv(def);
    const enabled = s?.enabled ?? true;
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      capabilities: def.capabilities,
      implemented: def.implemented,
      configured: missing.length === 0,
      enabled,
      usable: def.implemented && missing.length === 0 && enabled,
      priority: s?.priority ?? def.defaultPriority,
      missingEnv: missing,
      docsUrl: def.docsUrl ?? null,
      lastCheckedAt: s?.lastCheckedAt ?? null,
      lastError: s?.lastError ?? null,
      hasHealthCheck: !!def.healthCheck,
    };
  });
}

/** Usable providers for a capability, in fallback order. */
export async function chainFor(organizationId: string, capability: Capability): Promise<ConnectorDefinition[]> {
  const states = await connectorStates(organizationId);
  return states
    .filter((s) => s.usable && s.capabilities.includes(capability))
    .sort((a, b) => a.priority - b.priority)
    .map((s) => connectorById(s.id)!);
}

export async function isCapabilityAvailable(organizationId: string, capability: Capability) {
  return (await chainFor(organizationId, capability)).length > 0;
}

export interface ChainOutcome<T> {
  result: ProviderResult<T>;
  provider: string;
  providerRecordId: string | null;
  cached: boolean;
}

/**
 * Runs a lookup down the fallback chain: first provider that succeeds wins.
 * Each provider's cached answer is reused when fresh (including a cached "not
 * found", so a miss is not paid for twice). Every live call is recorded with
 * its cost.
 */
export async function runChain<T>(
  ctx: ProviderContext,
  capability: Capability,
  op: { operation: string; lookupKey: string; ttlDays: number; usageType?: 'ENRICHMENT_REQUEST' | 'EMAIL_VERIFICATION' | 'PHONE_LOOKUP' | 'EXTERNAL_DATA' },
  call: (def: ConnectorDefinition) => Promise<ProviderResult<T>> | null,
): Promise<ChainOutcome<T>> {
  const chain = await chainFor(ctx.organizationId, capability);
  if (!chain.length) {
    throw new NotConfiguredError(capability, `No ${capability.toLowerCase().replace(/_/g, ' ')} provider is connected. Configure one under Connectors.`);
  }

  let last: ChainOutcome<T> | null = null;
  for (const def of chain) {
    const cached = await findCachedRecord({ organizationId: ctx.organizationId, provider: def.id, operation: op.operation, lookupKey: op.lookupKey });
    if (cached) {
      const outcome: ChainOutcome<T> = {
        result: { status: cached.status, data: (cached.normalized ?? undefined) as T | undefined, externalId: cached.externalId, confidence: cached.confidence, costMillicents: 0 },
        provider: def.id,
        providerRecordId: cached.id,
        cached: true,
      };
      if (cached.status === 'SUCCESS') return outcome;
      last = outcome;
      continue;
    }

    const pending = call(def);
    if (!pending) continue; // this provider does not support the operation
    let result: ProviderResult<T>;
    try {
      result = await pending;
    } catch (err) {
      result = { status: 'ERROR', costMillicents: 0, error: err instanceof Error ? err.message : 'Request failed' };
    }

    const record = await recordProviderCall({
      organizationId: ctx.organizationId,
      clientId: ctx.clientId,
      accountId: ctx.accountId,
      contactId: ctx.contactId,
      provider: def.id,
      operation: op.operation,
      lookupKey: op.lookupKey,
      status: result.status,
      externalId: result.externalId ?? null,
      response: (result.raw ?? null) as Prisma.InputJsonValue,
      normalized: (result.data ?? null) as Prisma.InputJsonValue,
      confidence: result.confidence ?? null,
      costMillicents: result.costMillicents,
      error: result.error ?? null,
      ttlDays: result.status === 'ERROR' ? undefined : op.ttlDays,
    });
    await recordUsage({
      organizationId: ctx.organizationId,
      clientId: ctx.clientId, accountId: ctx.accountId, contactId: ctx.contactId,
      provider: def.id,
      type: op.usageType ?? 'ENRICHMENT_REQUEST',
      costMillicents: result.costMillicents,
      providerRecordId: record?.id,
      metadata: { operation: op.operation, status: result.status },
    });
    if (result.status === 'ERROR') {
      logger.warn('connector.error', { provider: def.id, operation: op.operation, error: result.error });
      await db.connectorSetting.upsert({
        where: { organizationId_provider: { organizationId: ctx.organizationId, provider: def.id } },
        create: { organizationId: ctx.organizationId, provider: def.id, lastError: result.error?.slice(0, 500), lastCheckedAt: new Date() },
        update: { lastError: result.error?.slice(0, 500), lastCheckedAt: new Date() },
      });
    }

    const outcome: ChainOutcome<T> = { result, provider: def.id, providerRecordId: record?.id ?? null, cached: false };
    if (result.status === 'SUCCESS') return outcome;
    last = outcome;
  }
  if (!last) throw new NotConfiguredError(capability, `No connected provider supports ${op.operation}.`);
  return last;
}
