import { db } from '@/lib/db';
import type { AccessContext } from '@/server/access/scope';
import { resolveFilter, type AccountFilter } from './accounts';
import { contactWhere, type ContactFilter } from './contacts';

/**
 * CSV exports of exactly what a list shows, filters included. Capped so a
 * request can't run unbounded; the cap is stated in the last row when hit.
 */

export const EXPORT_LIMIT = 20_000;
const PAGE = 500;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = value instanceof Date ? value.toISOString() : Array.isArray(value) ? value.join('; ') : String(value);
  // Quote anything with a delimiter, quote or line break; neutralise
  // spreadsheet formula injection from values like "=HYPERLINK(...)".
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function csvRow(values: unknown[]) {
  return values.map(csvCell).join(',');
}

export async function exportAccountsCsv(access: AccessContext, filter: AccountFilter) {
  const header = ['Name', 'Website', 'Domain', 'Phone', 'Industry', 'Employees', 'City', 'Province/State', 'Country',
    'Status', 'Score', 'Fit', 'Contacts', 'Signals', 'Client', 'Source', 'Do not contact', 'Added', 'Last contacted', 'Relay id'];
  const lines = [csvRow(header)];
  let cursor: string | undefined;
  let total = 0;
  const where = await resolveFilter(access, filter);
  while (total < EXPORT_LIMIT) {
    const rows = await db.account.findMany({
      where,
      orderBy: { id: 'asc' },
      take: PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, name: true, websiteUrl: true, domain: true, phone: true, industry: true, employeeCount: true, employeeRange: true,
        city: true, region: true, country: true, status: true, score: true, fitScore: true, source: true, doNotContact: true,
        createdAt: true, lastContactedAt: true, client: { select: { name: true } },
        _count: { select: { contacts: { where: { deletedAt: null } }, signals: { where: { dismissedAt: null } } } },
      },
    });
    for (const a of rows) {
      lines.push(csvRow([a.name, a.websiteUrl, a.domain, a.phone, a.industry, a.employeeCount ?? a.employeeRange, a.city, a.region,
        a.country, a.status, a.score, a.fitScore, a._count.contacts, a._count.signals, a.client.name, a.source,
        a.doNotContact ? 'yes' : '', a.createdAt, a.lastContactedAt, a.id]));
    }
    total += rows.length;
    if (rows.length < PAGE) break;
    cursor = rows[rows.length - 1]!.id;
  }
  if (total >= EXPORT_LIMIT) lines.push(csvRow([`Export stopped at ${EXPORT_LIMIT} rows. Narrow the filters to export the rest.`]));
  return { csv: lines.join('\r\n'), rows: total };
}

export async function exportContactsCsv(access: AccessContext, filter: ContactFilter) {
  const header = ['First name', 'Last name', 'Title', 'Seniority', 'Email', 'Email status', 'Direct phone', 'Mobile', 'Other phone',
    'LinkedIn', 'Account', 'Account domain', 'Score', 'Do not email', 'Do not call', 'Source', 'Consent basis', 'Last contacted', 'Relay id'];
  const lines = [csvRow(header)];
  let cursor: string | undefined;
  let total = 0;
  while (total < EXPORT_LIMIT) {
    const rows = await db.contact.findMany({
      where: contactWhere(access, filter),
      orderBy: { id: 'asc' },
      take: PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, firstName: true, lastName: true, title: true, seniority: true, email: true, emailVerification: true,
        directPhone: true, mobilePhone: true, phone: true, linkedinUrl: true, score: true, doNotEmail: true, doNotCall: true,
        source: true, consentBasis: true, lastContactedAt: true, account: { select: { name: true, domain: true } },
      },
    });
    for (const c of rows) {
      lines.push(csvRow([c.firstName, c.lastName, c.title, c.seniority, c.email, c.emailVerification, c.directPhone, c.mobilePhone,
        c.phone, c.linkedinUrl, c.account.name, c.account.domain, c.score, c.doNotEmail ? 'yes' : '', c.doNotCall ? 'yes' : '',
        c.source, c.consentBasis, c.lastContactedAt, c.id]));
    }
    total += rows.length;
    if (rows.length < PAGE) break;
    cursor = rows[rows.length - 1]!.id;
  }
  if (total >= EXPORT_LIMIT) lines.push(csvRow([`Export stopped at ${EXPORT_LIMIT} rows. Narrow the filters to export the rest.`]));
  return { csv: lines.join('\r\n'), rows: total };
}
