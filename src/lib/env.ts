import { z } from 'zod';

/**
 * Environment is validated in two tiers, because a single all-or-nothing schema
 * meant an unset Stripe key took down unrelated pages: anything that touched
 * env() re-validated every variable and threw on the first missing one.
 *
 * Core vars are the ones the app genuinely cannot serve a request without.
 * Everything else belongs to one optional integration, stays undefined when
 * absent, and is demanded only at the point of use via requireEnv() — so a
 * workspace with no Stripe account still gets working demo sites.
 */
const coreSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url(),

  DATABASE_URL: z.string().url(),
  DIRECT_DATABASE_URL: z.string().url(),

  CLERK_SECRET_KEY: z.string().startsWith('sk_'),
  CLERK_WEBHOOK_SECRET: z.string().min(1),

  AI_MONTHLY_BUDGET_CENTS: z.coerce.number().int().positive().default(50_000),
});

const optionalSchema = z.object({
  PORTFOLIO_ROOT_DOMAIN: z.string().min(3).optional(),

  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),

  RESEND_API_KEY: z.string().startsWith('re_').optional(),
  RESEND_WEBHOOK_SECRET: z.string().min(1).optional(),

  STRIPE_SECRET_KEY: z.string().startsWith('sk_').optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_').optional(),

  GOOGLE_PLACES_API_KEY: z.string().optional(),
  APOLLO_API_KEY: z.string().optional(),

  ENCRYPTION_KEY: z.string().length(44, 'must be a base64-encoded 32-byte key').optional(),
  UNSUBSCRIBE_SIGNING_KEY: z.string().min(32).optional(),
  CRON_SECRET: z.string().min(16).optional(),
});

const schema = coreSchema.merge(optionalSchema);

export type Env = z.infer<typeof schema>;
export type OptionalEnvKey = keyof z.infer<typeof optionalSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${missing}`);
  }
  cached = parsed.data;
  return cached;
}

/**
 * Thrown when a feature is used without its integration configured. Carries the
 * variable name so the message tells an operator exactly what to add, rather
 * than surfacing a generic 500.
 */
export class FeatureNotConfiguredError extends Error {
  constructor(public feature: string, public variable: OptionalEnvKey) {
    super(`${feature} is not configured. Add ${variable} to your environment to enable it.`);
    this.name = 'FeatureNotConfiguredError';
  }
}

/** Reads an optional variable, throwing an actionable error when it is absent. */
export function requireEnv(variable: OptionalEnvKey, feature: string): string {
  const value = env()[variable];
  if (!value) throw new FeatureNotConfiguredError(feature, variable);
  return value;
}

/** Non-throwing check, so the UI can hide or explain a feature instead of failing. */
export function isConfigured(...variables: OptionalEnvKey[]): boolean {
  const current = env();
  return variables.every((v) => Boolean(current[v]));
}
