import type { ClaimType, ObjectionType, SignalType } from '@prisma/client';

/**
 * Starter playbooks. These are rows an admin installs and then edits — the
 * application has no trucking- or cleaning-specific logic anywhere. A new
 * industry is a new playbook, not a code change.
 */

export interface PlaybookTemplate {
  slug: string;
  name: string;
  description: string;
  industryFocus: string;
  targetAccountTypes: string[];
  targetTitles: string[];
  targetDepartments: string[];
  usefulSignals: SignalType[];
  signalKeywords: string[];
  approvedClaimTypes: ClaimType[];
  messagingAngles: Array<{ key: string; name: string; description: string }>;
  sequenceTemplate: Array<{ delayDays: number; purpose: string; instructions: string }>;
  callOpener: string;
  discoveryQuestions: string[];
  objectionHandling: Array<{ objection: ObjectionType; response: string }>;
  qualificationCriteria: string[];
  autoApproveThreshold: number;
}

const BASE_APPROVED: ClaimType[] = ['JOB_TITLE', 'COMPANY_LOCATION', 'COMPANY_INDUSTRY', 'PRODUCTS_SERVICES'];

const STANDARD_SEQUENCE = (angle2: string, angle3: string) => [
  { delayDays: 0, purpose: 'introduction', instructions: 'First contact. Open with the most relevant verified fact or signal, connect it to the offer in one sentence, ask for a short call.' },
  { delayDays: 2, purpose: 'follow-up', instructions: `Short follow-up. Do not mention the lack of reply. ${angle2}` },
  { delayDays: 4, purpose: 'different angle', instructions: `A different angle from the first email. ${angle3}` },
  { delayDays: 7, purpose: 'breakup', instructions: 'Final note. Two or three sentences. Say you will stop reaching out and leave the door open. No guilt, no false scarcity.' },
];

export const STARTER_PLAYBOOKS: PlaybookTemplate[] = [
  {
    slug: 'trucking-outbound',
    name: 'Trucking outbound',
    description: 'For carriers and logistics providers selling freight capacity to shippers.',
    industryFocus: 'Transportation',
    targetAccountTypes: ['Manufacturers', 'Distributors', 'Warehouses', 'Wholesalers'],
    targetTitles: ['Logistics Manager', 'Transportation Manager', 'Operations Director', 'Supply Chain Manager', 'Shipping Manager'],
    targetDepartments: ['Logistics', 'Supply Chain', 'Operations'],
    usefulSignals: ['EXPANSION', 'NEW_LOCATION', 'HIRING', 'NEW_CONTRACT'],
    signalKeywords: ['new warehouse', 'facility expansion', 'distribution centre', 'logistics coordinator', 'shipper', 'dispatcher'],
    approvedClaimTypes: [...BASE_APPROVED, 'SERVICE_AREA', 'NEW_LOCATION', 'EXPANSION'],
    messagingAngles: [
      { key: 'capacity', name: 'Reliable capacity', description: 'Dedicated or committed capacity on the lanes they ship.' },
      { key: 'growth', name: 'Supporting growth', description: 'A new site or expansion usually changes freight volume and lanes.' },
      { key: 'service', name: 'Service when it matters', description: 'Responsiveness when a load goes wrong; a person who answers.' },
    ],
    sequenceTemplate: STANDARD_SEQUENCE(
      'Mention one specific lane or service area from the offer.',
      'If there is a hiring or expansion signal, lead with it; otherwise lead with reliability on their region.',
    ),
    callOpener: "Hi {firstName}, it's {your name} from {client}. I'll be quick — we run freight for manufacturers around {company}'s area and I wanted to see who handles your outbound shipping decisions.",
    discoveryQuestions: [
      'Roughly how many loads a week do you ship, and to where?',
      'Is that mostly dedicated, contract or spot?',
      'What happens today when a carrier lets you down?',
      'Any changes coming — new sites, new customers, new lanes?',
    ],
    objectionHandling: [
      { objection: 'ALREADY_HAVE_PROVIDER', response: 'Most shippers we work with have a primary carrier. We are usually the backup on the lanes where service slips — is there a lane that gives you trouble?' },
      { objection: 'TOO_EXPENSIVE', response: 'Fair. Rates depend on lane and volume — if you share one lane we can tell you quickly whether we are competitive, no commitment.' },
      { objection: 'BAD_TIMING', response: 'Understood. When does your freight planning usually come up for review? I can call back then.' },
      { objection: 'NOT_DECISION_MAKER', response: 'Thanks — who looks after carrier selection there? I would rather talk to the right person than waste yours.' },
      { objection: 'SEND_INFORMATION', response: 'Happy to. So I send something useful, which lanes matter most to you?' },
    ],
    qualificationCriteria: ['Ships regularly on lanes we serve', 'Has an identified decision-maker', 'Open to a backup or additional carrier'],
    autoApproveThreshold: 0.92,
  },
  {
    slug: 'machine-shop-outbound',
    name: 'Machine shop outbound',
    description: 'For machine shops selling outsourced machining to manufacturers.',
    industryFocus: 'Manufacturing',
    targetAccountTypes: ['Manufacturers that outsource machining', 'Equipment builders', 'OEMs'],
    targetTitles: ['Engineering Manager', 'Purchasing Manager', 'Operations Manager', 'Supply Chain Manager', 'Buyer'],
    targetDepartments: ['Engineering', 'Supply Chain', 'Operations'],
    usefulSignals: ['NEW_PRODUCT', 'EXPANSION', 'HIRING', 'NEW_CONTRACT'],
    signalKeywords: ['new product', 'production expansion', 'supplier', 'engineering hiring', 'prototype'],
    approvedClaimTypes: [...BASE_APPROVED, 'AWARD_OR_CERTIFICATION', 'NEW_PRODUCT'],
    messagingAngles: [
      { key: 'capacity', name: 'Extra capacity', description: 'Overflow and low-volume precision work their current shop deprioritizes.' },
      { key: 'quality', name: 'Quality and certification', description: 'Tolerances, inspection and certifications they can verify.' },
      { key: 'speed', name: 'Turnaround', description: 'Prototype and short-run lead times.' },
    ],
    sequenceTemplate: STANDARD_SEQUENCE(
      'Mention one capability from the proof points that fits their products.',
      'Lead with a new-product or expansion signal if there is one; otherwise with turnaround on low-volume parts.',
    ),
    callOpener: "Hi {firstName}, {your name} with {client}. We machine low-volume precision parts for manufacturers near {company}. Who looks after outsourced machining there?",
    discoveryQuestions: [
      'What do you machine in-house versus send out?',
      'Where do your current suppliers struggle — lead time, tolerance, volume?',
      'Any new products or programs coming that need parts?',
    ],
    objectionHandling: [
      { objection: 'ALREADY_HAVE_PROVIDER', response: 'Most of our customers have a main shop too. We tend to take the jobs that are too small or too fast for them — any of those lately?' },
      { objection: 'NO_NEED', response: 'Understood. If a quote ever comes back too slow or too high, would it be worth having a second shop on file?' },
      { objection: 'SEND_INFORMATION', response: 'Sure — I will send our capabilities sheet. Is there a part type I should highlight?' },
    ],
    qualificationCriteria: ['Outsources some machining', 'Has upcoming work or supplier pain', 'Engineering or purchasing contact engaged'],
    autoApproveThreshold: 0.92,
  },
  {
    slug: 'commercial-cleaning-outbound',
    name: 'Commercial cleaning outbound',
    description: 'For commercial cleaning companies selling contracts to facilities.',
    industryFocus: 'Facility services',
    targetAccountTypes: ['Office buildings', 'Warehouses', 'Property managers', 'Medical facilities'],
    targetTitles: ['Property Manager', 'Facility Manager', 'Facilities Manager', 'Operations Manager', 'Office Manager'],
    targetDepartments: ['Facilities', 'Operations'],
    usefulSignals: ['NEW_LOCATION', 'EXPANSION', 'LEADERSHIP_CHANGE'],
    signalKeywords: ['new office', 'relocation', 'new facility', 'property management', 'tenant'],
    approvedClaimTypes: [...BASE_APPROVED, 'NEW_LOCATION'],
    messagingAngles: [
      { key: 'reliability', name: 'Reliability', description: 'Crews that show up and a supervisor who checks.' },
      { key: 'move', name: 'New space', description: 'A move or new site is when cleaning contracts get revisited.' },
    ],
    sequenceTemplate: STANDARD_SEQUENCE(
      'Mention the type of facility they run and one relevant service.',
      'If they opened or moved a location, lead with that; otherwise with reliability.',
    ),
    callOpener: "Hi {firstName}, {your name} from {client}. We clean facilities like {company}'s — who looks after your cleaning contract?",
    discoveryQuestions: ['Who cleans the facility today?', 'When does that contract come up?', "What's the one thing you'd change about it?"],
    objectionHandling: [
      { objection: 'ALREADY_HAVE_PROVIDER', response: 'Most places do. When does that contract renew? A comparison quote costs you nothing.' },
      { objection: 'TOO_EXPENSIVE', response: 'Understood — a walkthrough lets us price it properly. Fifteen minutes on site?' },
    ],
    qualificationCriteria: ['Facility in our service area', 'Contract renewal within 6 months or active dissatisfaction'],
    autoApproveThreshold: 0.92,
  },
  {
    slug: 'industrial-supplier-outbound',
    name: 'Industrial supplier outbound',
    description: 'For suppliers of specialized industrial components selling to equipment makers and plants.',
    industryFocus: 'Industrial supply',
    targetAccountTypes: ['Equipment manufacturers', 'Processing plants', 'Maintenance and repair operations'],
    targetTitles: ['Purchasing Manager', 'Engineering Manager', 'Maintenance Manager', 'Plant Manager', 'Procurement Manager'],
    targetDepartments: ['Supply Chain', 'Engineering', 'Operations'],
    usefulSignals: ['EXPANSION', 'NEW_PRODUCT', 'NEW_CONTRACT', 'TECHNOLOGY_CHANGE'],
    signalKeywords: ['new line', 'plant expansion', 'maintenance', 'supplier qualification', 'equipment upgrade'],
    approvedClaimTypes: [...BASE_APPROVED, 'TECHNOLOGY_USED', 'EXPANSION'],
    messagingAngles: [
      { key: 'availability', name: 'Availability', description: 'Lead times and stock on the components they depend on.' },
      { key: 'spec', name: 'Specification fit', description: 'Parts engineered for their application.' },
    ],
    sequenceTemplate: STANDARD_SEQUENCE(
      'Mention one component and the application it fits.',
      'Lead with an expansion or new-line signal if there is one; otherwise with lead times.',
    ),
    callOpener: "Hi {firstName}, {your name} with {client}. We supply components to plants like {company}'s — who handles sourcing for those?",
    discoveryQuestions: ['Which components cause you the most downtime or delay?', 'Who qualifies new suppliers?', 'Any lines being added or upgraded?'],
    objectionHandling: [
      { objection: 'ALREADY_HAVE_PROVIDER', response: 'Most plants have an approved vendor. Worth having a qualified second source for when lead times stretch?' },
      { objection: 'NOT_DECISION_MAKER', response: 'Thanks — who owns supplier qualification for that equipment?' },
    ],
    qualificationCriteria: ['Uses the component category', 'Open to a second source or has a supply problem'],
    autoApproveThreshold: 0.92,
  },
];
