import type { EmailVerification } from '@prisma/client';
import type { ConnectorDefinition, EmailVerificationProvider, ProviderResult } from '../types';

/**
 * Email verification adapters: ZeroBounce and Hunter. A result is only ever
 * what the provider reported; "couldn't tell" stays UNVERIFIED rather than
 * being guessed either way, and only VALID counts as verified anywhere in
 * Relay. Costs are your plan's price per check (env), marked as estimates
 * when unset.
 *
 * Built against each provider's public REST API; run the connector's check
 * before relying on it.
 */

type Fetch = typeof fetch;

async function getJson(url: string, fetchImpl: Fetch) {
  const res = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* error page */ }
  return { status: res.status, ok: res.ok, json, text: text.slice(0, 300) };
}

const perCheck = (envName: string, fallback: number) => {
  const v = Number(process.env[envName] ?? NaN);
  return Number.isFinite(v) && v >= 0 ? { millicents: v, estimate: false } : { millicents: fallback, estimate: true };
};

// ---------------------------------------------------------------------------
// ZeroBounce
// ---------------------------------------------------------------------------

/** ZeroBounce status → Relay. Spam traps, abuse and do-not-mail are never sent to. */
export function zeroBounceStatus(status: string | undefined | null): EmailVerification {
  switch ((status ?? '').toLowerCase()) {
    case 'valid': return 'VALID';
    case 'catch-all': return 'CATCH_ALL';
    case 'invalid': case 'spamtrap': case 'abuse': case 'do_not_mail': return 'INVALID';
    default: return 'UNVERIFIED';
  }
}

export function zeroBounceVerifier(fetchImpl: Fetch = fetch): EmailVerificationProvider {
  return {
    async verifyEmail({ email }): Promise<ProviderResult<{ verification: EmailVerification }>> {
      const key = process.env.ZEROBOUNCE_API_KEY;
      if (!key) return { status: 'ERROR', costMillicents: 0, error: 'ZEROBOUNCE_API_KEY is not configured' };
      const url = `https://api.zerobounce.net/v2/validate?api_key=${encodeURIComponent(key)}&email=${encodeURIComponent(email)}&ip_address=`;
      const r = await getJson(url, fetchImpl);
      const body = r.json as { status?: string; sub_status?: string; error?: string } | null;
      if (!r.ok || !body || body.error) return { status: 'ERROR', costMillicents: 0, error: body?.error ?? `ZeroBounce responded ${r.status}`, raw: body ?? r.text };
      const verification = zeroBounceStatus(body.status);
      return { status: 'SUCCESS', data: { verification }, confidence: verification === 'VALID' ? 0.95 : null, costMillicents: perCheck('ZEROBOUNCE_COST_PER_CHECK_MILLICENTS', 800).millicents, raw: body };
    },
  };
}

export const zeroBounceConnector: ConnectorDefinition = {
  id: 'zerobounce',
  name: 'ZeroBounce',
  capabilities: ['EMAIL_VERIFICATION'],
  description: 'Email deliverability verification before sending. Spam traps and do-not-mail addresses are marked invalid.',
  requiredEnv: ['ZEROBOUNCE_API_KEY'],
  implemented: true,
  docsUrl: 'https://www.zerobounce.net/docs/email-validation-api-quickstart',
  defaultPriority: 20,
  emailVerification: zeroBounceVerifier(),
  async healthCheck() {
    const key = process.env.ZEROBOUNCE_API_KEY;
    if (!key) return { ok: false, detail: 'ZEROBOUNCE_API_KEY is not set' };
    try {
      const r = await getJson(`https://api.zerobounce.net/v2/getcredits?api_key=${encodeURIComponent(key)}`, fetch);
      const credits = Number((r.json as { Credits?: string } | null)?.Credits ?? NaN);
      return r.ok && Number.isFinite(credits) && credits >= 0 ? { ok: true, detail: `API key accepted, ${credits} credits left` } : { ok: false, detail: `ZeroBounce responded ${r.status}` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : 'Request failed' };
    }
  },
};

// ---------------------------------------------------------------------------
// Hunter
// ---------------------------------------------------------------------------

/** Hunter status → Relay. Personal webmail is risky for B2B outreach; disposable is invalid. */
export function hunterStatus(status: string | undefined | null): EmailVerification {
  switch ((status ?? '').toLowerCase()) {
    case 'valid': return 'VALID';
    case 'accept_all': return 'CATCH_ALL';
    case 'webmail': return 'RISKY';
    case 'invalid': case 'disposable': return 'INVALID';
    default: return 'UNVERIFIED';
  }
}

export function hunterVerifier(fetchImpl: Fetch = fetch): EmailVerificationProvider {
  return {
    async verifyEmail({ email }): Promise<ProviderResult<{ verification: EmailVerification }>> {
      const key = process.env.HUNTER_API_KEY;
      if (!key) return { status: 'ERROR', costMillicents: 0, error: 'HUNTER_API_KEY is not configured' };
      const r = await getJson(`https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${encodeURIComponent(key)}`, fetchImpl);
      // 202: Hunter is still verifying; try again later rather than guess.
      if (r.status === 202) return { status: 'ERROR', costMillicents: 0, error: 'Hunter is still verifying this address; try again shortly', raw: r.json };
      const body = r.json as { data?: { status?: string; score?: number }; errors?: Array<{ details?: string }> } | null;
      if (!r.ok || !body?.data) return { status: 'ERROR', costMillicents: 0, error: body?.errors?.[0]?.details ?? `Hunter responded ${r.status}`, raw: body ?? r.text };
      const verification = hunterStatus(body.data.status);
      return {
        status: 'SUCCESS', data: { verification }, confidence: typeof body.data.score === 'number' ? body.data.score / 100 : null,
        costMillicents: perCheck('HUNTER_COST_PER_CHECK_MILLICENTS', 1000).millicents, raw: body,
      };
    },
  };
}

export const hunterConnector: ConnectorDefinition = {
  id: 'hunter',
  name: 'Hunter',
  capabilities: ['EMAIL_VERIFICATION'],
  description: 'Email verification. (Email finding through Hunter is not built; Apollo covers it.)',
  requiredEnv: ['HUNTER_API_KEY'],
  implemented: true,
  docsUrl: 'https://hunter.io/api-documentation/v2#email-verifier',
  defaultPriority: 30,
  emailVerification: hunterVerifier(),
  async healthCheck() {
    const key = process.env.HUNTER_API_KEY;
    if (!key) return { ok: false, detail: 'HUNTER_API_KEY is not set' };
    try {
      const r = await getJson(`https://api.hunter.io/v2/account?api_key=${encodeURIComponent(key)}`, fetch);
      return r.ok ? { ok: true, detail: 'API key accepted' } : { ok: false, detail: `Hunter responded ${r.status}` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : 'Request failed' };
    }
  },
};
