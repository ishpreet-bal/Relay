import { z } from 'zod';
import { costBreakdown, type PackageCosts } from '@/lib/cost-model';

const citation = z.object({ url: z.string().url(), quote: z.string(), matchType: z.string() });
const factSchema = z.object({ id: z.string(), statement: z.string(), citations: z.array(citation) });
export type BriefFact = z.infer<typeof factSchema>;

/** A quote's presence supports research; it does not establish an internal bottleneck. */
export function briefFacts(raw: unknown): BriefFact[] {
  const parsed = z.array(factSchema).safeParse(raw);
  return parsed.success ? parsed.data.filter((f) => f.citations.some((c) => c.matchType === 'exact' || c.matchType === 'normalized')) : [];
}

export interface WorkflowPlaybook {
  key: string; name: string; evidencePattern: RegExp; question: string; trigger: string; inputs: string[]; steps: string[];
  output: string; humanReview: string; failurePlan: string; validation: string[]; exclusions: string[]; demo: string; buildHours: [number, number];
}

export const WORKFLOW_PLAYBOOKS: WorkflowPlaybook[] = [
  { key: 'estimate', name: 'Inquiry to draft estimate', evidencePattern: /construction|renovat|roofing|landscap|contractor|plumbing|hvac|electrical contractor/i,
    question: 'Do new inquiries require repeated data entry and manual estimate preparation?', trigger: 'A new website inquiry or approved inbox message',
    inputs: ['Customer requirements and service area', 'The business’s approved rate sheet and quote rules'],
    steps: ['Validate required fields and flag missing details', 'Match the request to the approved service catalogue', 'Calculate draft line items from the rate sheet', 'Create a CRM task for an estimator'],
    output: 'A draft estimate, missing-information questions and an assigned follow-up task.', humanReview: 'An estimator approves every price and customer reply.',
    failurePlan: 'Keep the original inquiry; queue failed syncs and show unresolved items to the owner. Never send a partial estimate.',
    validation: ['How many inquiries arrive each week?', 'Which inbox, CRM and estimating tool are used?', 'Who owns and updates the rate sheet?'],
    exclusions: ['Site measurement', 'Binding prices without approval', 'Unconfirmed CRM integrations'], demo: 'estimate', buildHours: [16, 32] },
  { key: 'booking', name: 'Booking intake and reminders', evidencePattern: /salon|spa\b|barber|beauty|massage/i,
    question: 'Are staff copying booking requests between messages and a calendar?', trigger: 'A customer requests an appointment',
    inputs: ['Services, staff availability and buffers', 'Customer contact preferences and reminder permission'],
    steps: ['Validate service and required duration', 'Read availability from the booking system', 'Reserve a slot with a duplicate guard', 'Prepare confirmations and permitted reminders'],
    output: 'One calendar booking and a visible reminder queue.', humanReview: 'Staff handle conflicts, cancellations and any unsupported service.',
    failurePlan: 'Recheck availability before committing. If the calendar is unavailable, hold the request for staff without claiming it is confirmed.',
    validation: ['Which booking system is already used?', 'What work does it already automate?', 'What are the cancellation, deposit and messaging rules?'],
    exclusions: ['Replacing a working booking tool without a reason', 'Payment or SMS integration before testing'], demo: 'booking', buildHours: [16, 28] },
  { key: 'inventory', name: 'Stock exceptions to draft purchase orders', evidencePattern: /retail|store\b|e-commerce|ecommerce|inventory|wholesale|shopify/i,
    question: 'Does someone review stock exports and prepare supplier orders manually?', trigger: 'A scheduled stock and sales export arrives',
    inputs: ['SKU stock, sales and outstanding orders', 'Supplier lead times, minimum orders and pack sizes'],
    steps: ['Validate SKU mappings and export freshness', 'Calculate days of stock and reorder thresholds', 'Group draft orders by supplier', 'Send exceptions to the purchasing queue'],
    output: 'A stock exception board and draft purchase orders.', humanReview: 'A buyer approves quantities and each supplier order.',
    failurePlan: 'Reject stale exports and unknown SKUs; retries use the same source identifier so orders cannot be duplicated.',
    validation: ['Which POS or store provides the export?', 'Are supplier lead times maintained?', 'Who approves orders and what budget applies?'],
    exclusions: ['Automatic supplier purchases', 'Promised stockout reductions'], demo: 'inventory', buildHours: [20, 40] },
  { key: 'quality', name: 'Inspection records to shift reporting', evidencePattern: /manufactur|machine shop|machining|fabricat|inspection|production line/i,
    question: 'Are inspection files combined and checked manually at each shift change?', trigger: 'A line uploads an inspection file',
    inputs: ['Approved export formats and inspection records', 'Part specifications, units, tolerances and reporting rules'],
    steps: ['Validate format, units and record identifiers', 'Quarantine incomplete or incompatible rows', 'Calculate yield and exceptions by line', 'Prepare a report for the quality lead'],
    output: 'A traceable shift report and an exception queue.', humanReview: 'The quality lead reviews exceptions and controls all product-release decisions.',
    failurePlan: 'Preserve source files, quarantine invalid rows and replay by source identifier. A failed calculation never passes a part.',
    validation: ['Can we inspect anonymized sample files?', 'Who owns the specifications?', 'Which decisions must stay with quality staff?'],
    exclusions: ['Safety or product-release decisions', 'Untested MES or machine control integrations'], demo: 'quality-report', buildHours: [24, 48] },
  { key: 'shipments', name: 'Shipment exceptions and update drafts', evidencePattern: /logistics|trucking|freight|shipment|carrier|transportation|dispatch/i,
    question: 'Does dispatch repeatedly check shipment status and rewrite customer updates?', trigger: 'A carrier scan or scheduled tracking poll',
    inputs: ['Shipment identifiers and promised delivery times', 'Approved carrier/TMS access and customer update rules'],
    steps: ['Normalize carrier events and deduplicate scans', 'Compare status with the delivery promise', 'Flag missing or delayed events', 'Prepare customer update drafts'],
    output: 'An exception board with the last source event and a draft update.', humanReview: 'Dispatch approves exceptions and external updates.',
    failurePlan: 'Label stale tracking explicitly; retain the last confirmed event and retry without inventing an ETA.',
    validation: ['Which TMS and carriers are used?', 'Do their plans allow API access?', 'Which events justify a customer update?'],
    exclusions: ['Guaranteed arrival times', 'Unverified GPS or carrier connections'], demo: 'shipments', buildHours: [24, 48] },
  { key: 'clinic', name: 'Administrative intake routing', evidencePattern: /clinic|dental|dentist|physiotherap|medical practice/i,
    question: 'Are nonclinical requests copied between the front desk, scheduling and billing?', trigger: 'An administrative request is received',
    inputs: ['Approved nonclinical request types and staff queues', 'Anonymized examples and a reviewed privacy plan'],
    steps: ['Validate request type and required fields', 'Route only approved administrative categories', 'Escalate anything clinical or uncertain', 'Track staff ownership and unresolved work'],
    output: 'Administrative queues with a complete handoff history.', humanReview: 'Clinical or uncertain content always goes to authorized staff.',
    failurePlan: 'Hold uncertain items for a person; minimize retained data and record access and routing decisions.',
    validation: ['Can this start without patient information?', 'Who reviews privacy and system access?', 'Which requests are strictly administrative?'],
    exclusions: ['Clinical advice or triage', 'Patient data before a privacy and security assessment'], demo: 'clinic-admin', buildHours: [24, 48] },
];

export function recommendWorkflows(facts: BriefFact[]) {
  return WORKFLOW_PLAYBOOKS.flatMap((p) => {
    const evidence = facts.filter((f) => p.evidencePattern.test(f.statement));
    if (!evidence.length) return [];
    const { evidencePattern, ...playbook } = p;
    void evidencePattern;
    return [{ ...playbook, evidence, kind: 'HYPOTHESIS_TO_VALIDATE' as const }];
  }).slice(0, 2);
}

export function indicativePrice(input: { buildHours: [number, number]; costs: PackageCosts; internalHourlyCents: number; dayRateCents: number; currency: string; planningDefaults: boolean }) {
  const { costs, buildHours } = input;
  const contingencyPct = 25;
  const monthly = costBreakdown(costs, input.internalHourlyCents);
  const setup = (hours: number) => {
    const floor = costBreakdown({ ...costs, buildHours: hours }, input.internalHourlyCents).floor.setupCents;
    return Math.ceil(Math.max(floor, hours * input.dayRateCents / 8) * (1 + contingencyPct / 100) / 100) * 100;
  };
  const monthlyCents = Math.max(monthly.floor.monthlyCents, costs.priceMonthlyCents ?? 0);
  return { currency: input.currency, setupLowCents: setup(buildHours[0]), setupHighCents: setup(buildHours[1]), monthlyCents,
    contingencyPct, planningDefaults: input.planningDefaults, label: 'Internal budget estimate; scope and owner approval required',
    assumptions: ['Build hours are planning estimates, not measured effort.', 'Monthly cost assumes the package’s support, maintenance and provider allowances.', 'Provider subscriptions, usage caps and tax must be confirmed before a proposal.', 'No savings, delivery date or uptime guarantee is included.'] };
}
