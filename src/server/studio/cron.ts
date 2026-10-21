/**
 * Minimal five-field cron (minute hour day-of-month month day-of-week):
 * numbers, `*`, lists, ranges and steps, evaluated in an IANA time zone
 * (UTC by default). Enough for "07:00 every Monday in Toronto";
 * deliberately no names or extensions.
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

export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const formats = new Map<string, Intl.DateTimeFormat>();
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Wall-clock fields of an instant in a time zone. */
function wallClock(d: Date, tz: string) {
  if (tz === 'UTC') return { minute: d.getUTCMinutes(), hour: d.getUTCHours(), dom: d.getUTCDate(), month: d.getUTCMonth() + 1, dow: d.getUTCDay() };
  let f = formats.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', minute: 'numeric', hour: 'numeric', day: 'numeric', month: 'numeric', weekday: 'short' });
    formats.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { minute: Number(p.minute), hour: Number(p.hour), dom: Number(p.day), month: Number(p.month), dow: WEEKDAYS[p.weekday!] ?? -1 };
}

export function cronMatches(spec: CronSpec, d: Date, tz = 'UTC'): boolean {
  const w = wallClock(d, tz);
  if (!spec.minute.has(w.minute) || !spec.hour.has(w.hour) || !spec.month.has(w.month)) return false;
  const domOk = spec.dom.has(w.dom);
  const dowOk = spec.dow.has(w.dow);
  // Standard cron: when both day fields are restricted, either may match.
  if (!spec.domAny && !spec.dowAny) return domOk || dowOk;
  return domOk && dowOk;
}

/** The most recent time in (after, upTo] the expression fires, if any (scans at most 8 days). */
export function lastFireBetween(expr: string, after: Date, upTo: Date, tz = 'UTC'): Date | null {
  const spec = parseCron(expr);
  if (!spec) return null;
  const start = Math.max(after.getTime(), upTo.getTime() - 8 * 86_400_000);
  const t = new Date(Math.floor(upTo.getTime() / 60_000) * 60_000);
  for (; t.getTime() > start; t.setUTCMinutes(t.getUTCMinutes() - 1)) {
    if (cronMatches(spec, t, tz)) return new Date(t);
  }
  return null;
}
