import { z } from 'zod';

/**
 * Fail fast at boot rather than at 2am inside a worker. Server-only vars are
 * validated lazily so that client bundles never pull them in.
 *
 * Only what the core needs is required. Provider keys (AI, email, billing,
 * data) are optional here: a missing one makes that connector "not
 * configured" (see server/connectors/registry.ts) instead of taking down
 * unrelated features. A key that is present must still be well-formed.
 */
const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url(),
  PORTFOLIO_ROOT_DOMAIN: z.string().min(3).optional(),

  DATABASE_URL: z.string().url(),
  DIRECT_DATABASE_URL: z.string().url(),

  CLERK_SECRET_KEY: z.string().startsWith('sk_'),
  CLERK_WEBHOOK_SECRET: z.string().min(1),

  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  /** Needed only for an API key that isn't scoped to a workspace: the workspace its requests run in. */
  ANTHROPIC_WORKSPACE_ID: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  AI_MONTHLY_BUDGET_CENTS: z.coerce.number().int().positive().default(50_000),

  RESEND_API_KEY: z.string().startsWith('re_').optional(),
  RESEND_WEBHOOK_SECRET: z.string().min(1).optional(),

  STRIPE_SECRET_KEY: z.string().startsWith('sk_').optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_').optional(),
  /** Customer billing never charges live cards unless this is exactly "enabled" (test keys work without it). */
  CUSTOMER_BILLING_LIVE: z.enum(['enabled']).optional(),

  GOOGLE_PLACES_API_KEY: z.string().optional(),
  /** Google OAuth client (web) for sending from Gmail mailboxes. */
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  APOLLO_API_KEY: z.string().optional(),
  /** Shown on the public privacy policy as the address for access, correction and deletion requests. */
  PRIVACY_CONTACT_EMAIL: z.string().email().optional(),
  /** The public website's canonical address, once it has its own domain (defaults to APP_URL). */
  SITE_URL: z.string().url().optional(),
  /** The company's own email domain; the website then shows hello@, sales@ and support@ addresses on it. */
  SITE_EMAIL_DOMAIN: z.string().min(3).optional(),
  /** The client that receives website inquiries; defaults to the one internal client. */
  INQUIRY_CLIENT_ID: z.string().uuid().optional(),

  /** Who may create a workspace. Invite-only unless set to "open"; the first workspace can always be created. */
  SIGNUP_MODE: z.enum(['invite_only', 'open']).default('invite_only'),
  /** Comma-separated emails allowed to create further workspaces while sign-up is invite-only. */
  WORKSPACE_CREATOR_EMAILS: z.string().optional(),

  ENCRYPTION_KEY: z.string().length(44, 'must be a base64-encoded 32-byte key'),
  UNSUBSCRIBE_SIGNING_KEY: z.string().min(32),
  CRON_SECRET: z.string().min(16),
});

let cached: z.infer<typeof serverSchema> | null = null;

export function env() {
  if (cached) return cached;
  // A blank line in .env (KEY=) means "not set", not "set to empty".
  const values = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''));
  const parsed = serverSchema.safeParse(values);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${missing}`);
  }
  cached = parsed.data;
  return cached;
}
