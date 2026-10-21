import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { NotConfiguredError } from '@/server/errors';
import { costCents, costMillicents, MODELS, PRICING } from './pricing';
import { assertBudget } from './budget';
import { recordUsage, type UsageAttribution } from '@/server/services/usage';
import { logger } from '@/lib/logger';
import { ProviderUnavailableError, reportProviderResult, takeProviderSlot } from '@/server/queues/throttle';
import type { UsageType } from '@prisma/client';

export interface CompletionRequest {
  organizationId: string;
  /** What this call is for — becomes AiRun.kind and drives cost reporting. */
  kind: 'research' | 'deep_research' | 'personalize' | 'verify' | 'proposal' | 'portfolio' | 'classify';
  entityId?: string;
  /** Who the cost belongs to, for unit economics. */
  attribution?: UsageAttribution;
  promptVersion: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  /** Forces a JSON-only response and strips any stray prose or fences. */
  json?: boolean;
  /**
   * JSON Schema the response must match. On models that support structured
   * outputs it is enforced by the API; elsewhere the prompt must ask for it.
   */
  jsonSchema?: Record<string, unknown>;
  /** Thinking depth on current models; omit for the model's default. */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  model?: string;
  fallbackModel?: string;
}

export interface CompletionResult {
  text: string;
  provider: 'anthropic' | 'openai';
  model: string;
  tokensIn: number;
  tokensOut: number;
  costCents: number;
  latencyMs: number;
}

let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;

function anthropic() {
  const key = env().ANTHROPIC_API_KEY;
  if (!key) throw new NotConfiguredError('anthropic', 'No AI provider is connected. Set ANTHROPIC_API_KEY.');
  anthropicClient ??= new Anthropic({ apiKey: key, maxRetries: 0 });
  return anthropicClient;
}
function openai() {
  const key = env().OPENAI_API_KEY;
  if (!key) return null;
  openaiClient ??= new OpenAI({ apiKey: key, maxRetries: 0 });
  return openaiClient;
}

const USAGE_TYPE: Record<CompletionRequest['kind'], UsageType> = {
  research: 'AI_RESEARCH',
  deep_research: 'AI_DEEP_RESEARCH',
  personalize: 'AI_PERSONALIZATION',
  verify: 'AI_VERIFICATION',
  proposal: 'AI_OTHER',
  portfolio: 'AI_OTHER',
  classify: 'AI_OTHER',
};

const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 529]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Single entry point for every model call in the platform. It enforces budget,
 * retries transient failures with jittered backoff, falls back to the secondary
 * provider, and records an AiRun row whether the call succeeded or not — an
 * unlogged model call is an unbillable one.
 */
export async function complete(req: CompletionRequest): Promise<CompletionResult> {
  await assertBudget(req.organizationId);

  const primary = req.model ?? MODELS[req.kind === 'classify' ? 'classify' : 'research'];
  const run = await db.aiRun.create({
    data: {
      organizationId: req.organizationId,
      kind: req.kind,
      entityId: req.entityId ?? null,
      provider: 'anthropic',
      model: primary,
      promptVersion: req.promptVersion,
      status: 'RUNNING',
    },
  });

  const started = Date.now();
  try {
    let result: CompletionResult;
    try {
      result = await withRetries(() => throttledAnthropic(req, primary), 3);
    } catch (primaryError) {
      const fallback = req.fallbackModel ?? MODELS.fallbackResearch;
      if (!openai()) throw primaryError;
      logger.warn('ai.fallback', { kind: req.kind, fallback, error: primaryError });
      result = await withRetries(() => callOpenAI(req, fallback), 2);
    }

    await db.aiRun.update({
      where: { id: run.id },
      data: {
        status: 'COMPLETED',
        provider: result.provider,
        model: result.model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costCents: result.costCents,
        latencyMs: result.latencyMs,
      },
    });
    await recordUsage({
      organizationId: req.organizationId,
      ...req.attribution,
      provider: result.provider,
      type: USAGE_TYPE[req.kind],
      costMillicents: PRICING[result.model] ? costMillicents(result.model, result.tokensIn, result.tokensOut) : result.costCents * 1000,
      aiRunId: run.id,
      metadata: { model: result.model, tokensIn: result.tokensIn, tokensOut: result.tokensOut, promptVersion: req.promptVersion },
    });
    return result;
  } catch (err) {
    await db.aiRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        latencyMs: Date.now() - started,
        error: err instanceof Error ? err.message.slice(0, 500) : 'Unknown error',
      },
    });
    throw err;
  }
}

/**
 * One Anthropic call under the shared request budget and breaker. Only the
 * provider's own faults (network, 408/409/429/5xx) count toward opening the
 * breaker; a bad request is ours, not theirs.
 */
async function throttledAnthropic(req: CompletionRequest, model: string) {
  await takeProviderSlot('anthropic');
  try {
    const result = await callAnthropic(req, model);
    await reportProviderResult('anthropic', { ok: true });
    return result;
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (!status || RETRYABLE.has(status)) {
      await reportProviderResult('anthropic', {
        ok: false, error: err instanceof Error ? err.message : String(err),
        retryAfter: status === 429 ? new Date(Date.now() + 30_000) : undefined,
      });
    }
    throw err;
  }
}

async function withRetries<T>(fn: () => Promise<T>, attempts: number): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // A paused provider won't recover in seconds; let the caller reschedule.
      if (err instanceof ProviderUnavailableError) throw err;
      // The same request would refuse or truncate again.
      if (err instanceof ModelOutputError) throw err;
      const status = (err as { status?: number })?.status;
      if (status && !RETRYABLE.has(status)) throw err;
      if (i === attempts - 1) break;
      // Exponential backoff with jitter — a synchronized retry storm across a
      // batch of leads is how you turn one 429 into fifty.
      await sleep(Math.min(2 ** i * 1000, 8000) + Math.random() * 500);
    }
  }
  throw lastError;
}

/**
 * Current Claude models (Opus 4.7+, Sonnet 5+, Haiku 5.5, Fable, Mythos)
 * reject non-default sampling parameters and assistant-turn prefills with a
 * 400, and think adaptively by default (thinking counts toward max_tokens).
 */
export function hasModernRequestSurface(model: string) {
  return /^claude-(opus-(4-[78]|5)|sonnet-5|haiku-5|fable|mythos)/.test(model);
}

/** Opus 4.6 and Sonnet 4.6 already reject prefills but still accept temperature. */
function rejectsPrefill(model: string) {
  return hasModernRequestSurface(model) || /^claude-(opus|sonnet)-4-6/.test(model);
}

export class ModelOutputError extends Error {
  constructor(message: string, public reason: 'refusal' | 'max_tokens') {
    super(message);
    this.name = 'ModelOutputError';
  }
}

/**
 * Models that may decline some requests under their safeguards and accept a
 * server-side fallback: on a decline the API re-runs the request on a
 * fallback model in the same call instead of returning a refusal.
 */
function supportsServerFallback(model: string) {
  return /^claude-(opus-5|fable-5-1|sonnet-5-5)/.test(model);
}

async function callAnthropic(req: CompletionRequest, model: string): Promise<CompletionResult> {
  const started = Date.now();
  const modern = hasModernRequestSurface(model);
  const prefill = req.json && !rejectsPrefill(model);
  const fallback = supportsServerFallback(model);
  const params = {
    model,
    // Adaptive thinking shares max_tokens with the answer; leave it room.
    max_tokens: modern ? Math.max(req.maxTokens ?? 4096, 16_000) : req.maxTokens ?? 4096,
    ...(modern ? {} : { temperature: req.temperature ?? 0.2 }),
    system: req.system,
    messages: [
      { role: 'user' as const, content: req.user },
      // Older models: prefilling an opening brace is the most reliable way to
      // get JSON without a preamble. Current models use structured outputs.
      ...(prefill ? [{ role: 'assistant' as const, content: '{' }] : []),
    ],
    ...(modern && (req.jsonSchema || req.effort) ? {
      output_config: {
        ...(req.jsonSchema ? { format: { type: 'json_schema', schema: req.jsonSchema } } : {}),
        ...(req.effort ? { effort: req.effort } : {}),
      },
    } : {}),
    ...(fallback ? { fallbacks: 'default' } : {}),
  };
  // output_config and fallbacks are newer than this SDK's types; the API accepts them.
  const response = await anthropic().messages.create(
    params as Anthropic.MessageCreateParamsNonStreaming,
    fallback ? { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } } : undefined,
  );
  // With a fallback, another model may have answered; bill at its rates.
  const servedBy = typeof response.model === 'string' && response.model ? response.model : model;

  const stop = response.stop_reason as string | null;
  if (stop === 'refusal') throw new ModelOutputError('The model declined this request.', 'refusal');
  if (stop === 'max_tokens') throw new ModelOutputError('The model ran out of output tokens before finishing.', 'max_tokens');

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  return {
    text: prefill ? `{${text}` : text,
    provider: 'anthropic',
    model: servedBy,
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
    costCents: costCents(PRICING[servedBy] ? servedBy : model, response.usage.input_tokens, response.usage.output_tokens),
    latencyMs: Date.now() - started,
  };
}

async function callOpenAI(req: CompletionRequest, model: string): Promise<CompletionResult> {
  const client = openai();
  if (!client) throw new Error('OPENAI_API_KEY is not configured; no fallback available');

  const started = Date.now();
  const response = await client.chat.completions.create({
    model,
    max_tokens: req.maxTokens ?? 4096,
    temperature: req.temperature ?? 0.2,
    ...(req.json ? { response_format: { type: 'json_object' as const } } : {}),
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.user },
    ],
  });

  const tokensIn = response.usage?.prompt_tokens ?? 0;
  const tokensOut = response.usage?.completion_tokens ?? 0;
  return {
    text: response.choices[0]?.message?.content ?? '',
    provider: 'openai',
    model,
    tokensIn,
    tokensOut,
    costCents: costCents(model, tokensIn, tokensOut),
    latencyMs: Date.now() - started,
  };
}

/** Parses a JSON completion, tolerating fences and trailing prose. */
export function parseJson<T>(text: string): T {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as T;
    throw new Error(`Model did not return valid JSON. Received: ${cleaned.slice(0, 200)}`);
  }
}
