import { z } from 'zod';

/**
 * Fail fast at boot rather than at 2am inside a worker. Server-only vars are
 * validated lazily so that client bundles never pull them in.
 */
const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url(),
  PORTFOLIO_ROOT_DOMAIN: z.string().min(3),

  DATABASE_URL: z.string().url(),
  DIRECT_DATABASE_URL: z.string().url(),

  CLERK_SECRET_KEY: z.string().startsWith('sk_'),
  CLERK_WEBHOOK_SECRET: z.string().min(1),

  ANTHROPIC_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1).optional(),
  AI_MONTHLY_BUDGET_CENTS: z.coerce.number().int().positive().default(50_000),

  RESEND_API_KEY: z.string().startsWith('re_'),
  RESEND_WEBHOOK_SECRET: z.string().min(1),

  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_'),

  GOOGLE_PLACES_API_KEY: z.string().optional(),
  APOLLO_API_KEY: z.string().optional(),

  ENCRYPTION_KEY: z.string().length(44, 'must be a base64-encoded 32-byte key'),
  UNSUBSCRIBE_SIGNING_KEY: z.string().min(32),
  CRON_SECRET: z.string().min(16),
});

let cached: z.infer<typeof serverSchema> | null = null;

export function env() {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${missing}`);
  }
  cached = parsed.data;
  return cached;
}
