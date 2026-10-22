import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { DomainError, NotFoundError } from '@/server/errors';
import { startFromWebhook } from '@/server/studio/applications';

/**
 * Inbound webhook for a customer application: their system posts JSON here
 * to start a webhook-triggered workflow.
 *
 *   POST /api/studio/hooks/{applicationId}/{workflowKey}
 *   Authorization: Bearer <token from Studio>
 *   Idempotency-Key: <optional; the same key starts one run>
 *
 * The token belongs to one application, so the run can only touch that
 * customer's data. Responds 202 with the execution id once it is queued.
 */

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 64_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[a-z][a-z0-9_]{0,40}$/;

export async function POST(req: Request, { params }: { params: Promise<{ applicationId: string; workflowKey: string }> }) {
  const { applicationId, workflowKey } = await params;
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  // Same answer for a bad id, a bad token and an unknown app: nothing to learn by probing.
  const unauthorized = () => NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!UUID.test(applicationId) || !KEY.test(workflowKey) || !token) return unauthorized();

  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) return NextResponse.json({ error: 'body too large' }, { status: 413 });
  let input: unknown;
  try {
    input = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: 'body must be JSON' }, { status: 400 });
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return NextResponse.json({ error: 'body must be a JSON object' }, { status: 400 });

  const idempotencyKey = req.headers.get('idempotency-key')?.slice(0, 200) || null;
  try {
    const exec = await startFromWebhook(applicationId, token, workflowKey, input, idempotencyKey);
    if (!exec) return unauthorized();
    return NextResponse.json({ executionId: exec.id, status: exec.status }, { status: 202 });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: 'no webhook workflow with that key' }, { status: 404 });
    if (err instanceof DomainError) return NextResponse.json({ error: err.message }, { status: 409 });
    logger.error('studio.webhook_failed', { applicationId, workflowKey, error: err });
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
