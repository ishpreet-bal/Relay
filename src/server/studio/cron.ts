/**
 * Minimal five-field cron (minute hour day-of-month month day-of-week) in
 * UTC: numbers, `*`, lists, ranges and steps. Enough for "07:00 every
 * Monday"; deliberately no names or extensions.
 */

function parseField(field: string, min: number, max: number): Set<number> | null {
  const out = new Set<number>();
  for (const part of field.split(',')) {
    const [range, stepRaw] = part.split('/');
    const step = stepRaw === undefined ? 1 : Number(stepRaw);
    if (!Number.isInteger(step) || step < 1) return null;
    let lo = min;
    let hi = max;
    if (range !== '*') {
      const [a, b] = range!.split('-');
      lo = Number(a);
      hi = b === undefined ? (stepRaw === undefined ? lo : max) : Number(b);
      if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) return null;
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

export interface CronSpec { minute: Set<number>; hour: Set<number>; dom: Set<number>; month: Set<number>; dow: Set<number>; domAny: boolean; dowAny: boolean }

export function parseCron(expr: string): CronSpec | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [mi, h, dom, mo, dow] = parts as [string, string, string, string, string];
  const spec = {
    minute: parseField(mi, 0, 59), hour: parseField(h, 0, 23), dom: parseField(dom, 1, 31), month: parseField(mo, 1, 12),
    dow: parseField(dow.replace(/\b7\b/g, '0'), 0, 6),
  };
  if (Object.values(spec).some((v) => v === null)) return null;
  return { ...(spec as Omit<CronSpec, 'domAny' | 'dowAny'>), domAny: dom === '*', dowAny: dow === '*' };
}

export function cronMatches(spec: CronSpec, d: Date): boolean {
  if (!spec.minute.has(d.getUTCMinutes()) || !spec.hour.has(d.getUTCHours()) || !spec.month.has(d.getUTCMonth() + 1)) return false;
  const domOk = spec.dom.has(d.getUTCDate());
  const dowOk = spec.dow.has(d.getUTCDay());
  // Standard cron: when both day fields are restricted, either may match.
  if (!spec.domAny && !spec.dowAny) return domOk || dowOk;
  return domOk && dowOk;
}

/** The most recent time in (after, upTo] the expression fires, if any (scans at most 8 days). */
export function lastFireBetween(expr: string, after: Date, upTo: Date): Date | null {
  const spec = parseCron(expr);
  if (!spec) return null;
  const start = Math.max(after.getTime(), upTo.getTime() - 8 * 86_400_000);
  const t = new Date(Math.floor(upTo.getTime() / 60_000) * 60_000);
  for (; t.getTime() > start; t.setUTCMinutes(t.getUTCMinutes() - 1)) {
    if (cronMatches(spec, t)) return new Date(t);
  }
  return null;
}
