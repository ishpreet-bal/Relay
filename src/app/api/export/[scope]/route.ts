import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { recordAudit } from '@/lib/audit';
import { accessFrom } from '@/server/access/scope';
import { accountFilterSchema } from '@/server/services/accounts';
import { contactFilterSchema } from '@/server/services/contacts';
import { exportAccountsCsv, exportContactsCsv } from '@/server/services/export';

export const maxDuration = 60;

/**
 * GET /api/export/accounts?filters=<json>  (or /contacts)
 * Downloads the filtered list as CSV. Bulk export moves personal data out of
 * the system, so it needs the import permission (not just read) and is audited.
 */
export async function GET(req: Request, { params }: { params: Promise<{ scope: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse('Not signed in', { status: 401 });
  if (!session.isInternal || !can(session.role, 'account:import')) return new NextResponse('Forbidden', { status: 403 });

  const { scope } = await params;
  let raw: unknown = {};
  try {
    raw = JSON.parse(new URL(req.url).searchParams.get('filters') ?? '{}');
  } catch {
    return new NextResponse('filters must be JSON', { status: 400 });
  }
  const access = accessFrom(session);

  let result: { csv: string; rows: number };
  if (scope === 'accounts') {
    const filter = accountFilterSchema.safeParse(raw);
    if (!filter.success) return new NextResponse('Invalid filters', { status: 400 });
    result = await exportAccountsCsv(access, filter.data);
  } else if (scope === 'contacts') {
    const filter = contactFilterSchema.safeParse(raw);
    if (!filter.success) return new NextResponse('Invalid filters', { status: 400 });
    result = await exportContactsCsv(access, filter.data);
  } else {
    return new NextResponse('Not found', { status: 404 });
  }

  await recordAudit({ session, action: `${scope}.export`, entityType: scope === 'accounts' ? 'Account' : 'Contact', after: { rows: result.rows, filters: raw } });
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(`﻿${result.csv}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="relay-${scope}-${date}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
