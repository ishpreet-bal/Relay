import { z } from 'zod';
import { createLead, type LeadInput } from './leads';

/**
 * CSV import with explicit column mapping. Auto-detection guesses the mapping
 * and the operator confirms it before anything is written — a silent misparse
 * that puts phone numbers in the email column is expensive to unwind later.
 */
export const IMPORT_FIELDS = [
  'companyName', 'websiteUrl', 'linkedinUrl', 'phone', 'industry',
  'employeeCount', 'city', 'region', 'country', 'notes',
  'contactFirstName', 'contactLastName', 'contactTitle', 'contactEmail', 'contactPhone',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

const ALIASES: Record<ImportField, string[]> = {
  companyName: ['company', 'company name', 'business', 'business name', 'organization', 'name'],
  websiteUrl: ['website', 'url', 'site', 'web', 'domain'],
  linkedinUrl: ['linkedin', 'linkedin url', 'li'],
  phone: ['phone', 'telephone', 'company phone', 'main phone'],
  industry: ['industry', 'category', 'vertical', 'sector', 'type'],
  employeeCount: ['employees', 'employee count', 'headcount', 'size', 'staff'],
  city: ['city', 'town', 'locality'],
  region: ['province', 'state', 'region'],
  country: ['country'],
  notes: ['notes', 'note', 'comments', 'description'],
  contactFirstName: ['first name', 'firstname', 'contact first name', 'owner first name'],
  contactLastName: ['last name', 'lastname', 'surname', 'contact last name'],
  contactTitle: ['title', 'job title', 'position', 'role'],
  contactEmail: ['email', 'e-mail', 'contact email', 'owner email'],
  contactPhone: ['mobile', 'cell', 'direct phone', 'contact phone'],
};

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ',') { row.push(field.trim()); field = ''; continue; }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
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

  for (const field of IMPORT_FIELDS) {
    const idx = normalized.findIndex(
      (h) => h === field.toLowerCase() || ALIASES[field].includes(h),
    );
    if (idx !== -1 && !Object.values(mapping).includes(idx)) mapping[field] = idx;
  }
  return mapping;
}

export const importRowSchema = z.object({ companyName: z.string().min(1) });

export interface ImportResult {
  created: number;
  duplicates: number;
  failed: Array<{ row: number; reason: string }>;
}

export async function importRows(
  organizationId: string,
  userId: string | null,
  rows: string[][],
  mapping: Partial<Record<ImportField, number>>,
): Promise<ImportResult> {
  const result: ImportResult = { created: 0, duplicates: 0, failed: [] };
  const at = (row: string[], field: ImportField) => {
    const idx = mapping[field];
    const v = idx === undefined ? '' : (row[idx] ?? '').trim();
    return v === '' ? null : v;
  };

  for (const [i, row] of rows.entries()) {
    const companyName = at(row, 'companyName');
    if (!companyName) {
      result.failed.push({ row: i + 2, reason: 'Missing company name' });
      continue;
    }

    const email = at(row, 'contactEmail');
    const employees = at(row, 'employeeCount');

    const input: LeadInput = {
      companyName,
      websiteUrl: at(row, 'websiteUrl'),
      linkedinUrl: at(row, 'linkedinUrl'),
      phone: at(row, 'phone'),
      industry: at(row, 'industry'),
      employeeCount: employees && /^\d+$/.test(employees) ? Number(employees) : null,
      employeeRange: employees && !/^\d+$/.test(employees) ? employees : null,
      city: at(row, 'city'),
      region: at(row, 'region'),
      country: at(row, 'country') ?? 'CA',
      techStack: [],
      tags: [],
      notes: at(row, 'notes'),
      source: 'CSV_IMPORT',
      contact: email || at(row, 'contactFirstName')
        ? {
            firstName: at(row, 'contactFirstName'),
            lastName: at(row, 'contactLastName'),
            title: at(row, 'contactTitle'),
            email: email && z.string().email().safeParse(email).success ? email : null,
            phone: at(row, 'contactPhone'),
            role: 'OTHER',
            sourceUrl: null,
          }
        : undefined,
    };

    try {
      const { duplicate } = await createLead(organizationId, userId, input);
      if (duplicate) result.duplicates++; else result.created++;
    } catch (err) {
      result.failed.push({ row: i + 2, reason: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  return result;
}
