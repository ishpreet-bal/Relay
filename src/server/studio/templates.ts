import type { Manifest } from './manifest';

/**
 * Starter templates, one per target industry. Each is a configurable
 * foundation — a manifest over the shared modules — not a separate app.
 * Estimates are starting points for proposals, to be replaced by actual
 * delivery data as projects complete.
 */

export interface BuiltinTemplate {
  slug: string;
  name: string;
  industry: string;
  description: string;
  useCases: string[];
  buildHoursEstimate: number;
  monthlyInfraCentsEstimate: number;
  recommendedSetupCents: number;
  recommendedMonthlyCents: number;
  knownLimitations: string[];
  version: string;
  manifest: Manifest;
}

const base = {
  schemaVersion: 1 as const,
  terminology: {},
  integrations: [],
  limits: { maxExecutionsPerDay: 500, maxConcurrent: 2 },
};

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    slug: 'manufacturing-quality-claims',
    name: 'Quality claims tracker',
    industry: 'Manufacturing',
    description: 'Logs customer quality claims, escalates large or severe ones to the quality manager for a credit decision, and reports weekly totals.',
    useCases: ['quality claims tracking', 'warranty analysis', 'automated production reporting', 'supplier communication'],
    buildHoursEstimate: 24, monthlyInfraCentsEstimate: 1500, recommendedSetupCents: 350000, recommendedMonthlyCents: 45000,
    knownLimitations: ['Claims are entered or posted to a webhook; no ERP sync without a custom integration.'],
    version: '1.0.0',
    manifest: {
      ...base,
      app: { name: 'Quality claims', description: 'Claims intake, escalation and weekly reporting.' },
      branding: { displayName: 'Quality claims', primaryColor: '#1D4ED8', logoUrl: null, theme: 'system' },
      modules: [
        { key: 'records', version: '1.0', config: {} }, { key: 'rules', version: '1.0', config: {} },
        { key: 'notifications', version: '1.0', config: {} }, { key: 'approvals', version: '1.0', config: {} },
        { key: 'reporting', version: '1.0', config: {} },
      ],
      roles: [
        { key: 'quality_manager', label: 'Quality manager', permissions: ['records:read', 'records:write', 'approvals:decide', 'reports:read', 'notifications:read'] },
        { key: 'inspector', label: 'Inspector', permissions: ['records:read', 'records:write', 'notifications:read'] },
      ],
      collections: [{
        key: 'claims', label: 'Claims', fields: [
          { key: 'customer', label: 'Customer', type: 'text', required: true },
          { key: 'part_number', label: 'Part number', type: 'text', required: true },
          { key: 'defect', label: 'Defect', type: 'text', required: true },
          { key: 'quantity', label: 'Quantity affected', type: 'number', required: true },
          { key: 'severity', label: 'Severity', type: 'select', required: true, options: ['low', 'medium', 'high'] },
          { key: 'reported_on', label: 'Reported on', type: 'date', required: false },
        ],
      }],
      rules: { escalation_quantity: 50 },
      workflows: [
        {
          key: 'claim_intake', name: 'New claim', trigger: { type: 'webhook' },
          steps: [
            { key: 'check', type: 'validate', config: { collection: 'claims' } },
            { key: 'save', type: 'create_record', config: { collection: 'claims', data: { $input: '*' } } },
            { key: 'large', type: 'condition', config: { left: { $input: 'quantity' }, op: 'gte', right: { $rule: 'escalation_quantity' }, onFalse: 'stop' } },
            { key: 'alert', type: 'notify', config: { toRoles: ['quality_manager'], title: 'Large claim from {{input.customer}}: {{input.quantity}} × {{input.part_number}}' } },
            { key: 'credit', type: 'approval', config: { approverRole: 'quality_manager', title: 'Approve a credit for {{input.customer}}?' } },
          ],
          testInput: { customer: 'Synthetic Auto Parts Ltd', part_number: 'SYN-1001', defect: 'Burr on edge', quantity: 120, severity: 'high', reported_on: '2026-10-01' },
        },
        {
          key: 'weekly_report', name: 'Weekly claims report', trigger: { type: 'schedule', cron: '0 7 * * 1' },
          steps: [
            { key: 'count', type: 'aggregate', config: { collection: 'claims', op: 'count', sinceDays: 7 } },
            { key: 'units', type: 'aggregate', config: { collection: 'claims', op: 'sum', field: 'quantity', sinceDays: 7 } },
            { key: 'send', type: 'notify', config: { toRoles: ['quality_manager'], title: 'Last 7 days: {{steps.count.value}} claims, {{steps.units.value}} units' } },
          ],
          testInput: {},
        },
      ],
      dashboard: { widgets: [{ type: 'count', collection: 'claims', title: 'Open claims' }, { type: 'sum', collection: 'claims', field: 'quantity', title: 'Units claimed' }] },
    },
  },
  {
    slug: 'construction-quote-requests',
    name: 'Quote request desk',
    industry: 'Construction',
    description: 'Captures quote requests, filters out jobs below the minimum, drafts a quote record for the estimator to approve, and tells the office.',
    useCases: ['quotation generation', 'project administration', 'customer updates', 'document collection'],
    buildHoursEstimate: 30, monthlyInfraCentsEstimate: 1500, recommendedSetupCents: 450000, recommendedMonthlyCents: 50000,
    knownLimitations: ['Pricing is the estimator\'s; the workflow prepares the record, it does not price the job.'],
    version: '1.0.0',
    manifest: {
      ...base,
      app: { name: 'Quote requests', description: 'Intake, triage and estimator approval.' },
      branding: { displayName: 'Quote desk', primaryColor: '#B45309', logoUrl: null, theme: 'system' },
      modules: [
        { key: 'records', version: '1.0', config: {} }, { key: 'rules', version: '1.0', config: {} },
        { key: 'notifications', version: '1.0', config: {} }, { key: 'approvals', version: '1.0', config: {} },
      ],
      roles: [
        { key: 'estimator', label: 'Estimator', permissions: ['records:read', 'records:write', 'approvals:decide', 'notifications:read'] },
        { key: 'office', label: 'Office', permissions: ['records:read', 'notifications:read'] },
      ],
      collections: [
        { key: 'requests', label: 'Quote requests', fields: [
          { key: 'customer', label: 'Customer', type: 'text', required: true },
          { key: 'email', label: 'Email', type: 'email', required: true },
          { key: 'site_address', label: 'Site address', type: 'text', required: true },
          { key: 'scope', label: 'Scope of work', type: 'text', required: true },
          { key: 'budget', label: 'Budget', type: 'number', required: false },
        ] },
        { key: 'quotes', label: 'Draft quotes', fields: [
          { key: 'customer', label: 'Customer', type: 'text', required: true },
          { key: 'scope', label: 'Scope', type: 'text', required: true },
          { key: 'status', label: 'Status', type: 'select', required: true, options: ['draft', 'sent', 'won', 'lost'] },
        ] },
      ],
      rules: { minimum_budget: 5000 },
      workflows: [{
        key: 'new_request', name: 'New quote request', trigger: { type: 'webhook' },
        steps: [
          { key: 'check', type: 'validate', config: { collection: 'requests' } },
          { key: 'save', type: 'create_record', config: { collection: 'requests', data: { $input: '*' } } },
          { key: 'big_enough', type: 'condition', config: { left: { $input: 'budget' }, op: 'gte', right: { $rule: 'minimum_budget' }, onFalse: 'stop' } },
          { key: 'draft', type: 'create_record', config: { collection: 'quotes', data: { customer: { $input: 'customer' }, scope: { $input: 'scope' }, status: 'draft' } } },
          { key: 'approve', type: 'approval', config: { approverRole: 'estimator', title: 'Price and send the quote for {{input.customer}}?' } },
          { key: 'tell', type: 'notify', config: { toRoles: ['office'], title: 'Quote approved for {{input.customer}}' } },
        ],
        testInput: { customer: 'Synthetic Homes Inc', email: 'office@example.test', site_address: '1 Example St, Toronto', scope: 'Basement waterproofing', budget: 18000 },
      }],
      dashboard: { widgets: [{ type: 'count', collection: 'requests', title: 'Requests' }, { type: 'count', collection: 'quotes', title: 'Draft quotes' }] },
    },
  },
  {
    slug: 'logistics-shipment-updates',
    name: 'Shipment exception desk',
    industry: 'Logistics',
    description: 'Records shipment status changes, flags delays to dispatch, and can post updates to the customer\'s portal through their API.',
    useCases: ['shipment tracking', 'customer notifications', 'dispatch reporting', 'order reconciliation'],
    buildHoursEstimate: 32, monthlyInfraCentsEstimate: 2000, recommendedSetupCents: 500000, recommendedMonthlyCents: 60000,
    knownLimitations: ['Carrier tracking feeds need a connection per carrier.'],
    version: '1.0.0',
    manifest: {
      ...base,
      app: { name: 'Shipment updates', description: 'Status changes and delay handling.' },
      branding: { displayName: 'Shipments', primaryColor: '#047857', logoUrl: null, theme: 'system' },
      modules: [
        { key: 'records', version: '1.0', config: {} }, { key: 'rules', version: '1.0', config: {} },
        { key: 'notifications', version: '1.0', config: {} }, { key: 'integrations', version: '1.0', config: {} },
      ],
      roles: [{ key: 'dispatcher', label: 'Dispatcher', permissions: ['records:read', 'records:write', 'notifications:read'] }],
      collections: [{ key: 'shipments', label: 'Shipments', fields: [
        { key: 'reference', label: 'Reference', type: 'text', required: true },
        { key: 'customer', label: 'Customer', type: 'text', required: true },
        { key: 'status', label: 'Status', type: 'select', required: true, options: ['booked', 'in_transit', 'delayed', 'delivered'] },
        { key: 'eta', label: 'ETA', type: 'date', required: false },
      ] }],
      rules: {},
      integrations: [{ key: 'customer_portal', provider: 'rest_api', required: false, purpose: 'Post status updates to the customer\'s portal' }],
      workflows: [{
        key: 'status_change', name: 'Status change', trigger: { type: 'webhook' },
        steps: [
          { key: 'check', type: 'validate', config: { collection: 'shipments' } },
          { key: 'save', type: 'create_record', config: { collection: 'shipments', data: { $input: '*' } } },
          { key: 'delayed', type: 'condition', config: { left: { $input: 'status' }, op: 'eq', right: 'delayed', onFalse: 'stop' } },
          { key: 'alert', type: 'notify', config: { toRoles: ['dispatcher'], title: 'Shipment {{input.reference}} for {{input.customer}} is delayed' } },
        ],
        testInput: { reference: 'SYN-5001', customer: 'Synthetic Retail Co', status: 'delayed', eta: '2026-10-30' },
      }],
      dashboard: { widgets: [{ type: 'count', collection: 'shipments', title: 'Shipments' }] },
    },
  },
  {
    slug: 'local-services-bookings',
    name: 'Booking and reminders',
    industry: 'Local services',
    description: 'Records bookings, plans reminders before each appointment, and tells the front desk.',
    useCases: ['booking management', 'reminders', 'customer communication', 'follow-up workflows'],
    buildHoursEstimate: 16, monthlyInfraCentsEstimate: 1000, recommendedSetupCents: 200000, recommendedMonthlyCents: 25000,
    knownLimitations: ['Reminders are planned and listed; sending them by SMS or email needs a messaging connection.'],
    version: '1.0.0',
    manifest: {
      ...base,
      app: { name: 'Bookings', description: 'Bookings with planned reminders.' },
      branding: { displayName: 'Bookings', primaryColor: '#7C3AED', logoUrl: null, theme: 'system' },
      modules: [
        { key: 'records', version: '1.0', config: {} }, { key: 'scheduling', version: '1.0', config: { timezone: 'America/Toronto' } },
        { key: 'notifications', version: '1.0', config: {} },
      ],
      roles: [{ key: 'front_desk', label: 'Front desk', permissions: ['records:read', 'records:write', 'notifications:read'] }],
      collections: [{ key: 'bookings', label: 'Bookings', fields: [
        { key: 'customer_name', label: 'Customer', type: 'text', required: true },
        { key: 'service', label: 'Service', type: 'text', required: true },
        { key: 'starts_at', label: 'Starts at', type: 'date', required: true },
      ] }],
      rules: {},
      workflows: [{
        key: 'new_booking', name: 'New booking', trigger: { type: 'webhook' },
        steps: [
          { key: 'check', type: 'validate', config: { collection: 'bookings' } },
          { key: 'save', type: 'create_record', config: { collection: 'bookings', data: { $input: '*' } } },
          { key: 'remind', type: 'schedule_reminders', config: { at: { $input: 'starts_at' }, hoursBefore: [24, 2], title: 'Reminder: {{input.service}} for {{input.customer_name}}' } },
          { key: 'tell', type: 'notify', config: { toRoles: ['front_desk'], title: 'New booking: {{input.customer_name}}, {{input.service}}' } },
        ],
        testInput: { customer_name: 'Synthetic Customer', service: 'Haircut', starts_at: '2026-11-03T15:00:00-05:00' },
      }],
      dashboard: { widgets: [{ type: 'count', collection: 'bookings', title: 'Bookings' }] },
    },
  },
];
