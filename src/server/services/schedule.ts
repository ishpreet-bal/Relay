/**
 * Sending-window arithmetic in the organization's timezone.
 *
 * Doing this with UTC hours and a stored offset breaks twice a year at DST
 * boundaries — a campaign configured for 8am–4pm silently starts firing at 7am
 * after the clocks change, which is exactly the kind of thing that gets a
 * sending domain flagged. Intl.DateTimeFormat resolves the real local time for
 * the zone on the given date, so DST is handled by the platform rather than by
 * arithmetic.
 */

export interface SendWindow {
  timezone: string;
  /** ISO weekdays, 1 = Monday through 7 = Sunday. */
  days: number[];
  startHour: number;
  endHour: number;
}

interface LocalParts { weekday: number; hour: number; minute: number }

function localParts(date: Date, timezone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekdayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

  return {
    weekday: weekdayMap[get('weekday')] ?? 1,
    // Intl renders midnight as "24" in some locales under hour12: false.
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
  };
}

export function isWithinWindow(date: Date, window: SendWindow): boolean {
  const { weekday, hour } = localParts(date, window.timezone);
  if (!window.days.includes(weekday)) return false;
  return hour >= window.startHour && hour < window.endHour;
}

/**
 * The next moment inside the window at or after `from`. Steps forward in whole
 * hours, which is precise enough for outreach and avoids recursion.
 */
export function nextWindowOpening(from: Date, window: SendWindow, maxDays = 14): Date {
  const cursor = new Date(from);
  if (isWithinWindow(cursor, window)) return cursor;

  for (let i = 0; i < maxDays * 24; i++) {
    cursor.setUTCHours(cursor.getUTCHours() + 1, 0, 0, 0);
    if (isWithinWindow(cursor, window)) return cursor;
  }
  // Every day excluded, or a misconfigured window. Fail open rather than
  // stranding the enrollment forever; the gate still guards the actual send.
  return new Date(from.getTime() + 24 * 3600_000);
}

/** Spreads a batch across the window instead of firing it in one burst. */
export function jitter(base: Date, maxMinutes: number): Date {
  return new Date(base.getTime() + Math.floor(Math.random() * maxMinutes) * 60_000);
}
