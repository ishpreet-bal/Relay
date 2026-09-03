import { z } from 'zod';
import { headers } from 'next/headers';
import { acceptProposal } from '@/server/services/proposal';

const schema = z.object({
  token: z.string().min(20).max(80),
  signatureName: z.string().min(2).max(120),
});

/** Public endpoint — the share token is the credential. Deliberately narrow. */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response('Invalid request', { status: 400 });

  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  const result = await acceptProposal({
    shareToken: parsed.data.token,
    signatureName: parsed.data.signatureName,
    ipAddress: ip,
  });

  if (!result) return new Response('Proposal not found', { status: 404 });
  if ('expired' in result) return new Response('This proposal has expired.', { status: 410 });
  return Response.json({ ok: true });
}
