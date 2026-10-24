/**
 * Salon demo: a booking request matched against each staff member's day,
 * respecting how long each service takes and a cleanup buffer, then
 * confirmed with reminders and a rebooking nudge. Fictional salon.
 */

export type ServiceId = 'cut' | 'colour' | 'beard' | 'manicure' | 'facial';
export const SERVICES: Record<ServiceId, { label: string; minutes: number; staff: string[]; rebookWeeks: number }> = {
  cut: { label: 'Haircut', minutes: 45, staff: ['Maya', 'Jordan'], rebookWeeks: 5 },
  colour: { label: 'Colour', minutes: 120, staff: ['Maya'], rebookWeeks: 8 },
  beard: { label: 'Beard trim', minutes: 30, staff: ['Jordan'], rebookWeeks: 3 },
  manicure: { label: 'Manicure', minutes: 45, staff: ['Priya'], rebookWeeks: 3 },
  facial: { label: 'Facial', minutes: 60, staff: ['Priya'], rebookWeeks: 6 },
};

export const STAFF = ['Maya', 'Jordan', 'Priya'] as const;
export const OPEN = 9 * 60;
export const CLOSE = 18 * 60;
export const BUFFER = 10;

export type Booking = { staff: string; start: number; end: number; label: string };

/** The day as it stands before the request. */
export const EXISTING: Booking[] = [
  { staff: 'Maya', start: 9 * 60, end: 11 * 60, label: 'Colour' },
  { staff: 'Maya', start: 11 * 60 + 15, end: 12 * 60, label: 'Haircut' },
  { staff: 'Maya', start: 13 * 60, end: 14 * 60, label: 'Cut & style' },
  { staff: 'Maya', start: 16 * 60 + 30, end: 17 * 60 + 15, label: 'Haircut' },
  { staff: 'Jordan', start: 9 * 60 + 30, end: 10 * 60 + 15, label: 'Haircut' },
  { staff: 'Jordan', start: 10 * 60 + 30, end: 11 * 60, label: 'Beard trim' },
  { staff: 'Jordan', start: 12 * 60, end: 13 * 60, label: 'Lunch' },
  { staff: 'Jordan', start: 14 * 60, end: 14 * 60 + 45, label: 'Haircut' },
  { staff: 'Priya', start: 10 * 60, end: 11 * 60, label: 'Facial' },
  { staff: 'Priya', start: 11 * 60 + 30, end: 12 * 60 + 15, label: 'Manicure' },
  { staff: 'Priya', start: 15 * 60, end: 16 * 60, label: 'Facial' },
];

export type Slot = { staff: string; start: number; end: number; distance: number };

function free(staff: string, start: number, end: number, bookings: Booking[]) {
  if (start < OPEN || end > CLOSE) return false;
  return bookings.filter((b) => b.staff === staff).every((b) => end + BUFFER <= b.start || start >= b.end + BUFFER);
}

/** Up to `limit` options closest to the preferred time, on 15-minute starts. */
export function findSlots(service: ServiceId, staffPref: string | 'any', preferred: number, bookings: Booking[] = EXISTING, limit = 3): Slot[] {
  const svc = SERVICES[service];
  const staff = staffPref === 'any' ? svc.staff : svc.staff.filter((s) => s === staffPref);
  const options: Slot[] = [];
  for (const s of staff) {
    for (let t = OPEN; t + svc.minutes <= CLOSE; t += 15) {
      if (free(s, t, t + svc.minutes, bookings)) options.push({ staff: s, start: t, end: t + svc.minutes, distance: Math.abs(t - preferred) });
    }
  }
  return options.sort((a, b) => a.distance - b.distance || a.start - b.start || a.staff.localeCompare(b.staff)).slice(0, limit);
}

export const time = (m: number) => {
  const hh = Math.floor(m / 60);
  return `${((hh + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`;
};

export function confirmation(service: ServiceId, slot: Slot, dayLabel = 'Saturday') {
  const svc = SERVICES[service];
  return {
    message: `You're booked: ${svc.label} with ${slot.staff}, ${dayLabel} at ${time(slot.start)} (${svc.minutes} min). Reply R to reschedule.`,
    reminders: [
      { when: '24 hours before', text: `See you tomorrow at ${time(slot.start)} for your ${svc.label.toLowerCase()} with ${slot.staff}.` },
      { when: '2 hours before', text: `Your ${svc.label.toLowerCase()} is at ${time(slot.start)} today. Running late? Reply and let us know.` },
    ],
    followUp: { when: `${svc.rebookWeeks} weeks after`, text: `It's been ${svc.rebookWeeks} weeks since your ${svc.label.toLowerCase()}. Book your next visit with ${slot.staff}?` },
  };
}
