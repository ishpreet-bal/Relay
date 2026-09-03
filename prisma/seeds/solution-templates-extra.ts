import type { SolutionSpec } from '../../src/server/services/templates/spec';

const months = ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];

interface Seed { slug: string; industry: string; title: string; tagline: string; description: string; accentColor: string; spec: SolutionSpec }

/** Compact builder for the remaining verticals — same spec shape, less ceremony. */
function t(i: {
  slug: string; industry: string; title: string; tagline: string; description: string; accent: string;
  problem: string; outcome: string;
  kpis: SolutionSpec['kpis'];
  chart: { title: string; subtitle: string; key: string; label: string; values: number[] };
  bars: { title: string; subtitle: string; xKey: string; data: Array<Record<string, string | number>>; series: SolutionSpec['charts'][number]['series'] };
  workflow: SolutionSpec['workflows'][number];
  employee: SolutionSpec['portals']['employee'];
  management: SolutionSpec['portals']['management'];
  approvals: SolutionSpec['approvals'];
  notifications: SolutionSpec['notifications'];
  assistant: SolutionSpec['assistant'];
  integrations: string[]; weeks: string; phases: string[];
}): Seed {
  return {
    slug: i.slug, industry: i.industry, title: i.title, tagline: i.tagline,
    description: i.description, accentColor: i.accent,
    spec: {
      problem: i.problem, outcome: i.outcome, kpis: i.kpis,
      charts: [
        {
          id: 'primary', type: 'area', title: i.chart.title, subtitle: i.chart.subtitle, xKey: 'month',
          series: [{ key: i.chart.key, label: i.chart.label, tone: 'accent' }],
          data: i.chart.values.map((v, n) => ({ month: months[n]!, [i.chart.key]: v })),
        },
        { id: 'secondary', type: 'bar', title: i.bars.title, subtitle: i.bars.subtitle, xKey: i.bars.xKey, series: i.bars.series, data: i.bars.data },
      ],
      workflows: [i.workflow],
      portals: { employee: i.employee, management: i.management },
      approvals: i.approvals, notifications: i.notifications, assistant: i.assistant,
      integrations: i.integrations,
      buildEstimate: { weeks: i.weeks, phases: i.phases },
    },
  };
}

export const EXTRA_TEMPLATES: Seed[] = [
  t({
    slug: 'manufacturing', industry: 'Manufacturing', title: 'Production Floor Reporting',
    tagline: 'Shop-floor data you already collect, turned into decisions',
    description: 'Live production reporting, scrap tracking, and quote-to-order handoff built on the data your floor already produces.',
    accent: '#0F766E',
    problem: 'Production data lives on clipboards and in one spreadsheet a supervisor updates at the end of shift. Nobody knows scrap rate until month end.',
    outcome: 'Output, downtime, and scrap update as the shift runs, and quotes flow into work orders without re-keying.',
    kpis: [
      { label: 'OEE', value: '78', unit: '%', delta: 11, goodDirection: 'up' },
      { label: 'Scrap rate', value: '2.1', unit: '%', delta: -1.7, goodDirection: 'down' },
      { label: 'On-time delivery', value: '94', unit: '%', delta: 8, goodDirection: 'up' },
      { label: 'Admin hours saved', value: '22', unit: 'hrs/wk', delta: 22, goodDirection: 'up' },
    ],
    chart: { title: 'Units produced per shift', subtitle: 'Rolling average across all lines', key: 'units', label: 'Units', values: [1180, 1240, 1310, 1290, 1420, 1510] },
    bars: {
      title: 'Downtime by cause', subtitle: 'Hours lost this quarter', xKey: 'cause',
      series: [{ key: 'hours', label: 'Hours', tone: 'held' }],
      data: [{ cause: 'Changeover', hours: 42 }, { cause: 'Material wait', hours: 31 }, { cause: 'Breakdown', hours: 24 }, { cause: 'Quality hold', hours: 12 }],
    },
    workflow: {
      title: 'Shift data to management report',
      nodes: [
        { id: 'n1', label: 'Shift entry', detail: 'Tablet on the line', kind: 'trigger', col: 0, row: 1 },
        { id: 'n2', label: 'Validate counts', detail: 'Against work order', kind: 'action', col: 1, row: 1 },
        { id: 'n3', label: 'Variance > 5%?', kind: 'decision', col: 2, row: 1 },
        { id: 'n4', label: 'Flag supervisor', kind: 'human', col: 3, row: 2 },
        { id: 'n5', label: 'Update dashboard', kind: 'action', col: 3, row: 0 },
        { id: 'n6', label: 'Daily report', detail: 'Emailed at 06:00', kind: 'output', col: 4, row: 0 },
      ],
      edges: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }, { from: 'n3', to: 'n4', label: 'yes' }, { from: 'n3', to: 'n5', label: 'no' }, { from: 'n4', to: 'n5' }, { from: 'n5', to: 'n6' }],
    },
    employee: {
      title: 'Line supervisor view', audience: 'Supervisors and operators',
      features: [
        { label: 'Shift board', detail: 'Target versus actual, updating live' },
        { label: 'Downtime logging', detail: 'Two taps, with reason codes' },
        { label: 'Quality holds', detail: 'Flag a lot and notify QA instantly' },
      ],
      table: {
        columns: ['Line', 'Work order', 'Target', 'Actual'],
        rows: [['Line 1', 'WO-4412', '480', '512'], ['Line 2', 'WO-4418', '360', '331'], ['Line 3', 'WO-4420', '240', '244'], ['Line 4', 'Changeover', '—', '—']],
      },
    },
    management: {
      title: 'Plant manager view', audience: 'Plant and operations managers',
      features: [
        { label: 'OEE trend', detail: 'Availability, performance, and quality by line and shift' },
        { label: 'Cost of scrap', detail: 'Material cost of rejects, by part number' },
        { label: 'Order status', detail: 'Every open order against its promised ship date' },
      ],
    },
    approvals: [{ title: 'Overtime request', requester: 'Line 2', meta: '8 hrs — catch up WO-4418', age: '5h' }, { title: 'Rework authorization', requester: 'QA', meta: 'Lot 88213 — 240 units', age: '1d' }],
    notifications: [{ title: 'Line 2 behind target', body: 'Running 8% under with 3 hours left in shift.', tone: 'held', at: '13:40' }, { title: 'Order shipped', body: 'WO-4401 shipped complete, two days early.', tone: 'cleared', at: '10:12' }],
    assistant: {
      name: 'Floor assistant', intro: 'Ask about output, downtime, or open orders.',
      examples: [
        { question: 'What caused the most downtime last week?', answer: 'Changeovers, 42 hours. Line 3 accounts for 26 of those across 11 changeovers.' },
        { question: 'Which orders are at risk this week?', answer: '3 orders. WO-4418 is the tightest — 2 days of buffer at current rate.' },
      ],
    },
    integrations: ['ERP export or SQL', 'Power BI', 'SharePoint', 'Power Automate'],
    weeks: '5–7 weeks', phases: ['Shift data capture', 'Validation and alerting', 'OEE dashboard', 'Order status integration'],
  }),

  t({
    slug: 'construction', industry: 'Construction', title: 'Site Reporting & Sub Compliance',
    tagline: 'Daily reports, sub documents, and change orders in one place',
    description: 'Daily site reports captured from the field, subcontractor insurance tracked automatically, and change orders that do not get lost.',
    accent: '#B45309',
    problem: 'Daily reports are photos in a group chat. Subcontractor insurance expires without anyone noticing. Change orders live in email threads.',
    outcome: 'Field crews file a report in two minutes, expiring sub documents chase themselves, and every change order has a paper trail.',
    kpis: [
      { label: 'Reports filed on time', value: '96', unit: '%', delta: 34, goodDirection: 'up' },
      { label: 'Expired sub docs', value: '0', delta: -11, goodDirection: 'down' },
      { label: 'Change order cycle', value: '2.1', unit: 'days', delta: -5.4, goodDirection: 'down' },
      { label: 'Office hours saved', value: '16', unit: 'hrs/wk', delta: 16, goodDirection: 'up' },
    ],
    chart: { title: 'Daily reports filed', subtitle: 'Across all active sites', key: 'reports', label: 'Reports', values: [88, 112, 134, 141, 156, 168] },
    bars: {
      title: 'Change orders by project', subtitle: 'Value approved this quarter', xKey: 'project',
      series: [{ key: 'value', label: 'Value ($k)', tone: 'accent' }],
      data: [{ project: 'Riverside', value: 148 }, { project: 'Northgate', value: 92 }, { project: 'Depot Rd', value: 64 }, { project: 'Weston', value: 31 }],
    },
    workflow: {
      title: 'Daily report to client update',
      nodes: [
        { id: 'n1', label: 'Field submits', detail: 'Phone, with photos', kind: 'trigger', col: 0, row: 1 },
        { id: 'n2', label: 'Attach to project', detail: 'Weather, crew, hours', kind: 'action', col: 1, row: 1 },
        { id: 'n3', label: 'Delay flagged?', kind: 'decision', col: 2, row: 1 },
        { id: 'n4', label: 'Notify PM', kind: 'human', col: 3, row: 2 },
        { id: 'n5', label: 'File to SharePoint', kind: 'action', col: 3, row: 0 },
        { id: 'n6', label: 'Weekly client summary', kind: 'output', col: 4, row: 0 },
      ],
      edges: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }, { from: 'n3', to: 'n4', label: 'yes' }, { from: 'n3', to: 'n5', label: 'no' }, { from: 'n4', to: 'n5' }, { from: 'n5', to: 'n6' }],
    },
    employee: {
      title: 'Site view', audience: 'Foremen and site crews',
      features: [
        { label: 'Two-minute report', detail: 'Crew, hours, weather, and photos from the phone' },
        { label: 'Deficiency log', detail: 'Photo, location, and trade assigned in one step' },
        { label: 'Sub check-in', detail: 'Confirms insurance is current before anyone starts' },
      ],
      table: {
        columns: ['Site', 'Crew', 'Hours', 'Status'],
        rows: [['Riverside Ph2', '9', '72', 'Filed'], ['Northgate', '6', '48', 'Filed'], ['Depot Rd', '4', '32', 'Weather delay'], ['Weston', '11', '88', 'Filed']],
      },
    },
    management: {
      title: 'Project manager view', audience: 'PMs and owners',
      features: [
        { label: 'Labour by project', detail: 'Hours and cost against budget, updated daily' },
        { label: 'Compliance board', detail: 'Every sub, with WSIB and insurance expiry dates' },
        { label: 'Change order register', detail: 'Submitted, approved, and disputed values' },
      ],
    },
    approvals: [{ title: 'Change order #14', requester: 'Riverside PM', meta: '$18,400 — rock excavation', age: '6h' }, { title: 'Sub onboarding', requester: 'Site admin', meta: 'Kettle Electric — docs complete', age: '2d' }],
    notifications: [{ title: 'Insurance expiring', body: 'Two subs have certificates lapsing within 14 days.', tone: 'held', at: '07:30' }, { title: 'Weather delay logged', body: 'Depot Rd stood down at 11:00.', tone: 'info', at: '11:04' }],
    assistant: {
      name: 'Site assistant', intro: 'Ask about sites, labour, or subcontractor documents.',
      examples: [
        { question: 'Which subs are out of compliance?', answer: '2 subs. Kettle Electric WSIB expires in 9 days, Bramwell Mechanical insurance expired yesterday.' },
        { question: 'How many hours went to Riverside last week?', answer: '412 hours across 9 trades, 6% over the weekly budget line.' },
      ],
    },
    integrations: ['SharePoint', 'Procore or Buildertrend', 'Power BI', 'Power Automate'],
    weeks: '4–6 weeks', phases: ['Mobile daily reports', 'Document compliance tracking', 'Change order workflow', 'Client reporting'],
  }),

  t({
    slug: 'medical', industry: 'Medical', title: 'Clinic Intake & Referral Desk',
    tagline: 'Intake, referrals, and results follow-up without the fax machine',
    description: 'Patient intake that writes into the chart, referral tracking that closes the loop, and results follow-up that never gets missed.',
    accent: '#0284C7',
    problem: 'Intake forms are scanned and re-typed. Referrals are faxed and forgotten. Nobody is sure which results have been reviewed and communicated.',
    outcome: 'Intake arrives structured, every referral has a status, and unreviewed results surface before they become a safety issue.',
    kpis: [
      { label: 'Intake re-keying', value: '0', unit: 'forms', delta: -140, goodDirection: 'down' },
      { label: 'Referrals closed', value: '91', unit: '%', delta: 27, goodDirection: 'up' },
      { label: 'Results follow-up time', value: '1.2', unit: 'days', delta: -4.1, goodDirection: 'down' },
      { label: 'Admin hours saved', value: '24', unit: 'hrs/wk', delta: 24, goodDirection: 'up' },
    ],
    chart: { title: 'Referrals with confirmed outcome', subtitle: 'Loop closed within 30 days', key: 'closed', label: 'Closed', values: [46, 58, 71, 83, 94, 106] },
    bars: {
      title: 'Referral status', subtitle: 'Currently open', xKey: 'status',
      series: [{ key: 'count', label: 'Referrals', tone: 'accent' }],
      data: [{ status: 'Sent', count: 42 }, { status: 'Booked', count: 31 }, { status: 'Seen', count: 24 }, { status: 'No response', count: 8 }],
    },
    workflow: {
      title: 'Referral loop',
      nodes: [
        { id: 'n1', label: 'Referral created', kind: 'trigger', col: 0, row: 1 },
        { id: 'n2', label: 'Send to specialist', detail: 'Secure, with history', kind: 'action', col: 1, row: 1 },
        { id: 'n3', label: 'Response in 14d?', kind: 'decision', col: 2, row: 1 },
        { id: 'n4', label: 'Chase specialist', kind: 'action', col: 3, row: 2 },
        { id: 'n5', label: 'Record outcome', kind: 'action', col: 3, row: 0 },
        { id: 'n6', label: 'Close loop in chart', kind: 'output', col: 4, row: 0 },
      ],
      edges: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }, { from: 'n3', to: 'n5', label: 'yes' }, { from: 'n3', to: 'n4', label: 'no' }, { from: 'n4', to: 'n5' }, { from: 'n5', to: 'n6' }],
    },
    employee: {
      title: 'Clinic staff view', audience: 'MOAs and nurses',
      features: [
        { label: 'Intake queue', detail: 'Forms submitted, validated, and ready to attach' },
        { label: 'Referral tracker', detail: 'Every open referral with days since sent' },
        { label: 'Results inbox', detail: 'Unreviewed results ranked by urgency flag' },
      ],
      table: {
        columns: ['Patient', 'Referral', 'Sent', 'Status'],
        rows: [['J. Osei', 'Cardiology', '18 days', 'Chased'], ['P. Lam', 'Dermatology', '6 days', 'Booked'], ['S. Ivanov', 'Orthopedics', '31 days', 'No response'], ['D. Roy', 'Endocrinology', '3 days', 'Sent']],
      },
    },
    management: {
      title: 'Practice lead view', audience: 'Physicians and practice managers',
      features: [
        { label: 'Panel overview', detail: 'Visit volume, wait times, and no-show rate by provider' },
        { label: 'Referral performance', detail: 'Which specialists actually respond, and how fast' },
        { label: 'Safety net', detail: 'Results unreviewed beyond threshold, escalated' },
      ],
    },
    approvals: [{ title: 'After-hours access request', requester: 'MOA', meta: 'Chart access — on-call coverage', age: '1h' }, { title: 'Form template change', requester: 'Nursing', meta: 'Diabetes intake — added fields', age: '3d' }],
    notifications: [{ title: 'Referral overdue', body: '8 referrals have had no specialist response in 30 days.', tone: 'held', at: '08:15' }, { title: 'Urgent result', body: 'Flagged result awaiting review for 4 hours.', tone: 'blocked', at: '12:48' }],
    assistant: {
      name: 'Clinic assistant', intro: 'Ask about referrals, intake, or outstanding results.',
      examples: [
        { question: 'Which referrals have gone unanswered?', answer: '8 referrals past 30 days. Orthopedics accounts for 5 of them.' },
        { question: 'Any results still unreviewed?', answer: '3 results, one flagged urgent from this morning. I can page the on-call provider.' },
      ],
    },
    integrations: ['EMR (OSCAR, Accuro, or Telus)', 'Secure messaging', 'Microsoft 365', 'n8n'],
    weeks: '5–7 weeks', phases: ['Structured intake', 'Referral tracking', 'Results safety net', 'Practice reporting'],
  }),

  t({
    slug: 'accounting', industry: 'Accounting', title: 'Client Document & Season Desk',
    tagline: 'Document chasing that happens without you',
    description: 'Client document requests that follow up on their own, engagement letters that go out on schedule, and a season dashboard that shows where every file stands.',
    accent: '#166534',
    problem: 'Every season is the same: chasing clients for documents by email, one at a time, while trying to remember who has already sent what.',
    outcome: 'Requests go out in one batch, reminders escalate on their own, and the dashboard shows exactly which files are blocked and why.',
    kpis: [
      { label: 'Docs received on time', value: '82', unit: '%', delta: 29, goodDirection: 'up' },
      { label: 'Chase emails sent by staff', value: '0', delta: -310, goodDirection: 'down' },
      { label: 'Files completed', value: '412', delta: 88, goodDirection: 'up' },
      { label: 'Season hours saved', value: '140', unit: 'hrs', delta: 140, goodDirection: 'up' },
    ],
    chart: { title: 'Client documents received', subtitle: 'Complete submissions per week', key: 'received', label: 'Received', values: [34, 68, 121, 186, 244, 291] },
    bars: {
      title: 'Files by stage', subtitle: 'Current season', xKey: 'stage',
      series: [{ key: 'files', label: 'Files', tone: 'accent' }],
      data: [{ stage: 'Awaiting docs', files: 78 }, { stage: 'In prep', files: 54 }, { stage: 'Review', files: 31 }, { stage: 'Filed', files: 412 }],
    },
    workflow: {
      title: 'Document request to filed return',
      nodes: [
        { id: 'n1', label: 'Season opens', detail: 'Client list from practice software', kind: 'trigger', col: 0, row: 1 },
        { id: 'n2', label: 'Send checklist', detail: 'Tailored to prior year', kind: 'action', col: 1, row: 1 },
        { id: 'n3', label: 'Complete?', kind: 'decision', col: 2, row: 1 },
        { id: 'n4', label: 'Escalating reminders', detail: 'Day 7, 14, then a call task', kind: 'action', col: 3, row: 2 },
        { id: 'n5', label: 'Assign to preparer', kind: 'action', col: 3, row: 0 },
        { id: 'n6', label: 'Review and file', kind: 'human', col: 4, row: 0 },
      ],
      edges: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }, { from: 'n3', to: 'n5', label: 'yes' }, { from: 'n3', to: 'n4', label: 'missing' }, { from: 'n4', to: 'n3', label: 'recheck' }, { from: 'n5', to: 'n6' }],
    },
    employee: {
      title: 'Preparer view', audience: 'Preparers and admin',
      features: [
        { label: 'My queue', detail: 'Files ready to work, sorted by deadline' },
        { label: 'Missing items', detail: 'Exactly what each blocked file is waiting on' },
        { label: 'Client portal uploads', detail: 'Documents arrive named and filed automatically' },
      ],
      table: {
        columns: ['Client', 'Type', 'Missing', 'Days open'],
        rows: [['Northway Ltd', 'T2', 'Bank statements', '11'], ['A. Petrov', 'T1', '—', '3'], ['Kildare Group', 'T2', 'Payroll summary', '19'], ['R. Chan', 'T1', 'T4, RRSP slip', '6']],
      },
    },
    management: {
      title: 'Partner view', audience: 'Partners and managers',
      features: [
        { label: 'Season burn-down', detail: 'Files remaining against days to deadline' },
        { label: 'Capacity by preparer', detail: 'Assigned versus completed, week by week' },
        { label: 'Chronic late clients', detail: 'Who blocks the season every year, with cost' },
      ],
    },
    approvals: [{ title: 'Fee write-down', requester: 'Manager', meta: '$640 — Kildare Group', age: '4h' }, { title: 'Extension filing', requester: 'Preparer', meta: 'Northway Ltd', age: '1d' }],
    notifications: [{ title: 'Deadline in 14 days', body: '78 files still awaiting client documents.', tone: 'held', at: '06:00' }, { title: 'Batch reminders sent', body: '112 clients reminded, 34 uploaded within an hour.', tone: 'cleared', at: '09:00' }],
    assistant: {
      name: 'Season assistant', intro: 'Ask about files, missing documents, or capacity.',
      examples: [
        { question: 'Which files are blocked longest?', answer: '12 files past 15 days. Kildare Group at 19 days, waiting on a payroll summary.' },
        { question: 'Can we finish by the deadline at this rate?', answer: 'At the current completion rate of 31 files a week, 22 files would miss. Two more preparer days closes the gap.' },
      ],
    },
    integrations: ['QuickBooks or Xero', 'CaseWare', 'SharePoint', 'Power Automate'],
    weeks: '3–5 weeks', phases: ['Client checklist generation', 'Escalating reminders', 'Portal intake and filing', 'Season dashboard'],
  }),

  t({
    slug: 'electrical', industry: 'Electrical', title: 'Electrical Job & Permit Tracker',
    tagline: 'Job costing from field data, permits tracked to inspection',
    description: 'Field time and materials flow straight into job costing, and every permit is tracked from application through final inspection.',
    accent: '#CA8A04',
    problem: 'Job costs are reconstructed weeks later from memory and crumpled slips. Permits and inspections are tracked in someone\'s head.',
    outcome: 'Costs land the same day, and permit status is visible to the whole shop with inspection dates booked automatically.',
    kpis: [
      { label: 'Jobs costed same-day', value: '94', unit: '%', delta: 61, goodDirection: 'up' },
      { label: 'Margin visibility', value: '2', unit: 'days', delta: -19, goodDirection: 'down' },
      { label: 'Failed inspections', value: '1', delta: -6, goodDirection: 'down' },
      { label: 'Office hours saved', value: '14', unit: 'hrs/wk', delta: 14, goodDirection: 'up' },
    ],
    chart: { title: 'Job margin accuracy', subtitle: 'Estimated versus actual, variance %', key: 'variance', label: 'Variance %', values: [18, 14, 11, 8, 6, 4] },
    bars: {
      title: 'Permits by stage', subtitle: 'Open permits', xKey: 'stage',
      series: [{ key: 'count', label: 'Permits', tone: 'accent' }],
      data: [{ stage: 'Applied', count: 9 }, { stage: 'Approved', count: 14 }, { stage: 'Rough-in', count: 7 }, { stage: 'Final', count: 5 }],
    },
    workflow: {
      title: 'Field entry to job cost',
      nodes: [
        { id: 'n1', label: 'Tech logs time', detail: 'Phone, at the job', kind: 'trigger', col: 0, row: 1 },
        { id: 'n2', label: 'Match to job', detail: 'Plus materials scanned', kind: 'action', col: 1, row: 1 },
        { id: 'n3', label: 'Over estimate?', kind: 'decision', col: 2, row: 1 },
        { id: 'n4', label: 'Alert owner', kind: 'human', col: 3, row: 2 },
        { id: 'n5', label: 'Post to accounting', kind: 'action', col: 3, row: 0 },
        { id: 'n6', label: 'Margin dashboard', kind: 'output', col: 4, row: 0 },
      ],
      edges: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }, { from: 'n3', to: 'n4', label: 'yes' }, { from: 'n3', to: 'n5', label: 'no' }, { from: 'n4', to: 'n5' }, { from: 'n5', to: 'n6' }],
    },
    employee: {
      title: 'Electrician view', audience: 'Field electricians',
      features: [
        { label: 'Time and materials', detail: 'Logged against the job in under a minute' },
        { label: 'Permit status', detail: 'What stage each site is at, and what is booked' },
        { label: 'Deficiency photos', detail: 'Captured and attached to the job file' },
      ],
      table: {
        columns: ['Job', 'Site', 'Stage', 'Inspection'],
        rows: [['J-2214', 'Weston Retail', 'Rough-in', 'Jul 28'], ['J-2219', 'Halcott Reno', 'Final', 'Aug 02'], ['J-2226', 'Bay St Condo', 'Applied', 'Pending'], ['J-2231', 'Ferris Shop', 'Approved', 'Not booked']],
      },
    },
    management: {
      title: 'Owner view', audience: 'Owner and estimator',
      features: [
        { label: 'Margin by job type', detail: 'Where the shop actually makes money' },
        { label: 'Estimate accuracy', detail: 'Estimated versus actual, by estimator' },
        { label: 'Inspection calendar', detail: 'Every booked and unbooked inspection' },
      ],
    },
    approvals: [{ title: 'Material purchase', requester: 'J-2219', meta: '$3,100 — panel upgrade', age: '2h' }, { title: 'Change order', requester: 'Weston Retail', meta: '$7,400 — added circuits', age: '1d' }],
    notifications: [{ title: 'Job over estimate', body: 'J-2226 is 22% over labour estimate at 60% complete.', tone: 'held', at: '15:20' }, { title: 'Inspection passed', body: 'Halcott Reno final inspection passed.', tone: 'cleared', at: '10:05' }],
    assistant: {
      name: 'Job assistant', intro: 'Ask about job costs, permits, or inspections.',
      examples: [
        { question: 'Which jobs are losing money?', answer: '2 jobs. J-2226 is 22% over on labour, J-2208 is 9% over on materials.' },
        { question: 'What inspections are unbooked?', answer: '3 permits are approved but have no inspection booked. Ferris Shop is the oldest at 12 days.' },
      ],
    },
    integrations: ['QuickBooks', 'Jobber', 'Municipal permit portals', 'n8n'],
    weeks: '4–5 weeks', phases: ['Field time and material capture', 'Job costing sync', 'Permit tracking', 'Margin dashboard'],
  }),

  t({
    slug: 'plumbing', industry: 'Plumbing', title: 'Plumbing Call & Invoice Desk',
    tagline: 'After-hours triage and invoices that collect themselves',
    description: 'After-hours calls triaged and routed, jobs invoiced from the truck, and outstanding balances chased without the awkward phone call.',
    accent: '#0369A1',
    problem: 'After-hours calls go to whoever answers. Invoices are written up days later, and chasing unpaid balances is nobody\'s favourite job so it does not happen.',
    outcome: 'Calls are triaged and routed by urgency, invoices go out before the truck leaves, and reminders escalate on their own.',
    kpis: [
      { label: 'Days sales outstanding', value: '19', unit: 'days', delta: -22, goodDirection: 'down' },
      { label: 'Invoiced same day', value: '89', unit: '%', delta: 54, goodDirection: 'up' },
      { label: 'After-hours conversion', value: '71', unit: '%', delta: 18, goodDirection: 'up' },
      { label: 'Admin hours saved', value: '12', unit: 'hrs/wk', delta: 12, goodDirection: 'up' },
    ],
    chart: { title: 'Outstanding receivables', subtitle: 'Balance over 30 days, $k', key: 'balance', label: 'Over 30 days ($k)', values: [86, 78, 64, 51, 42, 31] },
    bars: {
      title: 'Calls by urgency', subtitle: 'After-hours, this month', xKey: 'urgency',
      series: [{ key: 'calls', label: 'Calls', tone: 'accent' }],
      data: [{ urgency: 'Emergency', calls: 22 }, { urgency: 'Same day', calls: 41 }, { urgency: 'Next day', calls: 58 }, { urgency: 'Quote only', calls: 34 }],
    },
    workflow: {
      title: 'After-hours call to booked job',
      nodes: [
        { id: 'n1', label: 'Call or form', detail: 'Any hour', kind: 'trigger', col: 0, row: 1 },
        { id: 'n2', label: 'Triage questions', detail: 'Water shut off? Flooding?', kind: 'action', col: 1, row: 1 },
        { id: 'n3', label: 'Emergency?', kind: 'decision', col: 2, row: 1 },
        { id: 'n4', label: 'Page on-call tech', kind: 'human', col: 3, row: 0 },
        { id: 'n5', label: 'Book next slot', kind: 'action', col: 3, row: 2 },
        { id: 'n6', label: 'Confirm by text', kind: 'output', col: 4, row: 1 },
      ],
      edges: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }, { from: 'n3', to: 'n4', label: 'yes' }, { from: 'n3', to: 'n5', label: 'no' }, { from: 'n4', to: 'n6' }, { from: 'n5', to: 'n6' }],
    },
    employee: {
      title: 'Plumber view', audience: 'Field plumbers',
      features: [
        { label: 'Invoice from the truck', detail: 'Line items, photos, and payment link before leaving' },
        { label: 'Job history', detail: 'What was done at this address last time' },
        { label: 'Parts used', detail: 'Deducted from truck stock automatically' },
      ],
      table: {
        columns: ['Time', 'Address', 'Issue', 'Status'],
        rows: [['07:40', '18 Kerr Ave', 'Burst supply line', 'Complete — invoiced'], ['10:15', 'Ferndale Plaza', 'Backflow test', 'On site'], ['13:00', '92 Bellwood', 'Water heater quote', 'Scheduled'], ['16:00', 'Rosslyn Apts', 'Drain clearing', 'Scheduled']],
      },
    },
    management: {
      title: 'Owner view', audience: 'Owner and office',
      features: [
        { label: 'Receivables aging', detail: 'What is owed, by how long, with reminder status' },
        { label: 'Revenue per truck', detail: 'Jobs, hours, and revenue by technician' },
        { label: 'Call source', detail: 'Which channels produce booked work' },
      ],
    },
    approvals: [{ title: 'Payment plan', requester: 'Office', meta: 'Rosslyn Apts — $4,200 over 3 months', age: '3h' }, { title: 'Warranty callback', requester: 'Tech', meta: '18 Kerr Ave — no charge', age: '2d' }],
    notifications: [{ title: 'Invoice unpaid 45 days', body: '4 invoices totalling $11,300 past 45 days.', tone: 'held', at: '08:00' }, { title: 'Payment received', body: 'Ferndale Plaza paid $2,140 online.', tone: 'cleared', at: '14:30' }],
    assistant: {
      name: 'Office assistant', intro: 'Ask about jobs, invoices, or receivables.',
      examples: [
        { question: 'Who owes us the most?', answer: 'Rosslyn Apts at $4,200, 52 days out. Three reminders sent, no response to the last one.' },
        { question: 'How did after-hours calls convert last month?', answer: '155 calls, 110 booked. Emergencies converted at 95%, quote-only at 38%.' },
      ],
    },
    integrations: ['Housecall Pro or Jobber', 'QuickBooks', 'Twilio', 'Stripe'],
    weeks: '3–4 weeks', phases: ['Call triage and routing', 'Field invoicing', 'Receivables automation', 'Owner dashboard'],
  }),

  t({
    slug: 'auto-repair', industry: 'Auto Repair', title: 'Shop Estimate & Service Desk',
    tagline: 'Text approvals and service reminders that bring cars back',
    description: 'Digital inspections with text approvals, service reminders based on last visit, and bay scheduling that reflects reality.',
    accent: '#B91C1C',
    problem: 'Approvals happen by phone tag while the car sits on the hoist. Nobody reminds customers when service is due, so they drift to the dealer.',
    outcome: 'Estimates go by text with photos and get approved in minutes, and service reminders bring cars back on schedule.',
    kpis: [
      { label: 'Estimate approval time', value: '14', unit: 'min', delta: -96, goodDirection: 'down' },
      { label: 'Approved work value', value: '+27', unit: '%', delta: 27, goodDirection: 'up' },
      { label: 'Return visit rate', value: '58', unit: '%', delta: 16, goodDirection: 'up' },
      { label: 'Bay utilization', value: '81', unit: '%', delta: 12, goodDirection: 'up' },
    ],
    chart: { title: 'Work approved from digital inspections', subtitle: 'Approved value, $k per month', key: 'approved', label: 'Approved ($k)', values: [42, 51, 58, 66, 74, 83] },
    bars: {
      title: 'Declined work', subtitle: 'Value by reason, this quarter', xKey: 'reason',
      series: [{ key: 'value', label: 'Value ($k)', tone: 'held' }],
      data: [{ reason: 'Cost', value: 38 }, { reason: 'Will wait', value: 24 }, { reason: 'Second opinion', value: 11 }, { reason: 'No response', value: 9 }],
    },
    workflow: {
      title: 'Inspection to approved work',
      nodes: [
        { id: 'n1', label: 'Digital inspection', detail: 'Photos and notes per item', kind: 'trigger', col: 0, row: 1 },
        { id: 'n2', label: 'Build estimate', detail: 'Priced from parts catalogue', kind: 'action', col: 1, row: 1 },
        { id: 'n3', label: 'Text to customer', kind: 'action', col: 2, row: 1 },
        { id: 'n4', label: 'Approved?', kind: 'decision', col: 3, row: 1 },
        { id: 'n5', label: 'Order parts + schedule', kind: 'output', col: 4, row: 0 },
        { id: 'n6', label: 'Add to recall list', detail: 'Follow up in 90 days', kind: 'action', col: 4, row: 2 },
      ],
      edges: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }, { from: 'n3', to: 'n4' }, { from: 'n4', to: 'n5', label: 'yes' }, { from: 'n4', to: 'n6', label: 'declined' }],
    },
    employee: {
      title: 'Service advisor view', audience: 'Advisors and technicians',
      features: [
        { label: 'Bay board', detail: 'What is on each hoist, and what it is waiting for' },
        { label: 'Inspection builder', detail: 'Photo per item, priced as you go' },
        { label: 'Parts status', detail: 'Ordered, arriving, and back-ordered per job' },
      ],
      table: {
        columns: ['Bay', 'Vehicle', 'Work', 'Status'],
        rows: [['1', '2019 F-150', 'Brakes + rotors', 'Approved — in progress'], ['2', '2021 CR-V', 'Diagnostic', 'Awaiting approval'], ['3', '2016 Elantra', 'Timing belt', 'Parts on order'], ['4', '2022 Silverado', 'Oil + inspection', 'Complete']],
      },
    },
    management: {
      title: 'Owner view', audience: 'Shop owner',
      features: [
        { label: 'Effective labour rate', detail: 'Hours billed against hours available, by tech' },
        { label: 'Declined work recovery', detail: 'Value declined, and how much comes back later' },
        { label: 'Customer retention', detail: 'Return rate by service type and vehicle age' },
      ],
    },
    approvals: [{ title: 'Goodwill repair', requester: 'Advisor', meta: '$340 — repeat comeback', age: '1h' }, { title: 'Sublet authorization', requester: 'Bay 3', meta: 'Alignment — outside shop', age: '5h' }],
    notifications: [{ title: 'Estimate unanswered', body: '2 estimates sent over 3 hours ago with no response.', tone: 'held', at: '13:10' }, { title: 'Service reminders sent', body: '84 reminders sent, 19 already booked.', tone: 'cleared', at: '07:30' }],
    assistant: {
      name: 'Shop assistant', intro: 'Ask about bays, estimates, or customer history.',
      examples: [
        { question: 'What declined work is worth chasing?', answer: '$38k declined on cost in the last quarter. 22 of those vehicles are due for service anyway — I can add them to the reminder batch.' },
        { question: 'Which bay is blocking throughput?', answer: 'Bay 3 has been on parts hold for 2 days. The timing belt is back-ordered to Thursday.' },
      ],
    },
    integrations: ['Shop management system', 'Parts catalogue API', 'Twilio SMS', 'QuickBooks'],
    weeks: '4–5 weeks', phases: ['Digital inspection and estimates', 'Text approval flow', 'Service reminders', 'Owner reporting'],
  }),

  t({
    slug: 'car-dealership', industry: 'Car Dealership', title: 'Dealer Lead & Service Desk',
    tagline: 'Every listing lead in one place, answered in minutes',
    description: 'Leads from every listing site routed into one queue with response-time tracking, plus service booking confirmations that reduce no-shows.',
    accent: '#1D4ED8',
    problem: 'Leads arrive from six listing sites into six inboxes. Response time is whatever someone happens to notice. Service no-shows eat the schedule.',
    outcome: 'Every lead lands in one queue with an SLA clock, and service appointments confirm themselves.',
    kpis: [
      { label: 'Avg. first response', value: '8', unit: 'min', delta: -184, goodDirection: 'down' },
      { label: 'Lead-to-appointment', value: '34', unit: '%', delta: 13, goodDirection: 'up' },
      { label: 'Service no-shows', value: '6', unit: '%', delta: -9, goodDirection: 'down' },
      { label: 'Leads lost unanswered', value: '0', delta: -47, goodDirection: 'down' },
    ],
    chart: { title: 'Leads answered within 10 minutes', subtitle: 'Share of all inbound leads', key: 'fast', label: 'Answered fast (%)', values: [31, 48, 62, 74, 86, 93] },
    bars: {
      title: 'Leads by source', subtitle: 'This month', xKey: 'source',
      series: [{ key: 'leads', label: 'Leads', tone: 'accent' }],
      data: [{ source: 'AutoTrader', leads: 142 }, { source: 'Website', leads: 96 }, { source: 'Marketplace', leads: 71 }, { source: 'Walk-in', leads: 38 }],
    },
    workflow: {
      title: 'Listing lead to appointment',
      nodes: [
        { id: 'n1', label: 'Lead arrives', detail: 'Any listing site', kind: 'trigger', col: 0, row: 1 },
        { id: 'n2', label: 'Dedupe + enrich', detail: 'Match to existing customer', kind: 'action', col: 1, row: 1 },
        { id: 'n3', label: 'Auto-reply + assign', detail: 'Round robin by availability', kind: 'action', col: 2, row: 1 },
        { id: 'n4', label: 'Answered in 10 min?', kind: 'decision', col: 3, row: 1 },
        { id: 'n5', label: 'Escalate to manager', kind: 'human', col: 4, row: 2 },
        { id: 'n6', label: 'Book appointment', kind: 'output', col: 4, row: 0 },
      ],
      edges: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }, { from: 'n3', to: 'n4' }, { from: 'n4', to: 'n6', label: 'yes' }, { from: 'n4', to: 'n5', label: 'no' }],
    },
    employee: {
      title: 'Salesperson view', audience: 'Sales and service advisors',
      features: [
        { label: 'One lead queue', detail: 'Every source, with an SLA clock per lead' },
        { label: 'Vehicle match', detail: 'Inventory suggestions based on the enquiry' },
        { label: 'Appointment confirms', detail: 'Text confirmation and reminder handled automatically' },
      ],
      table: {
        columns: ['Lead', 'Source', 'Vehicle', 'Age'],
        rows: [['T. Abara', 'AutoTrader', '2022 RAV4', '4 min'], ['L. Fontaine', 'Website', '2020 Sierra', '11 min'], ['S. Whitcombe', 'Marketplace', '2019 Civic', '38 min'], ['M. Doiron', 'Website', 'Service booking', '2 min']],
      },
    },
    management: {
      title: 'Manager view', audience: 'Sales and service managers',
      features: [
        { label: 'Response SLA', detail: 'First-response time by salesperson and source' },
        { label: 'Source ROI', detail: 'Cost per booked appointment, by listing site' },
        { label: 'Service capacity', detail: 'Bay hours booked against available, two weeks out' },
      ],
    },
    approvals: [{ title: 'Trade appraisal override', requester: 'Sales', meta: '+$1,800 over book', age: '2h' }, { title: 'Loaner vehicle', requester: 'Service', meta: '3 days — warranty repair', age: '6h' }],
    notifications: [{ title: 'Lead breaching SLA', body: 'S. Whitcombe unanswered for 38 minutes.', tone: 'blocked', at: '11:22' }, { title: 'Service day full', body: 'Thursday is at capacity — overflow routed to Friday.', tone: 'info', at: '09:45' }],
    assistant: {
      name: 'Dealer assistant', intro: 'Ask about leads, inventory, or service capacity.',
      examples: [
        { question: 'Which leads are about to breach?', answer: '1 lead past 30 minutes, 3 approaching. Marketplace leads have the worst response time this week.' },
        { question: 'What is the ROI on AutoTrader?', answer: '142 leads, 48 appointments, 19 sales. That is $312 in listing cost per sale, your best source this month.' },
      ],
    },
    integrations: ['DMS (CDK, Reynolds, or PBS)', 'Listing site feeds', 'Twilio SMS', 'n8n'],
    weeks: '4–6 weeks', phases: ['Lead aggregation and dedupe', 'SLA routing and escalation', 'Service booking automation', 'Manager reporting'],
  }),

  t({
    slug: 'real-estate', industry: 'Real Estate', title: 'Property Management Desk',
    tagline: 'Maintenance intake, lease renewals, and owner reporting',
    description: 'Tenant maintenance requests triaged and dispatched, lease renewals started 90 days out, and owner statements generated automatically.',
    accent: '#7E22CE',
    problem: 'Maintenance requests arrive by text, email, and phone. Renewals get remembered late. Owner statements are assembled by hand every month.',
    outcome: 'Requests are triaged and dispatched in one flow, renewals start on schedule, and owner statements go out without anyone building them.',
    kpis: [
      { label: 'Avg. request resolution', value: '2.4', unit: 'days', delta: -3.9, goodDirection: 'down' },
      { label: 'Renewal rate', value: '84', unit: '%', delta: 11, goodDirection: 'up' },
      { label: 'Vacancy days', value: '9', delta: -14, goodDirection: 'down' },
      { label: 'Admin hours saved', value: '26', unit: 'hrs/wk', delta: 26, goodDirection: 'up' },
    ],
    chart: { title: 'Maintenance requests resolved', subtitle: 'Closed within SLA', key: 'resolved', label: 'Resolved', values: [112, 134, 148, 161, 179, 194] },
    bars: {
      title: 'Requests by category', subtitle: 'This quarter', xKey: 'category',
      series: [{ key: 'count', label: 'Requests', tone: 'accent' }],
      data: [{ category: 'Plumbing', count: 84 }, { category: 'HVAC', count: 61 }, { category: 'Electrical', count: 38 }, { category: 'Appliance', count: 29 }, { category: 'Other', count: 44 }],
    },
    workflow: {
      title: 'Tenant request to closed work order',
      nodes: [
        { id: 'n1', label: 'Tenant submits', detail: 'Portal, text, or email', kind: 'trigger', col: 0, row: 1 },
        { id: 'n2', label: 'Triage + categorize', detail: 'Photos, urgency, unit history', kind: 'action', col: 1, row: 1 },
        { id: 'n3', label: 'Emergency?', kind: 'decision', col: 2, row: 1 },
        { id: 'n4', label: 'Dispatch on-call', kind: 'action', col: 3, row: 0 },
        { id: 'n5', label: 'Assign vendor', detail: 'By trade and property', kind: 'action', col: 3, row: 2 },
        { id: 'n6', label: 'Close + bill owner', kind: 'output', col: 4, row: 1 },
      ],
      edges: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }, { from: 'n3', to: 'n4', label: 'yes' }, { from: 'n3', to: 'n5', label: 'no' }, { from: 'n4', to: 'n6' }, { from: 'n5', to: 'n6' }],
    },
    employee: {
      title: 'Property manager view', audience: 'Property managers and coordinators',
      features: [
        { label: 'Request board', detail: 'Every open request by property, age, and urgency' },
        { label: 'Vendor dispatch', detail: 'Assign, track, and collect invoices in one thread' },
        { label: 'Renewal pipeline', detail: 'Leases expiring in 90, 60, and 30 days' },
      ],
      table: {
        columns: ['Unit', 'Issue', 'Vendor', 'Age'],
        rows: [['Bellmore 304', 'No hot water', 'Ridge Plumbing', '4 hrs'], ['Kensington 12', 'Fridge not cooling', 'Unassigned', '1 day'], ['Bellmore 118', 'Hallway light', 'Kettle Electric', '3 days'], ['Ardmore 7', 'Balcony door', 'Scheduled', '2 days']],
      },
    },
    management: {
      title: 'Owner view', audience: 'Property owners and principals',
      features: [
        { label: 'Portfolio occupancy', detail: 'Occupancy and turnover by building' },
        { label: 'Maintenance spend', detail: 'Cost per unit, per category, against budget' },
        { label: 'Owner statements', detail: 'Generated monthly with receipts attached' },
      ],
    },
    approvals: [{ title: 'Repair over threshold', requester: 'Bellmore 304', meta: '$1,850 — water heater replace', age: '3h' }, { title: 'Rent increase notice', requester: 'Kensington 12', meta: 'Renewal — 2.5%', age: '1d' }],
    notifications: [{ title: 'Lease expiring', body: '6 leases expire within 60 days with no renewal started.', tone: 'held', at: '08:00' }, { title: 'Emergency dispatched', body: 'Bellmore 304 no hot water — Ridge Plumbing en route.', tone: 'info', at: '07:12' }],
    assistant: {
      name: 'Portfolio assistant', intro: 'Ask about units, requests, or renewals.',
      examples: [
        { question: 'Which units cost the most in maintenance?', answer: 'Bellmore 118 at $4,200 this year, mostly plumbing. That is 3x the portfolio average.' },
        { question: 'What renewals need attention?', answer: '6 leases expiring within 60 days without a renewal offer sent. Two are in a building at 92% occupancy.' },
      ],
    },
    integrations: ['Yardi or Buildium', 'QuickBooks', 'Twilio SMS', 'Power Automate'],
    weeks: '5–6 weeks', phases: ['Request intake and triage', 'Vendor dispatch', 'Renewal automation', 'Owner statements'],
  }),

  t({
    slug: 'warehouse', industry: 'Warehouse', title: 'Warehouse Inventory & Fulfilment',
    tagline: 'Counts that reconcile themselves, picks that do not go missing',
    description: 'Cycle counts that reconcile against the system automatically, pick lists generated from orders, and receiving that updates stock in real time.',
    accent: '#4D7C0F',
    problem: 'Stock counts are a quarterly shutdown. Picks are printed and lost. Receiving is entered days after the truck leaves.',
    outcome: 'Cycle counts run continuously against live data, picks are on a scanner, and receiving posts the moment it is scanned in.',
    kpis: [
      { label: 'Inventory accuracy', value: '99.1', unit: '%', delta: 6.4, goodDirection: 'up' },
      { label: 'Pick accuracy', value: '99.7', unit: '%', delta: 2.1, goodDirection: 'up' },
      { label: 'Orders shipped same day', value: '93', unit: '%', delta: 21, goodDirection: 'up' },
      { label: 'Count shutdown days', value: '0', delta: -8, goodDirection: 'down' },
    ],
    chart: { title: 'Inventory accuracy', subtitle: 'Cycle count variance, %', key: 'accuracy', label: 'Accuracy %', values: [92.7, 94.1, 96.3, 97.8, 98.6, 99.1] },
    bars: {
      title: 'Order volume by channel', subtitle: 'Units shipped', xKey: 'channel',
      series: [{ key: 'units', label: 'Units', tone: 'accent' }],
      data: [{ channel: 'Wholesale', units: 4820 }, { channel: 'Retail', units: 3140 }, { channel: 'Online', units: 2260 }, { channel: 'Transfers', units: 880 }],
    },
    workflow: {
      title: 'Order to shipped',
      nodes: [
        { id: 'n1', label: 'Order received', detail: 'Any channel', kind: 'trigger', col: 0, row: 1 },
        { id: 'n2', label: 'Allocate stock', detail: 'By location and expiry', kind: 'action', col: 1, row: 1 },
        { id: 'n3', label: 'In stock?', kind: 'decision', col: 2, row: 1 },
        { id: 'n4', label: 'Backorder + notify', kind: 'action', col: 3, row: 2 },
        { id: 'n5', label: 'Pick list to scanner', kind: 'action', col: 3, row: 0 },
        { id: 'n6', label: 'Pack, ship, update', kind: 'output', col: 4, row: 0 },
      ],
      edges: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }, { from: 'n3', to: 'n5', label: 'yes' }, { from: 'n3', to: 'n4', label: 'short' }, { from: 'n5', to: 'n6' }],
    },
    employee: {
      title: 'Floor view', audience: 'Pickers and receivers',
      features: [
        { label: 'Scanner pick list', detail: 'Ordered by travel path, confirmed by scan' },
        { label: 'Receiving', detail: 'Scan in against the PO, discrepancies flagged instantly' },
        { label: 'Cycle counts', detail: 'A short count assigned each shift, not a shutdown' },
      ],
      table: {
        columns: ['Order', 'Channel', 'Lines', 'Status'],
        rows: [['SO-8841', 'Wholesale', '14', 'Picking'], ['SO-8844', 'Online', '3', 'Packed'], ['SO-8846', 'Retail', '22', 'Short 1 line'], ['SO-8849', 'Wholesale', '8', 'Allocated']],
      },
    },
    management: {
      title: 'Operations view', audience: 'Warehouse and ops managers',
      features: [
        { label: 'Accuracy trend', detail: 'Count variance by zone and SKU class' },
        { label: 'Throughput', detail: 'Lines picked per hour, by picker and shift' },
        { label: 'Stockouts', detail: 'SKUs below reorder point, with lead time' },
      ],
    },
    approvals: [{ title: 'Inventory adjustment', requester: 'Zone C', meta: '−42 units, SKU 3318', age: '2h' }, { title: 'Expedited freight', requester: 'Shipping', meta: '$680 — SO-8846 short ship', age: '4h' }],
    notifications: [{ title: 'Below reorder point', body: '9 SKUs are below reorder with 14-day lead times.', tone: 'held', at: '06:30' }, { title: 'Count variance', body: 'Zone C variance 1.8% — above the 1% threshold.', tone: 'held', at: '15:50' }],
    assistant: {
      name: 'Warehouse assistant', intro: 'Ask about stock, orders, or throughput.',
      examples: [
        { question: 'What is going to stock out?', answer: '9 SKUs below reorder point. SKU 3318 has 6 days of cover against a 14-day lead time.' },
        { question: 'Where is variance coming from?', answer: 'Zone C accounts for 71% of variance this month, concentrated in small-parts bins with no barcode.' },
      ],
    },
    integrations: ['ERP or WMS', 'Barcode scanners', 'Shipping carrier APIs', 'Power BI'],
    weeks: '6–8 weeks', phases: ['Stock and order sync', 'Scanner pick and receive', 'Cycle counting', 'Operations dashboard'],
  }),

  t({
    slug: 'engineering', industry: 'Engineering', title: 'Engineering Project & Drawing Desk',
    tagline: 'Drawing revisions, timesheets, and project cost in one view',
    description: 'Drawing revision control with issue tracking, timesheets that roll straight into project cost, and deliverable schedules that stay current.',
    accent: '#334155',
    problem: 'Drawing revisions live in folders with names like final_v3_REV_B. Timesheets are entered late, so project cost is always a month behind.',
    outcome: 'Every revision is tracked with who issued it and to whom, and project cost updates as time is entered.',
    kpis: [
      { label: 'Projects over budget', value: '2', delta: -7, goodDirection: 'down' },
      { label: 'Timesheet compliance', value: '97', unit: '%', delta: 34, goodDirection: 'up' },
      { label: 'Drawing issue errors', value: '0', delta: -5, goodDirection: 'down' },
      { label: 'Admin hours saved', value: '18', unit: 'hrs/wk', delta: 18, goodDirection: 'up' },
    ],
    chart: { title: 'Project cost variance', subtitle: 'Average variance to budget, %', key: 'variance', label: 'Variance %', values: [14, 11, 9, 7, 5, 3] },
    bars: {
      title: 'Hours by discipline', subtitle: 'This month', xKey: 'discipline',
      series: [{ key: 'hours', label: 'Hours', tone: 'accent' }],
      data: [{ discipline: 'Structural', hours: 486 }, { discipline: 'Civil', hours: 372 }, { discipline: 'Mechanical', hours: 244 }, { discipline: 'Electrical', hours: 198 }],
    },
    workflow: {
      title: 'Drawing revision to issue',
      nodes: [
        { id: 'n1', label: 'Revision uploaded', kind: 'trigger', col: 0, row: 1 },
        { id: 'n2', label: 'Auto-version + log', detail: 'Supersedes prior revision', kind: 'action', col: 1, row: 1 },
        { id: 'n3', label: 'Reviewed?', kind: 'decision', col: 2, row: 1 },
        { id: 'n4', label: 'Route to reviewer', kind: 'human', col: 3, row: 2 },
        { id: 'n5', label: 'Issue to distribution', detail: 'Transmittal generated', kind: 'action', col: 3, row: 0 },
        { id: 'n6', label: 'Update register', kind: 'output', col: 4, row: 0 },
      ],
      edges: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }, { from: 'n3', to: 'n5', label: 'approved' }, { from: 'n3', to: 'n4', label: 'pending' }, { from: 'n4', to: 'n5' }, { from: 'n5', to: 'n6' }],
    },
    employee: {
      title: 'Engineer view', audience: 'Engineers and drafters',
      features: [
        { label: 'Drawing register', detail: 'Current revision, status, and who holds each drawing' },
        { label: 'Time entry', detail: 'Against project and phase, from anywhere' },
        { label: 'Issue tracker', detail: 'RFIs and comments linked to the drawing they concern' },
      ],
      table: {
        columns: ['Drawing', 'Project', 'Rev', 'Status'],
        rows: [['S-201', 'Riverside Bridge', 'C', 'Issued for construction'], ['C-104', 'Depot Expansion', 'B', 'In review'], ['M-310', 'Weston Plant', 'A', 'Draft'], ['S-208', 'Riverside Bridge', 'B', 'Superseded']],
      },
    },
    management: {
      title: 'Principal view', audience: 'Principals and project managers',
      features: [
        { label: 'Project profitability', detail: 'Fee against hours burned, by phase' },
        { label: 'Utilization', detail: 'Billable versus total hours, by engineer' },
        { label: 'Deliverable schedule', detail: 'Every milestone with days of float remaining' },
      ],
    },
    approvals: [{ title: 'Drawing issue', requester: 'Structural', meta: 'S-201 Rev C — for construction', age: '1h' }, { title: 'Scope change', requester: 'Depot Expansion', meta: '+64 hours, civil', age: '2d' }],
    notifications: [{ title: 'Milestone at risk', body: 'Weston Plant mechanical package has 3 days of float left.', tone: 'held', at: '09:20' }, { title: 'Revision superseded', body: 'S-208 Rev B superseded by Rev C, distribution notified.', tone: 'info', at: '14:05' }],
    assistant: {
      name: 'Project assistant', intro: 'Ask about projects, drawings, or hours.',
      examples: [
        { question: 'Which projects are burning fee too fast?', answer: '2 projects. Depot Expansion is at 78% of fee with 55% of deliverables issued.' },
        { question: 'What is the latest revision of S-201?', answer: 'Rev C, issued for construction on July 14 to 6 recipients. Rev B was superseded the same day.' },
      ],
    },
    integrations: ['SharePoint or Autodesk', 'Deltek or BQE', 'Power BI', 'Power Automate'],
    weeks: '5–7 weeks', phases: ['Drawing register and versioning', 'Transmittals and distribution', 'Time and cost rollup', 'Principal dashboard'],
  }),
];
