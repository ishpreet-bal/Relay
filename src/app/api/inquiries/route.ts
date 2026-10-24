import { NextResponse, type NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { NotConfiguredError } from '@/server/errors';
import { InvalidInquiryError, RateLimitedError, submitInquiry } from '@/server/services/inquiries';

export const runtime = 'nodejs';

const MAX_BODY = 16_000;

/**
 * The website's inquiry form. Public by design: it only ever writes one
 * inquiry, never reads anything back, and is validated, size-capped,
 * same-origin and rate-limited.
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  const originHost = origin ? (() => { try { return new URL(origin).host; } catch { return null; } })() : undefined;
  if (originHost !== undefined && originHost !== req.headers.get('host')) {
    return NextResponse.json({ error: 'Cross-site submissions are not accepted.' }, { status: 403 });
  }
  if (!req.headers.get('content-type')?.includes('application/json')) {
    return NextResponse.json({ error: 'Send the form as JSON.' }, { status: 415 });
  }
  const text = await req.text();
  if (text.length > MAX_BODY) return NextResponse.json({ error: 'That message is too long.' }, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'The form could not be read.' }, { status: 400 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
  try {
    const result = await submitInquiry(body as never, { ip });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof InvalidInquiryError) return NextResponse.json({ error: err.message, fields: err.fields }, { status: 400 });
    if (err instanceof RateLimitedError) return NextResponse.json({ error: err.message }, { status: 429 });
    if (err instanceof NotConfiguredError) {
      logger.error('inquiry.not_configured', { error: err });
      return NextResponse.json({ error: 'Inquiries are not available right now. Please try again later.' }, { status: 503 });
    }
    logger.error('inquiry.failed', { error: err });
    return NextResponse.json({ error: 'Something went wrong sending your message. Please try again.' }, { status: 500 });
  }
}
