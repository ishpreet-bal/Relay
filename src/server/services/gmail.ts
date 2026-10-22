import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import type { Mailbox } from '@prisma/client';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { decryptSecret, encryptSecret } from '@/lib/crypto';
import { DomainError, NotConfiguredError, NotFoundError } from '@/server/errors';
import type { OutboundEmail } from '@/server/connectors/types';

/**
 * Sending from a real Gmail / Google Workspace mailbox.
 *
 * Connecting: Google OAuth (authorization code, offline access) with only
 * the gmail.send scope plus the user's email address. The state parameter
 * is signed and expires in ten minutes. The Google account that grants
 * access must be the mailbox's own address; the refresh token is stored
 * encrypted and never leaves the server.
 *
 * Sending goes through the same send gate as every other mailbox (see
 * services/email.ts); this module only builds the MIME message and hands it
 * to the Gmail API. Domain authentication is checked from DNS: Google
 * doesn't report it for a Workspace domain.
 */

export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.send', 'openid', 'email'];
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const STATE_TTL_MS = 10 * 60_000;

type Fetch = typeof fetch;

export function googleConfigured() {
  const e = env();
  return !!(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET);
}

function credentials() {
  const e = env();
  if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) throw new NotConfiguredError('google_workspace', 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to connect Gmail mailboxes.');
  return { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET, redirectUri: `${e.APP_URL}/api/oauth/google/callback` };
}

// ---------------------------------------------------------------------------
// Signed state
// ---------------------------------------------------------------------------

export interface OAuthState { organizationId: string; mailboxId: string; userId: string }

const stateKey = () => createHmac('sha256', Buffer.from(env().ENCRYPTION_KEY, 'base64')).update('gmail-oauth-state').digest();

export function signState(s: OAuthState, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ ...s, n: randomBytes(8).toString('hex'), e: now + STATE_TTL_MS })).toString('base64url');
  const sig = createHmac('sha256', stateKey()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyState(token: string, now = Date.now()): OAuthState | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = Buffer.from(createHmac('sha256', stateKey()).update(body).digest('base64url'));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthState & { e: number };
    return p.e > now ? { organizationId: p.organizationId, mailboxId: p.mailboxId, userId: p.userId } : null;
  } catch {
    return null;
  }
}

export function authorizationUrl(state: OAuthState, loginHint: string) {
  const c = credentials();
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: c.clientId, redirect_uri: c.redirectUri, response_type: 'code', scope: GMAIL_SCOPES.join(' '),
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false', login_hint: loginHint, state: signState(state),
  }).toString();
  return url.toString();
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

interface TokenResponse { access_token?: string; refresh_token?: string; id_token?: string; scope?: string; error?: string; error_description?: string }

async function tokenRequest(params: Record<string, string>, fetchImpl: Fetch): Promise<TokenResponse> {
  const res = await fetchImpl(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString(), signal: AbortSignal.timeout(15_000) });
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || body.error) throw new DomainError(`Google refused the request: ${body.error_description ?? body.error ?? res.status}`);
  return body;
}

/**
 * The id_token comes straight from Google's token endpoint over TLS, so its
 * claims are taken without checking the signature (OpenID Connect §3.1.3.7);
 * audience and issuer are still checked.
 */
export function idTokenEmail(idToken: string, clientId: string): string {
  const payload = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as { email?: string; email_verified?: boolean; aud?: string; iss?: string };
  if (payload.aud !== clientId || !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss ?? '')) throw new DomainError('The sign-in response was not issued for this app.');
  if (!payload.email || payload.email_verified === false) throw new DomainError('Google did not confirm an email address for this account.');
  return payload.email.toLowerCase();
}

/** Completes the OAuth callback: checks the state, exchanges the code, and connects the mailbox. */
export async function completeConnection(args: { code: string; state: string; sessionUserId: string; sessionOrganizationId: string }, fetchImpl: Fetch = fetch) {
  const state = verifyState(args.state);
  if (!state || state.userId !== args.sessionUserId || state.organizationId !== args.sessionOrganizationId) throw new DomainError('This connection link expired or was started by someone else. Start again from Settings.');
  const mailbox = await db.mailbox.findFirst({ where: { id: state.mailboxId, organizationId: state.organizationId } });
  if (!mailbox) throw new NotFoundError('Mailbox');
  const c = credentials();
  const tokens = await tokenRequest({ code: args.code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: c.redirectUri, grant_type: 'authorization_code' }, fetchImpl);
  if (!tokens.id_token) throw new DomainError('Google did not return the account identity.');
  const email = idTokenEmail(tokens.id_token, c.clientId);
  // Send only as the address the mailbox claims to be.
  if (email !== mailbox.fromEmail.toLowerCase()) {
    await db.mailbox.update({ where: { id: mailbox.id }, data: { oauthError: `Connected Google account ${email} is not ${mailbox.fromEmail}.` } });
    throw new DomainError(`You signed in as ${email}, but this mailbox sends as ${mailbox.fromEmail}. Sign in with that account.`);
  }
  const scopes = (tokens.scope ?? '').split(' ').filter(Boolean);
  if (!scopes.includes(GMAIL_SCOPES[0]!)) throw new DomainError('Permission to send email was not granted.');
  if (!tokens.refresh_token) throw new DomainError('Google did not return offline access. Remove Relay from your Google account permissions and connect again.');
  return db.mailbox.update({
    where: { id: mailbox.id },
    data: { provider: 'GMAIL', oauthRefreshTokenEnc: encryptSecret(tokens.refresh_token), oauthEmail: email, oauthScopes: scopes, oauthConnectedAt: new Date(), oauthError: null },
  });
}

async function accessToken(mailbox: Mailbox, fetchImpl: Fetch) {
  if (!mailbox.oauthRefreshTokenEnc) throw new DomainError(`${mailbox.fromEmail} is not connected to Gmail.`);
  const c = credentials();
  try {
    const t = await tokenRequest({ client_id: c.clientId, client_secret: c.clientSecret, refresh_token: decryptSecret(mailbox.oauthRefreshTokenEnc), grant_type: 'refresh_token' }, fetchImpl);
    if (!t.access_token) throw new DomainError('Google returned no access token.');
    return t.access_token;
  } catch (err) {
    // A revoked or expired grant needs the owner to reconnect; record why.
    await db.mailbox.update({ where: { id: mailbox.id }, data: { oauthError: err instanceof Error ? err.message.slice(0, 300) : 'Token refresh failed' } });
    throw err;
  }
}

export async function disconnectGmail(organizationId: string, mailboxId: string, fetchImpl: Fetch = fetch) {
  const mailbox = await db.mailbox.findFirst({ where: { id: mailboxId, organizationId } });
  if (!mailbox) throw new NotFoundError('Mailbox');
  if (mailbox.oauthRefreshTokenEnc) {
    // Best effort: revoke at Google too.
    await fetchImpl(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decryptSecret(mailbox.oauthRefreshTokenEnc))}`, { method: 'POST', signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
  }
  return db.mailbox.update({ where: { id: mailbox.id }, data: { provider: 'RESEND', oauthRefreshTokenEnc: null, oauthEmail: null, oauthScopes: [], oauthConnectedAt: null, oauthError: null, isActive: false } });
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

/** RFC 2047 for headers that aren't plain ASCII. */
const encodeHeader = (v: string) => (/^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, 'utf8').toString('base64')}?=`);
const noBreaks = (v: string) => v.replace(/[\r\n]+/g, ' ');
const wrap76 = (b64: string) => b64.replace(/.{1,76}/g, (m) => `${m}\r\n`).trimEnd();

/** A multipart/alternative message (text and HTML), base64 bodies, CRLF line endings. */
export function buildMime(email: OutboundEmail, boundary = `relay_${randomBytes(12).toString('hex')}`) {
  const headers: Record<string, string> = {
    From: email.from, To: email.to, ...(email.replyTo ? { 'Reply-To': email.replyTo } : {}), Subject: encodeHeader(email.subject),
    'MIME-Version': '1.0', 'Content-Type': `multipart/alternative; boundary="${boundary}"`, ...(email.headers ?? {}),
  };
  const head = Object.entries(headers).map(([k, v]) => `${k}: ${noBreaks(v)}`).join('\r\n');
  const part = (type: string, body: string) => [`--${boundary}`, `Content-Type: ${type}; charset="UTF-8"`, 'Content-Transfer-Encoding: base64', '', wrap76(Buffer.from(body, 'utf8').toString('base64'))].join('\r\n');
  return [head, '', part('text/plain', email.text ?? ''), part('text/html', email.html ?? ''), `--${boundary}--`, ''].join('\r\n');
}

export async function sendViaGmail(mailbox: Mailbox, email: OutboundEmail, fetchImpl: Fetch = fetch): Promise<{ providerMessageId: string | null; costMillicents: number }> {
  const token = await accessToken(mailbox, fetchImpl);
  const res = await fetchImpl(SEND_URL, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ raw: Buffer.from(buildMime(email), 'utf8').toString('base64url') }), signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!res.ok) throw new Error(`Gmail refused the message: ${body.error?.message ?? res.status}`);
  return { providerMessageId: body.id ?? null, costMillicents: 0 };
}

// ---------------------------------------------------------------------------
// Domain authentication from DNS
// ---------------------------------------------------------------------------

type Resolver = (host: string) => Promise<string[][]>;
const GOOGLE_CONSUMER_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

/** SPF includes Google's servers and Google's DKIM key is published (selector "google"). */
export async function gmailDomainStatus(domain: string, resolve: Resolver = resolveTxt) {
  // Google signs and authorizes mail from its own consumer domains under its own selectors.
  if (GOOGLE_CONSUMER_DOMAINS.has(domain.toLowerCase())) {
    return { spf: true, dkim: true, detail: `Google authenticates mail sent from ${domain.toLowerCase()} addresses` };
  }
  const txt = async (host: string) => (await resolve(host).catch(() => [])).map((chunks) => chunks.join(''));
  const [root, dkim] = await Promise.all([txt(domain), txt(`google._domainkey.${domain}`)]);
  const spfRecord = root.find((r) => r.toLowerCase().startsWith('v=spf1'));
  const spf = !!spfRecord && /(include|redirect)[:=]_spf\.google\.com/i.test(spfRecord);
  const dkimOk = dkim.some((r) => /v=DKIM1/i.test(r) && /p=[A-Za-z0-9+/]/.test(r));
  return {
    spf, dkim: dkimOk,
    detail: [spf ? 'SPF includes Google' : spfRecord ? 'SPF record does not include _spf.google.com' : 'No SPF record', dkimOk ? 'Google DKIM key published' : 'No DKIM key at google._domainkey'].join('; '),
  };
}

/** What a browser may see of a mailbox: never the token. */
export function publicMailbox(m: Mailbox) {
  const { oauthRefreshTokenEnc, ...rest } = m;
  return { ...rest, gmailConnected: !!oauthRefreshTokenEnc };
}
