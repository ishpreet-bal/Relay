import { db } from '@/lib/db';
import { toDomain } from '@/lib/utils';
import type { AccessContext } from '@/server/access/scope';
import { assertClientAccess } from '@/server/access/scope';
import { createAccount, type AccountInput } from './accounts';
import { createContactRecord, type ContactInput } from './contacts';
import { rescoreAccount } from './scoring';

/**
 * CSV import with explicit column mapping. Auto-detection guesses the mapping
 * and the operator confirms it before anything is written — a silent misparse
 * that puts phone numbers in the email column is expensive to unwind later.
 *
 * Rows are grouped by company (domain, else name + city), so a list with three
 * people at one manufacturer becomes one account with three contacts.
 */
export const IMPORT_FIELDS = [
  'companyName', 'websiteUrl', 'linkedinUrl', 'phone', 'industry', 'employeeCount',
  'city', 'region', 'country', 'description', 'notes',
  'contactFirstName', 'contactLastName', 'contactTitle', 'contactEmail', 'contactPhone',
  'contactDirectPhone', 'contactMobile', 'contactLinkedin',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

const ALIASES: Record<ImportField, string[]> = {
  companyName: ['company', 'company name', 'business', 'business name', 'organization', 'organisation', 'account', 'account name'],
  websiteUrl: ['website', 'url', 'site', 'web', 'domain', 'company website', 'company domain'],
  linkedinUrl: ['company linkedin', 'company linkedin url', 'linkedin company'],
  phone: ['phone', 'telephone', 'company phone', 'main phone', 'office phone'],
  industry: ['industry', 'category', 'vertical', 'sector'],
  employeeCount: ['employees', 'employee count', 'headcount', 'size', 'staff', '# employees', 'number of employees'],
  city: ['city', 'town', 'locality', 'company city'],
  region: ['province', 'state', 'region', 'company state', 'company province'],
  country: ['country', 'company country'],
  description: ['description', 'company description', 'about'],
  notes: ['notes', 'note', 'comments'],
  contactFirstName: ['first name', 'firstname', 'contact first name', 'given name'],
  contactLastName: ['last name', 'lastname', 'surname', 'contact last name', 'family name'],
  contactTitle: ['title', 'job title', 'position', 'role'],
  contactEmail: ['email', 'e-mail', 'contact email', 'work email', 'email address'],
  contactPhone: ['contact phone', 'work phone'],
  contactDirectPhone: ['direct phone', 'direct dial', 'direct line'],
  contactMobile: ['mobile', 'cell', 'mobile phone', 'cell phone'],
  contactLinkedin: ['linkedin', 'linkedin url', 'person linkedin', 'contact linkedin', 'linkedin profile'],
};

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  // Strip a UTF-8 byte-order mark, which Excel adds and which would otherwise
  // become part of the first header name.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ',') { row.push(field.trim()); field = ''; continue; }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = []; field = '';
      continue;
    }
    field += ch;
  }
  if (field !== '' || row.length) { row.push(field.trim()); if (row.some((c) => c !== '')) rows.push(row); }

  const [headers = [], ...body] = rows;
  return { headers, rows: body };
}

/** Best-guess header mapping, presented to the operator for confirmation. */
export function suggestMapping(headers: string[]): Partial<Record<ImportField, number>> {
  const mapping: Partial<Record<ImportField, number>> = {};
  const normalized = headers.map((h) => h.toLowerCase().replace(/[_-]+/g, ' ').trim());
  const taken = new Set<number>();

  for (const field of IMPORT_FIELDS) {
    const idx = normalized.findIndex((h, i) => !taken.has(i) && (h === field.toLowerCase() || ALIASES[field].includes(h)));
    if (idx !== -1) { mapping[field] = idx; taken.add(idx); }
  }
  return mapping;
}

export interface ImportResult {
  accountsCreated: number;
  accountsMatched: number;
  contactsCreated: number;
  contactsDuplicate: number;
  excluded: number;
  failed: Array<{ row: number; reason: string }>;
}

interface Group { key: string; firstRow: number; account: AccountInput; contacts: Array<{ row: number; input: ContactInput }> }

export function groupRows(
  clientId: string,
  rows: string[][],
  mapping: Partial<Record<ImportField, number>>,
): { groups: Group[]; failed: ImportResult['failed'] } {
  const at = (row: string[], field: ImportField) => {
    const idx = mapping[field];
    const v = idx === undefined ? '' : (row[idx] ?? '').trim();
    return v === '' ? null : v;
  };

  const groups = new Map<string, Group>();
  const failed: ImportResult['failed'] = [];

  for (const [i, row] of rows.entries()) {
    const line = i + 2; // header is line 1
    const name = at(row, 'companyName');
    if (!name) { failed.push({ row: line, reason: 'Missing company name' }); continue; }

    const website = at(row, 'websiteUrl');
    const key = toDomain(website) ?? `${name.toLowerCase()}|${(at(row, 'city') ?? '').toLowerCase()}`;
    const employees = at(row, 'employeeCount');

    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        firstRow: line,
        account: {
          clientId,
          name,
          websiteUrl: website,
          linkedinUrl: at(row, 'linkedinUrl'),
          phone: at(row, 'phone'),
          industry: at(row, 'industry'),
          employeeCount: employees && /^\d[\d,]*$/.test(employees) ? Number(employees.replace(/,/g, '')) : null,
          employeeRange: employees && !/^\d[\d,]*$/.test(employees) ? employees : null,
          city: at(row, 'city'),
          region: at(row, 'region'),
          country: at(row, 'country') ?? 'CA',
          description: at(row, 'description'),
          notes: at(row, 'notes'),
          tags: [],
          source: 'CSV_IMPORT',
          contacts: [],
        },
        contacts: [],
      };
      groups.set(key, group);
    }

    const email = at(row, 'contactEmail');
    const contact: ContactInput = {
      firstName: at(row, 'contactFirstName'),
      lastName: at(row, 'contactLastName'),
      title: at(row, 'contactTitle'),
      email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
      phone: at(row, 'contactPhone'),
      directPhone: at(row, 'contactDirectPhone'),
      mobilePhone: at(row, 'contactMobile'),
      linkedinUrl: at(row, 'contactLinkedin'),
      source: 'CSV_IMPORT',
    };
    if (email && !contact.email) failed.push({ row: line, reason: `"${email}" is not a valid email; contact skipped` });
    else if (contact.email || contact.firstName || contact.lastName || contact.directPhone || contact.mobilePhone) {
      group.contacts.push({ row: line, input: contact });
    }
  }
  return { groups: [...groups.values()], failed };
}

export async function importRows(
  access: AccessContext,
  userId: string | null,
  clientId: string,
  rows: string[][],
  mapping: Partial<Record<ImportField, number>>,
): Promise<ImportResult> {
  assertClientAccess(access, clientId);
  const { groups, failed } = groupRows(clientId, rows, mapping);
  const result: ImportResult = {
    accountsCreated: 0, accountsMatched: 0, contactsCreated: 0, contactsDuplicate: 0, excluded: 0, failed,
  };

  for (const group of groups) {
    try {
      const created = await createAccount(access, userId, group.account);
      if (created.status === 'excluded') { result.excluded++; continue; }
      if (created.status === 'created') result.accountsCreated++; else result.accountsMatched++;

      const accountId = created.accountId;
      const existingCount = await db.contact.count({ where: { accountId } });
      for (const [i, c] of group.contacts.entries()) {
        try {
          const r = await db.$transaction((tx) =>
            createContactRecord(tx, {
              organizationId: access.organizationId, clientId, accountId, input: c.input,
              isPrimary: existingCount === 0 && i === 0, userId,
            }),
          );
          if (r.duplicate) result.contactsDuplicate++; else result.contactsCreated++;
        } catch (err) {
          result.failed.push({ row: c.row, reason: err instanceof Error ? err.message : 'Contact could not be added' });
        }
      }
      if (group.contacts.length) await rescoreAccount(accountId);
    } catch (err) {
      result.failed.push({ row: group.firstRow, reason: err instanceof Error ? err.message : 'Unknown error' });
    }
  }
  return result;
}
