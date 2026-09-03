import { twMerge } from 'tailwind-merge';

export function cn(...classes: Array<string | false | null | undefined>) {
  return twMerge(classes.filter(Boolean).join(' '));
}

export function formatMoney(cents: number | null | undefined, currency = 'CAD') {
  if (cents == null) return '—';
  return new Intl.NumberFormat('en-CA', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatCompact(n: number | null | undefined) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-CA', { notation: 'compact' }).format(n);
}

/** Normalizes a website into a bare host, used as the dedupe key on Lead. */
export function toDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim().toLowerCase();
  if (!raw) return null;
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

export function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}
