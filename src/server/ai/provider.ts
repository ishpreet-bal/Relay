import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { db } from '@/lib/db';
import { env, requireEnv } from '@/lib/env';
import { costCents, MODELS } from './pricing';
import { assertBudget } from './budget';

export interface CompletionRequest {
  organizationId: string;
  /** What this call is for — becomes AiRun.kind and drives cost reporting. */
  kind: 'research' | 'personalize' | 'proposal' | 'portfolio' | 'classify';
  entityId?: string;
  promptVersion: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  /** Forces a JSON-only response and strips any stray prose or fences. */
  json?: boolean;
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
  anthropicClient ??= new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY', 'AI drafting and research'), maxRetries: 0 });
  return anthropicClient;
}
function openai() {
  const key = env().OPENAI_API_KEY;
  if (!key) return null;
  openaiClient ??= new OpenAI({ apiKey: key, maxRetries: 0 });
  return openaiClient;
}

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
      result = await withRetries(() => callAnthropic(req, primary), 3);
    } catch (primaryError) {
      const fallback = req.fallbackModel ?? MODELS.fallbackResearch;
      if (!openai()) throw primaryError;
      console.warn(`Anthropic call failed, falling back to ${fallback}:`, primaryError);
      result = await withRetries(() => callOpenAI(req, fallback), 2);
    }

    await db.aiRun.update({
      where: { id: run.id },
      data: {
        status: 'SUCCEEDED',
        provider: result.provider,
        model: result.model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costCents: result.costCents,
        latencyMs: result.latencyMs,
      },
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

async function withRetries<T>(fn: () => Promise<T>, attempts: number): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
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

async function callAnthropic(req: CompletionRequest, model: string): Promise<CompletionResult> {
  const started = Date.now();
  const response = await anthropic().messages.create({
    model,
    max_tokens: req.maxTokens ?? 4096,
    temperature: req.temperature ?? 0.2,
    system: req.system,
    messages: [
      { role: 'user', content: req.user },
      // Prefilling the assistant turn with an opening brace is the most reliable
      // way to get JSON without a preamble.
      ...(req.json ? [{ role: 'assistant' as const, content: '{' }] : []),
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  return {
    text: req.json ? `{${text}` : text,
    provider: 'anthropic',
    model,
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
    costCents: costCents(model, response.usage.input_tokens, response.usage.output_tokens),
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
