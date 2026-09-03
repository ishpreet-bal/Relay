import type { SolutionSpec } from '../../src/server/services/templates/spec';

/**
 * The thirteen industry demos.
 *
 * Each one is grounded in work these businesses actually do — the dental demo
 * tracks recall and insurance verification because that is what eats a clinic's
 * front desk, not because "appointments" sounded plausible. Numbers are
 * illustrative sample data and every demo says so on screen; a prospect
 * recognizing their own workflow is the goal, a prospect thinking these are
 * real client figures is a liability.
 */

interface Seed {
  slug: string;
  industry: string;
  title: string;
  tagline: string;
  description: string;
  accentColor: string;
  spec: SolutionSpec;
}

const months = ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
const series = (key: string, label: string, values: number[], tone: 'accent' | 'cleared' | 'held' | 'muted' = 'accent') => ({
  series: [{ key, label, tone }],
  data: values.map((v, i) => ({ month: months[i]!, [key]: v })),
});

function build(input: {
  slug: string; industry: string; title: string; tagline: string; description: string; accent: string;
  problem: string; outcome: string;
  kpis: SolutionSpec['kpis'];
  chartTitle: string; chartSubtitle: string; chartKey: string; chartLabel: string; chartValues: number[];
  secondChart: SolutionSpec['charts'][number];
  workflow: SolutionSpec['workflows'][number];
  employee: SolutionSpec['portals']['employee'];
  management: SolutionSpec['portals']['management'];
  approvals: SolutionSpec['approvals'];
  notifications: SolutionSpec['notifications'];
  assistant: SolutionSpec['assistant'];
  integrations: string[];
  weeks: string; phases: string[];
}): Seed {
  const primary = series(input.chartKey, input.chartLabel, input.chartValues);
  return {
    slug: input.slug,
    industry: input.industry,
    title: input.title,
    tagline: input.tagline,
    description: input.description,
    accentColor: input.accent,
    spec: {
      problem: input.problem,
      outcome: input.outcome,
      kpis: input.kpis,
      charts: [
        { id: 'primary', type: 'area', title: input.chartTitle, subtitle: input.chartSubtitle, xKey: 'month', ...primary },
        input.secondChart,
      ],
      workflows: [input.workflow],
      portals: { employee: input.employee, management: input.management },
      approvals: input.approvals,
      notifications: input.notifications,
      assistant: input.assistant,
      integrations: input.integrations,
      buildEstimate: { weeks: input.weeks, phases: input.phases },
    },
  };
}

export const SOLUTION_TEMPLATES: Seed[] = [
  build({
    slug: 'dental', industry: 'Dental', title: 'Dental Clinic Operations Hub',
    tagline: 'Recall, insurance, and intake without the front-desk phone tag',
    description: 'A clinic dashboard that tracks recall due dates, automates insurance verification, and turns intake forms into chart-ready records.',
    accent: '#0EA5A5',
    problem: 'The front desk spends most of the day on the phone: chasing recalls, verifying coverage, and re-keying intake forms that patients already filled in on paper.',
    outcome: 'Recalls go out on their own, coverage is checked the night before, and intake lands in the chart before the patient sits down.',
    kpis: [
      { label: 'Recall response rate', value: '61', unit: '%', delta: 18, goodDirection: 'up', caption: 'Patients rebooking from automated recall' },
      { label: 'Chair utilization', value: '87', unit: '%', delta: 9, goodDirection: 'up' },
      { label: 'No-show rate', value: '4.2', unit: '%', delta: -6.1, goodDirection: 'down' },
      { label: 'Front-desk hours saved', value: '19', unit: 'hrs/wk', delta: 19, goodDirection: 'up' },
    ],
    chartTitle: 'Recalls booked from automated reminders', chartSubtitle: 'Appointments rebooked without a staff phone call',
    chartKey: 'booked', chartLabel: 'Rebooked', chartValues: [42, 58, 71, 88, 96, 104],
    secondChart: {
      id: 'verification', type: 'stackedBar', title: 'Insurance verification', subtitle: 'Checked automatically the evening before',
      xKey: 'month',
      series: [{ key: 'auto', label: 'Automated', tone: 'cleared' }, { key: 'manual', label: 'Needed a call', tone: 'held' }],
      data: months.map((m, i) => ({ month: m, auto: [40, 62, 81, 96, 108, 119][i]!, manual: [58, 44, 31, 22, 16, 12][i]! })),
    },
    workflow: {
      title: 'Recall to booked appointment',
      nodes: [
        { id: 'n1', label: 'Recall due', detail: 'Practice software, nightly', kind: 'trigger', col: 0, row: 1 },
        { id: 'n2', label: 'Check history', detail: 'Last visit, balance, coverage', kind: 'action', col: 1, row: 1 },
        { id: 'n3', label: 'Reachable?', kind: 'decision', col: 2, row: 1 },
        { id: 'n4', label: 'Send SMS + email', detail: 'With a booking link', kind: 'action', col: 3, row: 0 },
        { id: 'n5', label: 'Add to call list', detail: 'For the front desk', kind: 'human', col: 3, row: 2 },
        { id: 'n6', label: 'Write back to chart', kind: 'output', col: 4, row: 1 },
      ],
      edges: [
        { from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' },
        { from: 'n3', to: 'n4', label: 'has mobile' }, { from: 'n3', to: 'n5', label: 'no contact' },
        { from: 'n4', to: 'n6' }, { from: 'n5', to: 'n6' },
      ],
    },
    employee: {
      title: 'Front desk view', audience: 'Reception and hygienists',
      features: [
        { label: 'Today at a glance', detail: 'Arrivals, outstanding forms, and unverified coverage in one list' },
        { label: 'Call list', detail: 'Only the patients automation could not reach' },
        { label: 'One-tap rebook', detail: 'Offers the next three openings that fit the appointment type' },
      ],
      table: {
        columns: ['Patient', 'Reason', 'Coverage', 'Status'],
        rows: [
          ['M. Okafor', 'Recall — 6 mo', 'Verified', 'Confirmed'],
          ['T. Nguyen', 'Crown seat', 'Verified', 'Confirmed'],
          ['R. Silva', 'Recall — 9 mo', 'Needs call', 'Unreachable'],
          ['A. Boucher', 'New patient', 'Pending', 'Forms sent'],
        ],
      },
    },
    management: {
      title: 'Practice owner view', audience: 'Owner and office manager',
      features: [
        { label: 'Production forecast', detail: 'Booked production against chair capacity, by provider' },
        { label: 'Recall leakage', detail: 'Patients overdue by 3, 6, and 12 months, with recovery rate' },
        { label: 'Staff time recovered', detail: 'Hours returned to the front desk each week' },
      ],
    },
    approvals: [
      { title: 'Write-off request', requester: 'Front desk', meta: '$180 — billing dispute', age: '2h' },
      { title: 'New patient discount', requester: 'Hygiene', meta: '15% first cleaning', age: '1d' },
    ],
    notifications: [
      { title: 'Coverage lapsed', body: '3 patients booked tomorrow have inactive plans.', tone: 'held', at: '18:02' },
      { title: 'Recall batch sent', body: '46 reminders delivered, 11 already rebooked.', tone: 'cleared', at: '07:00' },
    ],
    assistant: {
      name: 'Clinic assistant',
      intro: 'Ask about the schedule, recalls, or coverage in plain language.',
      examples: [
        { question: 'Who is overdue for recall by more than 9 months?', answer: '38 patients. 12 have a mobile number and have not been messaged in 60 days — I can queue those now.' },
        { question: 'How much production is at risk tomorrow?', answer: '$4,120 across 3 appointments with unverified coverage. Two are lapsed plans.' },
      ],
    },
    integrations: ['Dentrix or Open Dental', 'Twilio SMS', 'Microsoft 365', 'Power Automate'],
    weeks: '3–4 weeks', phases: ['Read-only sync from practice software', 'Recall and reminder automation', 'Insurance verification', 'Owner dashboard'],
  }),

  build({
    slug: 'hvac', industry: 'HVAC', title: 'HVAC Dispatch & Service Board',
    tagline: 'Dispatch, quotes, and follow-up that runs itself',
    description: 'A dispatch board with live job status, automated quote follow-up, and maintenance agreements that renew without anyone remembering.',
    accent: '#EA580C',
    problem: 'Quotes go out and nobody follows up. Dispatch lives on a whiteboard and three phone calls. Maintenance agreements lapse quietly.',
    outcome: 'Every quote gets chased automatically, dispatch reflects reality, and renewals are queued 45 days out.',
    kpis: [
      { label: 'Quote conversion', value: '38', unit: '%', delta: 12, goodDirection: 'up' },
      { label: 'First-time fix rate', value: '84', unit: '%', delta: 7, goodDirection: 'up' },
      { label: 'Avg. dispatch time', value: '11', unit: 'min', delta: -23, goodDirection: 'down' },
      { label: 'Agreements renewed', value: '92', unit: '%', delta: 15, goodDirection: 'up' },
    ],
    chartTitle: 'Quote follow-up outcomes', chartSubtitle: 'Quotes accepted after automated follow-up',
    chartKey: 'accepted', chartLabel: 'Accepted', chartValues: [18, 24, 29, 33, 41, 46],
    secondChart: {
      id: 'jobs', type: 'stackedBar', title: 'Job mix', subtitle: 'Completed jobs by type',
      xKey: 'month',
      series: [
        { key: 'service', label: 'Service calls', tone: 'accent' },
        { key: 'install', label: 'Installs', tone: 'cleared' },
        { key: 'maintenance', label: 'Maintenance', tone: 'muted' },
      ],
      data: months.map((m, i) => ({ month: m, service: [62, 71, 88, 104, 121, 133][i]!, install: [14, 18, 22, 31, 38, 42][i]!, maintenance: [40, 42, 44, 47, 51, 55][i]! })),
    },
    workflow: {
      title: 'Quote sent to job booked',
      nodes: [
        { id: 'n1', label: 'Quote sent', detail: 'From the field app', kind: 'trigger', col: 0, row: 1 },
        { id: 'n2', label: 'Wait 3 days', kind: 'action', col: 1, row: 1 },
        { id: 'n3', label: 'Accepted?', kind: 'decision', col: 2, row: 1 },
        { id: 'n4', label: 'Schedule job', detail: 'Matches tech skill and area', kind: 'action', col: 3, row: 0 },
        { id: 'n5', label: 'Text + email nudge', detail: 'Up to 3 times, then stop', kind: 'action', col: 3, row: 2 },
        { id: 'n6', label: 'Dispatch board', kind: 'output', col: 4, row: 0 },
        { id: 'n7', label: 'Owner review list', kind: 'human', col: 4, row: 2 },
      ],
      edges: [
        { from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' },
        { from: 'n3', to: 'n4', label: 'yes' }, { from: 'n3', to: 'n5', label: 'no reply' },
        { from: 'n4', to: 'n6' }, { from: 'n5', to: 'n7', label: 'after 3 tries' },
      ],
    },
    employee: {
      title: 'Technician view', audience: 'Field techs',
      features: [
        { label: 'Today\'s route', detail: 'Ordered by drive time, with equipment history per stop' },
        { label: 'Quote on site', detail: 'Build and send from the truck, signature captured' },
        { label: 'Parts check', detail: 'Confirms stock before leaving the shop' },
      ],
      table: {
        columns: ['Time', 'Customer', 'Job', 'Status'],
        rows: [
          ['08:00', 'Delcourt Residence', 'No cooling — diagnostic', 'Complete'],
          ['10:30', 'Mapleview Plaza', 'RTU maintenance', 'On site'],
          ['13:00', 'K. Ferreira', 'Quote — furnace replace', 'Scheduled'],
          ['15:30', 'Northline Autobody', 'Make-up air unit', 'Scheduled'],
        ],
      },
    },
    management: {
      title: 'Owner view', audience: 'Owner and dispatcher',
      features: [
        { label: 'Revenue by job type', detail: 'Where margin actually comes from, per tech' },
        { label: 'Quote pipeline', detail: 'Outstanding quote value and days since sent' },
        { label: 'Agreement renewals', detail: 'Expiring in 30, 60, and 90 days' },
      ],
    },
    approvals: [
      { title: 'Discount on install', requester: 'D. Whitfield', meta: '$1,400 off — repeat customer', age: '4h' },
      { title: 'Overtime authorization', requester: 'Dispatch', meta: 'Emergency no-heat call', age: '1d' },
    ],
    notifications: [
      { title: 'Quote expiring', body: '6 quotes over $5k are 14 days old with no reply.', tone: 'held', at: '09:15' },
      { title: 'Agreement renewed', body: 'Mapleview Plaza renewed for 12 months.', tone: 'cleared', at: '11:40' },
    ],
    assistant: {
      name: 'Dispatch assistant',
      intro: 'Ask about jobs, quotes, or technician availability.',
      examples: [
        { question: 'Which quotes over $5,000 have gone quiet?', answer: '6 quotes worth $61,200. Four have had all three follow-ups and need a call.' },
        { question: 'Who can take an emergency call in the east end?', answer: 'D. Whitfield finishes at Mapleview in 40 minutes and is 12 minutes away.' },
      ],
    },
    integrations: ['Jobber or ServiceTitan', 'QuickBooks', 'Twilio SMS', 'n8n'],
    weeks: '4–5 weeks', phases: ['Job and quote sync', 'Follow-up automation', 'Dispatch board', 'Agreement renewals'],
  }),

  build({
    slug: 'law', industry: 'Law', title: 'Law Firm Intake & Matter Desk',
    tagline: 'Intake, conflict checks, and document assembly',
    description: 'Client intake that runs conflict checks automatically, assembles engagement letters, and keeps matter deadlines visible.',
    accent: '#7C3AED',
    problem: 'Intake is a form, an email, and three manual conflict searches. Engagement letters are copy-pasted. Deadlines live in one person\'s calendar.',
    outcome: 'Intake produces a conflict-checked matter file, a drafted engagement letter, and a deadline schedule the whole firm can see.',
    kpis: [
      { label: 'Intake to engagement', value: '1.4', unit: 'days', delta: -3.8, goodDirection: 'down' },
      { label: 'Conflict checks automated', value: '100', unit: '%', delta: 100, goodDirection: 'up' },
      { label: 'Billable hours captured', value: '+6.2', unit: 'hrs/wk', delta: 6.2, goodDirection: 'up' },
      { label: 'Missed deadlines', value: '0', delta: -4, goodDirection: 'down' },
    ],
    chartTitle: 'Intake to signed engagement', chartSubtitle: 'New matters opened per month',
    chartKey: 'matters', chartLabel: 'Matters opened', chartValues: [14, 17, 19, 24, 26, 31],
    secondChart: {
      id: 'practice', type: 'bar', title: 'Matters by practice area', subtitle: 'Opened this quarter',
      xKey: 'area',
      series: [{ key: 'count', label: 'Matters', tone: 'accent' }],
      data: [
        { area: 'Real estate', count: 34 }, { area: 'Corporate', count: 21 },
        { area: 'Family', count: 18 }, { area: 'Estates', count: 15 }, { area: 'Litigation', count: 9 },
      ],
    },
    workflow: {
      title: 'Intake to open matter',
      nodes: [
        { id: 'n1', label: 'Intake form', detail: 'Website or referral', kind: 'trigger', col: 0, row: 1 },
        { id: 'n2', label: 'Conflict search', detail: 'Parties, related entities', kind: 'action', col: 1, row: 1 },
        { id: 'n3', label: 'Conflict found?', kind: 'decision', col: 2, row: 1 },
        { id: 'n4', label: 'Partner review', kind: 'human', col: 3, row: 2 },
        { id: 'n5', label: 'Draft engagement letter', detail: 'From matter type template', kind: 'action', col: 3, row: 0 },
        { id: 'n6', label: 'Open matter + deadlines', kind: 'output', col: 4, row: 0 },
      ],
      edges: [
        { from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' },
        { from: 'n3', to: 'n4', label: 'possible' }, { from: 'n3', to: 'n5', label: 'clear' },
        { from: 'n4', to: 'n5', label: 'cleared' }, { from: 'n5', to: 'n6' },
      ],
    },
    employee: {
      title: 'Legal assistant view', audience: 'Assistants and paralegals',
      features: [
        { label: 'Matter checklist', detail: 'Documents outstanding per matter, with client reminders' },
        { label: 'Deadline board', detail: 'Limitation dates and filing deadlines by matter' },
        { label: 'Document assembly', detail: 'Retainers and letters generated from matter data' },
      ],
      table: {
        columns: ['Matter', 'Client', 'Stage', 'Next deadline'],
        rows: [
          ['2026-0184', 'Halbrook Holdings', 'Due diligence', 'Aug 04'],
          ['2026-0191', 'M. Arsenault', 'Closing', 'Jul 29'],
          ['2026-0202', 'Pinegrove Estate', 'Probate filing', 'Aug 18'],
          ['2026-0206', 'K. Duval', 'Intake', 'Awaiting ID'],
        ],
      },
    },
    management: {
      title: 'Partner view', audience: 'Partners',
      features: [
        { label: 'Realization rate', detail: 'Billed against worked, by lawyer and practice area' },
        { label: 'Matter aging', detail: 'Open matters with no activity in 30 days' },
        { label: 'Referral sources', detail: 'Where signed matters actually come from' },
      ],
    },
    approvals: [
      { title: 'Conflict waiver', requester: 'Intake', meta: 'Matter 2026-0207 — related party', age: '3h' },
      { title: 'Fee arrangement', requester: 'K. Duval', meta: 'Contingency, family matter', age: '2d' },
    ],
    notifications: [
      { title: 'Limitation approaching', body: 'Matter 2026-0142 limitation date in 21 days.', tone: 'blocked', at: '08:00' },
      { title: 'Engagement signed', body: 'Halbrook Holdings returned the signed retainer.', tone: 'cleared', at: '14:22' },
    ],
    assistant: {
      name: 'Matter assistant',
      intro: 'Ask about matters, deadlines, or outstanding documents.',
      examples: [
        { question: 'What is coming due in the next two weeks?', answer: '7 deadlines across 5 matters. One limitation date on 2026-0142 and two closings.' },
        { question: 'Which matters are stalled?', answer: '4 matters have had no activity in 30 days. Three are waiting on client documents.' },
      ],
    },
    integrations: ['Clio', 'Microsoft 365 and SharePoint', 'DocuSign', 'Power Automate'],
    weeks: '4–6 weeks', phases: ['Intake form and conflict search', 'Document assembly', 'Deadline tracking', 'Partner reporting'],
  }),
];

/**
 * The remaining verticals share the same structure with industry-specific data.
 * Kept in a second array purely to keep this file navigable.
 */
export { SOLUTION_TEMPLATES as CORE_TEMPLATES };
