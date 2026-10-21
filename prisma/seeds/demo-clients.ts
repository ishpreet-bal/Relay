import type { Prisma, PrismaClient } from '@prisma/client';
import { STARTER_PLAYBOOKS } from '../../src/server/services/playbooks/starter-templates';
import { templateData } from '../../src/server/services/playbooks';

/**
 * Two example clients that exercise the same architecture for different
 * industries: a cross-border trucking company and an industrial supplier.
 * Only configuration is seeded — business profile, offer, ideal customer
 * profile, proof points and a playbook. No prospects, emails or calls are
 * invented; accounts arrive by import or from a connected provider.
 *
 * Idempotent per workspace: clients are matched by slug.
 */

interface DemoClient {
  slug: string;
  playbook: string;
  client: Omit<Prisma.ClientUncheckedCreateInput, 'organizationId' | 'slug'>;
  offer: Omit<Prisma.OfferUncheckedCreateInput, 'organizationId' | 'clientId'>;
  icp: Omit<Prisma.IdealCustomerProfileUncheckedCreateInput, 'organizationId' | 'clientId'>;
  proofPoints: Array<Omit<Prisma.ProofPointUncheckedCreateInput, 'organizationId' | 'clientId'>>;
}

const DEMO_CLIENTS: DemoClient[] = [
  {
    slug: 'abc-transport',
    playbook: 'trucking-outbound',
    client: {
      name: 'ABC Transport',
      status: 'ONBOARDING',
      websiteUrl: 'https://abc-transport.example',
      description: 'Asset-based carrier running dry van and flatbed freight between Ontario and the US Midwest and Northeast, with its own trucks and drivers.',
      productsServices: ['Cross-border FTL', 'Cross-border LTL', 'Dedicated lanes', 'Flatbed'],
      serviceAreas: ['Ontario', 'Michigan', 'Ohio', 'New York', 'Pennsylvania'],
      industriesServed: ['Manufacturing', 'Food processing', 'Building materials'],
      differentiators: ['Own fleet, no brokering', 'Bonded carrier with in-house customs paperwork', 'Dispatch answers the phone 24/7'],
      existingCustomers: [],
      averageDealValueCents: 4_800_000,
      currency: 'CAD',
      timezone: 'America/Toronto',
      senderName: 'Sam Patel',
      senderTitle: 'Business Development Manager',
    },
    offer: {
      name: 'Dedicated Ontario–US lanes',
      summary: 'Reliable weekly capacity on Ontario–US lanes with our own trucks and drivers.',
      valueProposition: 'Fewer missed pickups and no broker markup on the lanes you ship every week.',
      callToAction: 'A 15-minute call about your US lanes',
      typicalDealValueCents: 4_800_000,
    },
    icp: {
      name: 'Ontario manufacturers shipping to the US',
      description: 'Mid-sized manufacturers and food processors in Ontario that ship product to US customers every week.',
      industries: ['Manufacturing', 'Food processing', 'Building materials', 'Plastics', 'Metal fabrication'],
      industryKeywords: ['manufacturer', 'fabrication', 'processing', 'distribution'],
      excludedIndustries: ['Trucking', 'Freight brokerage', 'Logistics'],
      employeeMin: 20,
      employeeMax: 1000,
      locations: ['Ontario'],
      requiredAttributes: ['Ships products to customers in the United States'],
      targetTitles: ['Logistics Manager', 'Shipping Manager', 'Transportation Manager', 'Supply Chain Manager', 'Operations Manager', 'Plant Manager'],
      targetDepartments: ['Logistics', 'Operations', 'Supply chain'],
      targetSeniorities: ['MANAGER', 'DIRECTOR', 'VP'],
      smallCompanyMaxEmployees: 50,
      smallCompanyTitles: ['Owner', 'President', 'General Manager'],
      preferredSignals: ['HIRING', 'EXPANSION', 'NEW_LOCATION', 'NEW_CONTRACT'],
      signalKeywords: ['shipper', 'warehouse', 'new facility', 'export'],
    },
    proofPoints: [
      { kind: 'CAPABILITY', title: 'Own fleet', statement: 'We run our own trucks and drivers on every load; nothing is brokered.', evidenceNote: 'Example data — confirm with the client before approving.' },
      { kind: 'CERTIFICATION', title: 'Bonded and C-TPAT', statement: 'We are a bonded carrier and handle customs paperwork in-house.', evidenceNote: 'Example data — confirm with the client before approving.' },
    ],
  },
  {
    slug: 'northline-industrial',
    playbook: 'industrial-supplier-outbound',
    client: {
      name: 'Northline Industrial Supply',
      status: 'ONBOARDING',
      websiteUrl: 'https://northline-industrial.example',
      description: 'Distributor of MRO, safety and fastener supplies to plants and machine shops in southern Ontario, with next-day delivery and vending for consumables.',
      productsServices: ['MRO supplies', 'Safety and PPE', 'Fasteners', 'Industrial vending'],
      serviceAreas: ['Greater Toronto Area', 'Hamilton', 'Kitchener-Waterloo', 'London'],
      industriesServed: ['Manufacturing', 'Machine shops', 'Food processing'],
      differentiators: ['Next-day delivery across southern Ontario', 'On-site vending for consumables', 'Single invoice across categories'],
      existingCustomers: [],
      averageDealValueCents: 2_400_000,
      currency: 'CAD',
      timezone: 'America/Toronto',
      senderName: 'Dana Morris',
      senderTitle: 'Account Manager',
    },
    offer: {
      name: 'Consolidated MRO supply',
      summary: 'One supplier for MRO, safety and fasteners with next-day delivery.',
      valueProposition: 'Fewer suppliers to manage and no line-down waits for common parts.',
      callToAction: 'A short call to compare your current MRO spend',
      typicalDealValueCents: 2_400_000,
    },
    icp: {
      name: 'Southern Ontario plants and machine shops',
      description: 'Manufacturers and machine shops with a maintenance team and regular consumables spend.',
      industries: ['Manufacturing', 'Machine shops', 'Metal fabrication', 'Food processing'],
      industryKeywords: ['machining', 'CNC', 'fabrication', 'plant'],
      excludedIndustries: ['Industrial distribution'],
      employeeMin: 25,
      employeeMax: 750,
      locations: ['Ontario'],
      requiredAttributes: ['Operates its own production facility'],
      targetTitles: ['Maintenance Manager', 'Purchasing Manager', 'Plant Manager', 'Operations Manager', 'Buyer'],
      targetDepartments: ['Maintenance', 'Purchasing', 'Operations'],
      targetSeniorities: ['MANAGER', 'DIRECTOR'],
      smallCompanyMaxEmployees: 40,
      smallCompanyTitles: ['Owner', 'President'],
      preferredSignals: ['EXPANSION', 'NEW_LOCATION', 'HIRING', 'NEW_CONTRACT'],
      signalKeywords: ['maintenance technician', 'millwright', 'new line', 'expansion'],
    },
    proofPoints: [
      { kind: 'CAPABILITY', title: 'Next-day delivery', statement: 'Orders placed by 4 pm are delivered the next business day across southern Ontario.', evidenceNote: 'Example data — confirm with the client before approving.' },
    ],
  },
];

export async function seedDemoClients(db: PrismaClient, organizationId: string) {
  // Workspace playbook templates first; client playbooks are copies of them.
  for (const t of STARTER_PLAYBOOKS) {
    const exists = await db.playbook.findFirst({ where: { organizationId, slug: t.slug } });
    if (!exists) await db.playbook.create({ data: templateData(organizationId, t) });
  }

  for (const demo of DEMO_CLIENTS) {
    const existing = await db.client.findFirst({ where: { organizationId, slug: demo.slug } });
    if (existing) { console.log(`  = ${demo.client.name} (already present)`); continue; }

    const client = await db.client.create({ data: { ...demo.client, organizationId, slug: demo.slug } });
    await db.offer.create({ data: { ...demo.offer, organizationId, clientId: client.id } });
    await db.idealCustomerProfile.create({ data: { ...demo.icp, organizationId, clientId: client.id } });
    for (const p of demo.proofPoints) {
      // Proof points start unapproved: nothing about a client is said in
      // outreach until a person confirms it.
      await db.proofPoint.create({ data: { ...p, organizationId, clientId: client.id, approvedForOutreach: false } });
    }

    const template = await db.playbook.findFirstOrThrow({ where: { organizationId, slug: demo.playbook } });
    const { id: _id, slug, createdAt: _c, updatedAt: _u, isTemplate: _t, sourcePlaybookId: _s, clientId: _cl, ...rest } = template;
    void [_id, _c, _u, _t, _s, _cl];
    await db.playbook.create({
      data: {
        ...rest,
        messagingAngles: rest.messagingAngles ?? undefined,
        sequenceTemplate: rest.sequenceTemplate ?? undefined,
        objectionHandling: rest.objectionHandling ?? undefined,
        name: `${template.name} — ${client.name}`,
        slug: `${slug}-${demo.slug}`,
        clientId: client.id,
        isTemplate: false,
        sourcePlaybookId: template.id,
      },
    });
    console.log(`  + ${client.name}`);
  }
}
