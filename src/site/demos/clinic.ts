/**
 * Clinic administration demo: incoming administrative items routed to the
 * right work queue, and appointment reminders scheduled. Fictional clinic,
 * people and records. Administrative only: anything that reads as a
 * clinical question is handed to a person and never answered automatically.
 */

export type Queue = 'Scheduling' | 'Records' | 'Billing' | 'Front desk' | 'Clinical team';
export type AdminItem = { id: string; channel: 'Fax' | 'Email' | 'Web form' | 'Voicemail'; subject: string; body: string };
export type Routed = AdminItem & { type: string; queue: Queue; priority: 'Today' | 'This week' | 'Routine'; reason: string; automated: boolean };

export const SAMPLE_ITEMS: AdminItem[] = [
  { id: 'IN-201', channel: 'Fax', subject: 'Referral: new patient consultation', body: 'Referral letter from a family physician requesting a consultation appointment.' },
  { id: 'IN-202', channel: 'Web form', subject: 'Need to reschedule Tuesday', body: 'Hi, I can no longer make my appointment on Tuesday at 10:30. Is Thursday possible?' },
  { id: 'IN-203', channel: 'Email', subject: 'Copy of my file', body: 'I would like a copy of my records sent to my new clinic.' },
  { id: 'IN-204', channel: 'Email', subject: 'Insurance form', body: 'My insurer needs the attached claim form completed and signed.' },
  { id: 'IN-205', channel: 'Voicemail', subject: 'Parking question', body: 'Is there parking near the clinic, and is it paid?' },
  { id: 'IN-206', channel: 'Web form', subject: 'Question about my medication', body: 'Should I keep taking my medication before the procedure next week?' },
];

type Rule = { type: string; queue: Queue; priority: Routed['priority']; test: RegExp; reason: string; automated?: boolean };

// Order matters: anything clinical is caught first and always goes to a person.
const RULES: Rule[] = [
  { type: 'Clinical question', queue: 'Clinical team', priority: 'Today', automated: false,
    test: /\b(medication|medicine|dose|dosage|symptom|pain|side effect|prescription|refill|bleeding|fever|procedure)\b/i,
    reason: 'Reads as a clinical question: handed to the clinical team, never answered automatically' },
  { type: 'Appointment change', queue: 'Scheduling', priority: 'Today',
    test: /\b(reschedul\w*|cancel\w*|move my appointment|can(?:no|')t make|change (?:my )?appointment)\b/i, reason: 'Mentions changing or cancelling an appointment' },
  { type: 'Referral', queue: 'Scheduling', priority: 'This week', test: /\breferr(al|ed)\b/i, reason: 'A referral needs a first appointment booked' },
  { type: 'Records request', queue: 'Records', priority: 'This week', test: /\b(records?|copy of my (file|chart)|transfer (my )?file)\b/i, reason: 'A request for records' },
  { type: 'Billing or insurance', queue: 'Billing', priority: 'This week', test: /\b(insur\w*|claim|invoice|receipt|payment|bill(ing)?)\b/i, reason: 'Mentions insurance, a claim or payment' },
  { type: 'New appointment', queue: 'Scheduling', priority: 'This week', test: /\b(book|appointment|availability|opening)\b/i, reason: 'Asks to book an appointment' },
];

export function route(item: AdminItem): Routed {
  const text = `${item.subject}. ${item.body}`;
  const rule = RULES.find((r) => r.test.test(text));
  if (!rule) return { ...item, type: 'General inquiry', queue: 'Front desk', priority: 'Routine', reason: 'No specific match: a person at the front desk reviews it', automated: true };
  return { ...item, type: rule.type, queue: rule.queue, priority: rule.priority, reason: rule.reason, automated: rule.automated ?? true };
}

export type Appointment = { patient: string; at: string; with: string };
export const TOMORROW: Appointment[] = [
  { patient: 'A. Fictional', at: '9:00 am', with: 'Dr. Example' },
  { patient: 'B. Sample', at: '10:30 am', with: 'Dr. Example' },
  { patient: 'C. Placeholder', at: '1:15 pm', with: 'Nurse practitioner' },
  { patient: 'D. Demo', at: '3:45 pm', with: 'Dr. Example' },
];

export const REMINDER_RULES = [
  { key: '48h', label: '2 days before', channel: 'Email' },
  { key: '24h', label: '1 day before', channel: 'Text message' },
  { key: '2h', label: '2 hours before', channel: 'Text message' },
] as const;

/**
 * The reminder each patient would receive. It holds the time and place only:
 * no reason for the visit, nothing clinical.
 */
export function reminderText(a: Appointment, rule: (typeof REMINDER_RULES)[number]['key'], clinic = 'Brightside Clinic (fictional)') {
  const when = rule === '2h' ? 'today' : rule === '24h' ? 'tomorrow' : 'in two days';
  return `Reminder: your appointment at ${clinic} is ${when} at ${a.at}. Reply C to confirm or R to reschedule.`;
}

export function reminderPlan(enabled: string[]) {
  const rules = REMINDER_RULES.filter((r) => enabled.includes(r.key));
  return { perPatient: rules.length, total: rules.length * TOMORROW.length, rules };
}
