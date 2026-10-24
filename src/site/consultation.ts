/**
 * Consultation times a visitor can suggest: weekday slots in Toronto time,
 * from the next business day, two weeks out. These are requests, not
 * bookings: a person confirms one of them.
 */

export const CONSULT_TZ = 'America/Toronto';
export const CONSULT_HOURS = [10, 11, 13, 14, 15, 16];
export const CONSULT_MINUTES = 30;
const DAYS_AHEAD = 14;
const MIN_LEAD_HOURS = 16;

/** The UTC instant of a wall-clock time in a time zone, accounting for daylight saving. */
export function zonedTime(year: number, month: number, day: number, hour: number, minute: number, tz = CONSULT_TZ): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const offset = (at: number) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(at))
      .reduce<Record<string, number>>((acc, p) => (p.type === 'literal' ? acc : { ...acc, [p.type]: Number(p.value) }), {});
    return Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!) - at;
  };
  const first = guess - offset(guess);
  return new Date(guess - offset(first));
}

function torontoDate(at: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: CONSULT_TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { year: Number(get('year')), month: Number(get('month')), day: Number(get('day')), weekday: get('weekday') };
}

export type SlotDay = { key: string; label: string; slots: { iso: string; label: string }[] };

export function consultationSlots(now: Date = new Date()): SlotDay[] {
  const days: SlotDay[] = [];
  const start = torontoDate(now);
  for (let i = 1; i <= DAYS_AHEAD; i++) {
    const noon = zonedTime(start.year, start.month, start.day + i, 12, 0);
    const d = torontoDate(noon);
    if (d.weekday === 'Sat' || d.weekday === 'Sun') continue;
    const slots = CONSULT_HOURS
      .map((h) => zonedTime(d.year, d.month, d.day, h, 0))
      .filter((t) => t.getTime() - now.getTime() >= MIN_LEAD_HOURS * 3_600_000)
      .map((t) => ({ iso: t.toISOString(), label: t.toLocaleTimeString('en-CA', { timeZone: CONSULT_TZ, hour: 'numeric', minute: '2-digit' }) }));
    if (!slots.length) continue;
    days.push({
      key: `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`,
      label: noon.toLocaleDateString('en-CA', { timeZone: CONSULT_TZ, weekday: 'short', month: 'short', day: 'numeric' }),
      slots,
    });
  }
  return days;
}

/**
 * Accepts a time this form could have offered: a weekday consultation hour
 * in Toronto, in the future and within the booking window. Checked by
 * shape rather than against the current list, so a visitor who takes a
 * while to fill in the form is not turned away.
 */
export function isOfferedSlot(iso: string, now: Date = new Date()): boolean {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return false;
  const ahead = at.getTime() - now.getTime();
  if (ahead < 3_600_000 || ahead > (DAYS_AHEAD + 1) * 86_400_000) return false;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: CONSULT_TZ, hourCycle: 'h23', weekday: 'short', hour: '2-digit', minute: '2-digit' }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return get('weekday') !== 'Sat' && get('weekday') !== 'Sun' && CONSULT_HOURS.includes(Number(get('hour'))) && Number(get('minute')) === 0 && at.getUTCSeconds() === 0;
}

export function formatSlot(iso: string): string {
  return new Date(iso).toLocaleString('en-CA', { timeZone: CONSULT_TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET';
}
