import { z } from 'zod';
import { BRAND } from './config';

/**
 * The website inquiry form's rules, shared by the browser and the server so
 * both validate the same way. Nothing here touches the database.
 */

export const SERVICE_CHOICES = [
  { value: 'AUTOMATION', label: 'Business automation' },
  { value: 'ACQUISITION', label: 'Customer acquisition' },
  { value: 'WEBSITES', label: 'Website or digital basics' },
  { value: 'NOT_SURE', label: 'Not sure yet / something else' },
] as const;
export type ServiceChoice = (typeof SERVICE_CHOICES)[number]['value'];

export const CATEGORIES = ['AUTOMATION', 'ACQUISITION', 'WEBSITE', 'GENERAL'] as const;
export type InquiryCategory = (typeof CATEGORIES)[number];
export const CATEGORY_LABELS: Record<InquiryCategory, string> = {
  AUTOMATION: 'Business Automation',
  ACQUISITION: 'Customer Acquisition',
  WEBSITE: 'Website Development',
  GENERAL: 'General Inquiry',
};

export const INDUSTRY_CHOICES = [
  'Manufacturing & industrial', 'Construction', 'Logistics & trucking', 'Healthcare administration & clinics',
  'Spas, salons & local services', 'Retail & e-commerce', 'Startups & professional services', 'Other',
] as const;

/** The opt-in wording, stored with the consent when someone ticks it. */
export const MARKETING_CONSENT_TEXT =
  `Yes, send me occasional emails about ${BRAND.name}’s services. I can unsubscribe at any time.`;

const optional = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

export const inquirySchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(120),
  company: z.string().trim().min(1, 'Please enter your business name').max(160),
  email: z.string().trim().toLowerCase().email('Please enter a valid email address').max(254),
  phone: optional(40).refine((v) => !v || /^[+()\d\s.-]{7,40}$/.test(v), 'Please enter a valid phone number'),
  website: optional(300).refine((v) => !v || /^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(v), 'Please enter a website address, or leave it blank'),
  industry: optional(120),
  service: z.enum(SERVICE_CHOICES.map((s) => s.value) as [ServiceChoice, ...ServiceChoice[]]),
  message: z.string().trim().min(10, 'Tell us a little more (at least 10 characters)').max(4000),
  preferredTimes: z.array(z.string().datetime()).max(3).default([]),
  marketingConsent: z.boolean().default(false),
  /** Hidden from people; a bot that fills every field fills this one too. */
  companyWebsite: z.string().max(300).optional(),
  /** When the form was first shown, in epoch milliseconds. */
  startedAt: z.number().int().positive().optional(),
  sourcePath: optional(300),
});
export type InquiryInput = z.input<typeof inquirySchema>;
export type ParsedInquiry = z.output<typeof inquirySchema>;

const SIGNALS: Record<Exclude<InquiryCategory, 'GENERAL'>, RegExp[]> = {
  AUTOMATION: [/\bautomat\w*/i, /\bspreadsheets?\b/i, /\bmanual(ly)?\b/i, /\bdata entry\b/i, /\breport(s|ing)?\b/i, /\binvoic\w*/i, /\binventory\b/i,
    /\bintegrat\w*/i, /\bworkflows?\b/i, /\bdashboards?\b/i, /\bsync\w*/i, /\bquot(e|es|ation)s?\b/i, /\bscheduling\b/i, /\bpaperwork\b/i, /\bprocess(es|ing)?\b/i],
  ACQUISITION: [/\bleads?\b/i, /\bprospect\w*/i, /\b(more|new|find(ing)?)\s+(customers|clients)\b/i, /\bsales\b/i, /\boutreach\b/i, /\bcold (email|call)\w*/i,
    /\bpipeline\b/i, /\bcrm\b/i, /\blead generation\b/i, /\bmarketing\b/i, /\bb2b\b/i],
  WEBSITE: [/\bwebsites?\b/i, /\bweb ?site\b/i, /\blanding page\b/i, /\bdomain\b/i, /\bseo\b/i, /\bonline (presence|booking|store)\b/i, /\bbusiness email\b/i,
    /\be-?commerce\b/i, /\bshopify\b/i, /\bgoogle (business|maps)\b/i, /\bbooking (page|system)\b/i],
};

/**
 * Which part of the business an inquiry is for. The visitor's own choice
 * wins; "not sure" is worked out from the message, and anything unclear is
 * a general inquiry for a person to read.
 */
export function categorize(service: ServiceChoice, message: string): { category: InquiryCategory; source: 'visitor' | 'inferred' } {
  if (service === 'AUTOMATION') return { category: 'AUTOMATION', source: 'visitor' };
  if (service === 'ACQUISITION') return { category: 'ACQUISITION', source: 'visitor' };
  if (service === 'WEBSITES') return { category: 'WEBSITE', source: 'visitor' };
  const scores = (Object.keys(SIGNALS) as (keyof typeof SIGNALS)[]).map((k) => ({ k, n: SIGNALS[k].filter((re) => re.test(message)).length }));
  scores.sort((a, b) => b.n - a.n);
  const [top, second] = scores;
  if (!top || top.n === 0 || (second && second.n === top.n)) return { category: 'GENERAL', source: 'inferred' };
  return { category: top.k, source: 'inferred' };
}

export function splitName(full: string): { firstName: string; lastName: string | null } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0]!, lastName: null };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1]! };
}
