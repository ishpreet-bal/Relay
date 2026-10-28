/**
 * Industry examples for the showcase. These are examples of what Relay can
 * build, not descriptions of past client projects. Every business gets a
 * solution designed around its own process.
 */

export type Industry = {
  slug: string;
  name: string;
  /** One line for the selector. */
  short: string;
  intro: string;
  solutions: string[];
  /** A suggested workflow, step by step. */
  workflow: { step: string; detail: string }[];
  demo: string;
  note?: string;
};

export const INDUSTRIES: Industry[] = [
  {
    slug: 'manufacturing',
    name: 'Manufacturing & Industrial',
    short: 'Quality, suppliers, inventory, production data',
    intro:
      'Inspection sheets, spreadsheets and email, turned into one validated report your team can act on.',
    solutions: ['Quality reporting automation', 'Supplier follow-up systems', 'Inventory dashboards', 'Warranty claims processing', 'Production data consolidation'],
    workflow: [
      { step: 'Collect', detail: 'Inspection records from each line, in whatever format they arrive' },
      { step: 'Validate', detail: 'Missing values, unit mix-ups and out-of-spec readings flagged' },
      { step: 'Consolidate', detail: 'One dataset by line, shift and defect type' },
      { step: 'Report', detail: 'Yield dashboard and a summary for the quality lead' },
    ],
    demo: 'quality-report',
  },
  {
    slug: 'construction',
    name: 'Construction',
    short: 'Quotes, scheduling, invoices, documents',
    intro:
      'Every inquiry becomes a draft estimate and a task list, ready for your estimator to check.',
    solutions: ['Automated quotations', 'Project scheduling', 'Invoice processing', 'Document management', 'Customer updates'],
    workflow: [
      { step: 'Capture', detail: 'The customer’s inquiry, from any channel' },
      { step: 'Understand', detail: 'Project type, size, materials and timing picked out' },
      { step: 'Estimate', detail: 'Line items priced from your own rate sheet' },
      { step: 'Plan', detail: 'Site visit, supplier quotes and crew tasks scheduled' },
    ],
    demo: 'estimate',
  },
  {
    slug: 'logistics',
    name: 'Logistics & Trucking',
    short: 'Tracking, dispatch, delivery updates, reconciliation',
    intro:
      'Every shipment tracked in one place, and customers updated only when something changes.',
    solutions: ['Shipment tracking dashboards', 'Dispatch reporting', 'Delivery notification workflows', 'Invoice reconciliation', 'Customer communication'],
    workflow: [
      { step: 'Ingest', detail: 'Scan and GPS events from carriers and drivers' },
      { step: 'Track', detail: 'Each shipment compared against its promised delivery time' },
      { step: 'Decide', detail: 'On time, at risk or delayed, worked out continuously' },
      { step: 'Notify', detail: 'Customers updated when the status changes, not before' },
    ],
    demo: 'shipments',
  },
  {
    slug: 'clinics',
    name: 'Healthcare Administration & Clinics',
    short: 'Reminders, document routing, scheduling support',
    intro:
      'Paperwork routed to the right desk and reminders sent on schedule, so staff spend more time with patients.',
    solutions: ['Appointment reminders', 'Administrative document routing', 'Scheduling support', 'General inquiry organization', 'Non-clinical reporting'],
    workflow: [
      { step: 'Receive', detail: 'Forms, requests and messages arriving at the front desk' },
      { step: 'Classify', detail: 'Each item identified by type' },
      { step: 'Route', detail: 'Sent to scheduling, records, billing or the front desk' },
      { step: 'Remind', detail: 'Appointment reminders sent on a set schedule' },
    ],
    demo: 'clinic-admin',
    note: 'Administrative workflows only. These examples are not clinical software, and they do not represent any regulatory or privacy compliance on their own: that is assessed for each clinic.',
  },
  {
    slug: 'local-services',
    name: 'Spas, Salons & Local Services',
    short: 'Booking, reminders, inquiries, follow-up',
    intro:
      'Online booking that fits each service into the right person’s day, with reminders built in.',
    solutions: ['Appointment booking', 'Customer reminders', 'Inquiry handling', 'Customer follow-up', 'Staff scheduling'],
    workflow: [
      { step: 'Request', detail: 'A customer picks a service and a preferred time' },
      { step: 'Match', detail: 'The right staff member and a slot that fits the service' },
      { step: 'Confirm', detail: 'Booking confirmed and added to the calendar' },
      { step: 'Follow up', detail: 'Reminders before, a rebooking nudge after' },
    ],
    demo: 'booking',
  },
  {
    slug: 'retail',
    name: 'Retail & E-commerce',
    short: 'Inventory alerts, order updates, sales reporting',
    intro:
      'Stock watched against how fast it sells, with purchase orders drafted before you run out.',
    solutions: ['Inventory notifications', 'Order status communication', 'Sales reporting', 'Customer support workflows', 'Returns administration'],
    workflow: [
      { step: 'Watch', detail: 'Stock levels and sales from your store and POS' },
      { step: 'Forecast', detail: 'Days of stock left at the current selling rate' },
      { step: 'Alert', detail: 'Low stock flagged against supplier lead times' },
      { step: 'Reorder', detail: 'A draft purchase order per supplier, for your approval' },
    ],
    demo: 'inventory',
  },
  {
    slug: 'startups',
    name: 'Startups & Professional Services',
    short: 'Prospecting, CRM, pipeline, onboarding',
    intro:
      'Your ideal customer, turned into a steady list of researched, qualified prospects.',
    solutions: ['Customer acquisition research', 'CRM automation', 'Sales pipeline organization', 'Client onboarding', 'Invoice and document workflows'],
    workflow: [
      { step: 'Define', detail: 'Who you sell to: industry, size, location, signals' },
      { step: 'Discover', detail: 'Businesses that match, from public sources' },
      { step: 'Qualify', detail: 'Each one scored against your profile, with reasons' },
      { step: 'Prepare', detail: 'Outreach drafted for you to review and approve' },
    ],
    demo: 'prospects',
  },
];
