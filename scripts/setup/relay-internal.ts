/**
 * Configures Relay's own company as the first, internal client of Relay
 * Intelligence: its business profile, its two offers, one ideal customer
 * profile and one discovery profile per target industry, the playbook its
 * outreach follows, one draft campaign per offer (every email reviewed,
 * research-based drafts only), and the research funnel's daily limits and
 * budgets.
 *
 * Everything goes through the same services the app uses, so validation and
 * defaults are the app's. Safe to run again: existing offers, profiles and
 * the playbook are found by name and updated, never duplicated. Nothing here
 * is a measured result or a claim about customers; it is configuration.
 *
 * Usage: npx tsx scripts/setup/relay-internal.ts <organizationId> <clientId> [userId]
 */
import { db } from '@/lib/db';
import { systemAccess } from '@/server/access/scope';
import { createIcp, createOffer, updateClient, updateIcp, updateOffer, type IcpInput } from '@/server/services/clients';
import { createPlaybook, updatePlaybook, type PlaybookInput } from '@/server/services/playbooks';
import { createProfile, updateProfile, type DiscoveryProfileInput } from '@/server/services/discovery/profiles';
import { updatePipelineSettings } from '@/server/services/pipeline/settings';
import { createCampaign } from '@/server/services/campaigns';

const [organizationId, clientId, userId] = process.argv.slice(2);
if (!organizationId || !clientId) {
  console.error('Usage: npx tsx scripts/setup/relay-internal.ts <organizationId> <clientId> [userId]');
  process.exit(1);
}

const LEAD_GEN = 'AI Lead Generation & Customer Acquisition';
const AUTOMATION = 'Custom AI & Business Process Automation';

const GTA = ['Toronto', 'Mississauga', 'Brampton', 'Vaughan', 'Markham', 'Richmond Hill', 'Oakville', 'Burlington', 'Milton', 'Pickering', 'Ajax', 'Whitby', 'Oshawa', 'Hamilton'];
const REST_OF_ONTARIO = ['Kitchener', 'Waterloo', 'Cambridge', 'Guelph', 'London', 'Ottawa', 'Barrie', 'St. Catharines'];
const LOCATIONS = ['Ontario', 'ON', 'Greater Toronto Area', ...GTA, ...REST_OF_ONTARIO];
const LARGE_CHAINS = ['Walmart', 'Costco', 'Canadian Tire', 'Home Depot', "Lowe's", 'Shoppers Drug Mart', 'Rexall', 'Loblaws', 'Staples', 'Best Buy', 'IKEA'];

const SENIOR = ['OWNER', 'C_LEVEL', 'VP', 'DIRECTOR', 'MANAGER'] as const;
const OWNERS = ['Owner', 'Founder', 'President'];

interface Segment {
  key: string;
  name: string;
  description: string;
  /** Google Places search terms; also the industry Relay records for what each search finds. */
  searches: string[];
  keywords: string[];
  requiredAttributes: string[];
  titles: string[];
  departments: string[];
  signals: IcpInput['preferredSignals'];
  signalKeywords: string[];
}

const SEGMENTS: Segment[] = [
  {
    key: 'manufacturing', name: 'Manufacturing and industrial',
    description: 'Manufacturers, machine shops and industrial suppliers that sell to other businesses. Quoting, order intake, production scheduling and supplier follow-up are often manual.',
    searches: ['manufacturing company', 'machine shop', 'metal fabrication', 'plastics manufacturer', 'industrial equipment supplier'],
    keywords: ['manufactur', 'machining', 'cnc', 'fabricat', 'industrial', 'tool and die', 'plastics', 'packaging'],
    requiredAttributes: ['Makes or supplies physical products to other businesses', 'Takes quote requests or orders by phone, email or a web form'],
    titles: ['Owner', 'President', 'CEO', 'General Manager', 'Operations Manager', 'Plant Manager', 'VP Operations', 'Sales Manager'],
    departments: ['Operations', 'Sales', 'Executive'],
    signals: ['HIRING', 'EXPANSION', 'NEW_LOCATION', 'NEW_PRODUCT', 'NEW_CONTRACT'],
    signalKeywords: ['hiring', 'new facility', 'new equipment', 'ISO certified', 'new product line', 'expansion'],
  },
  {
    key: 'construction', name: 'Construction and contracting',
    description: 'General and trade contractors. Estimating, quote follow-up, scheduling crews and client updates take office time.',
    searches: ['general contractor', 'construction company', 'renovation contractor', 'electrical contractor', 'plumbing contractor', 'HVAC contractor', 'roofing contractor'],
    keywords: ['construction', 'contractor', 'renovation', 'electrical', 'plumbing', 'hvac', 'roofing', 'builder'],
    requiredAttributes: ['Offers quotes or estimates to customers', 'Runs several projects or crews at once'],
    titles: ['Owner', 'President', 'General Manager', 'Operations Manager', 'Project Manager', 'Estimator', 'Office Manager'],
    departments: ['Operations', 'Estimating', 'Executive'],
    signals: ['HIRING', 'EXPANSION', 'NEW_CONTRACT', 'NEW_LOCATION'],
    signalKeywords: ['hiring', 'now hiring', 'new projects', 'expanding', 'new service area'],
  },
  {
    key: 'logistics', name: 'Trucking, transportation and logistics',
    description: 'Carriers, freight brokers, couriers and warehousing. Dispatch, status updates, paperwork and rate quotes are high-volume and repetitive.',
    searches: ['trucking company', 'freight logistics company', 'courier service', 'warehousing and distribution', 'freight broker'],
    keywords: ['trucking', 'freight', 'logistics', 'transport', 'courier', 'warehous', 'distribution', 'carrier'],
    requiredAttributes: ['Moves freight or operates a fleet', 'Serves business customers'],
    titles: ['Owner', 'President', 'General Manager', 'Operations Manager', 'Dispatch Manager', 'Logistics Manager', 'Sales Manager'],
    departments: ['Operations', 'Dispatch', 'Sales', 'Executive'],
    signals: ['HIRING', 'EXPANSION', 'NEW_LOCATION', 'NEW_CONTRACT'],
    signalKeywords: ['hiring drivers', 'new lanes', 'new warehouse', 'fleet expansion', 'new terminal'],
  },
  {
    key: 'healthcare', name: 'Medical and healthcare administration',
    description: 'Clinics and practices with front-desk and admin load: booking, intake forms, reminders, billing. Any automation must respect patient privacy (PHIPA).',
    searches: ['medical clinic', 'physiotherapy clinic', 'dental clinic', 'chiropractic clinic', 'medical laboratory'],
    keywords: ['clinic', 'medical', 'physiotherapy', 'dental', 'chiropract', 'health', 'laboratory', 'rehab'],
    requiredAttributes: ['Books appointments for patients or clients', 'Has several practitioners or locations'],
    titles: ['Owner', 'Clinic Director', 'Clinic Manager', 'Practice Manager', 'Office Manager', 'Administrator', 'Medical Director'],
    departments: ['Administration', 'Operations', 'Executive'],
    signals: ['HIRING', 'NEW_LOCATION', 'EXPANSION'],
    signalKeywords: ['now hiring', 'new location', 'accepting new patients', 'online booking'],
  },
  {
    key: 'pharma', name: 'Pharmaceuticals',
    description: 'Independent pharmacies, compounding pharmacies, pharmaceutical distributors and life-science companies. Ordering, inventory, compliance paperwork and refill follow-up are process-heavy.',
    searches: ['independent pharmacy', 'compounding pharmacy', 'pharmaceutical company', 'pharmaceutical distributor'],
    keywords: ['pharma', 'pharmacy', 'compounding', 'drug', 'life science', 'biotech'],
    requiredAttributes: ['Manufactures, distributes or dispenses pharmaceutical products'],
    titles: ['Owner', 'Pharmacist-Owner', 'President', 'General Manager', 'Operations Manager', 'Director of Operations'],
    departments: ['Operations', 'Executive'],
    signals: ['HIRING', 'EXPANSION', 'NEW_LOCATION', 'REGULATORY_EVENT', 'NEW_PRODUCT'],
    signalKeywords: ['hiring', 'new location', 'expansion', 'Health Canada', 'new product'],
  },
  {
    key: 'beauty', name: 'Spas, salons and beauty',
    description: 'Spas, salons, med spas and barbers. Bookings, reminders, no-shows, rebooking and reviews are the daily admin.',
    searches: ['spa', 'hair salon', 'beauty salon', 'nail salon', 'med spa', 'barber shop'],
    keywords: ['spa', 'salon', 'beauty', 'nail', 'barber', 'aesthetic', 'lash', 'skin'],
    requiredAttributes: ['Takes appointments or bookings'],
    titles: ['Owner', 'Founder', 'Salon Owner', 'Spa Director', 'General Manager', 'Salon Manager'],
    departments: ['Operations', 'Executive'],
    signals: ['NEW_LOCATION', 'HIRING', 'EXPANSION', 'NEW_PRODUCT'],
    signalKeywords: ['now hiring', 'new location', 'grand opening', 'online booking', 'new services'],
  },
  {
    key: 'retail', name: 'Retail and e-commerce',
    description: 'Independent retailers and online stores. Order handling, inventory updates, customer service replies and marketing follow-up repeat every day.',
    searches: ['online store', 'boutique', 'specialty retail store', 'e-commerce business'],
    keywords: ['retail', 'store', 'shop', 'boutique', 'e-commerce', 'ecommerce', 'online store'],
    requiredAttributes: ['Sells products online or in a store'],
    titles: ['Owner', 'Founder', 'CEO', 'General Manager', 'E-commerce Manager', 'Operations Manager', 'Marketing Manager'],
    departments: ['Operations', 'E-commerce', 'Marketing', 'Executive'],
    signals: ['NEW_LOCATION', 'EXPANSION', 'HIRING', 'NEW_PRODUCT'],
    signalKeywords: ['new store', 'now online', 'shop online', 'hiring', 'new collection'],
  },
  {
    key: 'real-estate', name: 'Real estate',
    description: 'Brokerages, property managers and commercial real estate firms. Lead follow-up, showing coordination, tenant requests and document handling are constant.',
    searches: ['real estate brokerage', 'property management company', 'commercial real estate firm'],
    keywords: ['real estate', 'realty', 'brokerage', 'property management', 'realtor', 'leasing'],
    requiredAttributes: ['Manages listings, leads, tenants or properties'],
    titles: ['Broker of Record', 'Owner', 'Managing Broker', 'President', 'Property Manager', 'Operations Manager'],
    departments: ['Operations', 'Sales', 'Executive'],
    signals: ['HIRING', 'EXPANSION', 'NEW_LOCATION'],
    signalKeywords: ['hiring agents', 'join our team', 'new office', 'now leasing'],
  },
  {
    key: 'professional-services', name: 'Professional services',
    description: 'Accounting, law, consulting, engineering, insurance and marketing firms. Client intake, document collection, scheduling and follow-up take billable time.',
    searches: ['accounting firm', 'law firm', 'consulting firm', 'engineering firm', 'insurance broker', 'marketing agency'],
    keywords: ['accounting', 'cpa', 'law', 'legal', 'consulting', 'engineering', 'insurance', 'agency', 'advisory'],
    requiredAttributes: ['Serves business or individual clients on projects or retainers'],
    titles: ['Managing Partner', 'Partner', 'Owner', 'Principal', 'Founder', 'Office Manager', 'Director of Operations'],
    departments: ['Operations', 'Administration', 'Executive'],
    signals: ['HIRING', 'EXPANSION', 'NEW_LOCATION', 'NEW_PRODUCT'],
    signalKeywords: ['hiring', 'new office', 'new service', 'growing team'],
  },
  {
    key: 'startups', name: 'Startups and emerging companies',
    description: 'Young, growing companies, often software or technology. They need customers fast and have little admin capacity. Map listings find only some of them.',
    searches: ['software company', 'technology startup', 'SaaS company', 'app development company'],
    keywords: ['startup', 'software', 'saas', 'technology', 'tech', 'app', 'platform'],
    requiredAttributes: ['A young or growing company'],
    titles: ['Founder', 'Co-founder', 'CEO', 'COO', 'Head of Growth', 'Head of Operations'],
    departments: ['Executive', 'Growth', 'Operations'],
    signals: ['FUNDING', 'HIRING', 'NEW_PRODUCT', 'EXPANSION'],
    signalKeywords: ['raised', 'seed round', 'series a', 'hiring', 'launch', 'beta'],
  },
];

const PLAYBOOK: PlaybookInput = {
  name: 'Relay: AI lead generation and automation',
  description: 'How Relay approaches businesses for its own two services. Lead with one specific, verified observation from research; offer the one service that fits it; ask for a short call.',
  industryFocus: 'Multi-industry, GTA and Ontario',
  targetAccountTypes: ['Small and mid-sized businesses', 'Owner-led companies', 'Growing teams with manual admin'],
  targetTitles: ['Owner', 'Founder', 'President', 'CEO', 'General Manager', 'Operations Manager', 'Office Manager', 'Sales Manager', 'Director of Operations'],
  targetDepartments: ['Executive', 'Operations', 'Sales', 'Administration'],
  usefulSignals: ['HIRING', 'EXPANSION', 'NEW_LOCATION', 'NEW_PRODUCT', 'NEW_CONTRACT', 'TECHNOLOGY_CHANGE'],
  signalKeywords: ['hiring', 'new location', 'expansion', 'grand opening', 'online booking', 'request a quote', 'new service'],
  // Nothing is approved for automatic sending: every email is reviewed.
  approvedClaimTypes: [],
  messagingAngles: [
    { key: 'manual-intake', name: 'Manual intake', description: 'They take quotes, bookings or orders by phone, email or a basic form. Offer to automate intake and follow-up.' },
    { key: 'growth-capacity', name: 'Growing without more admin', description: 'They are hiring or expanding. Offer automation so new volume does not need new admin staff.' },
    { key: 'more-customers', name: 'More of the right customers', description: 'They sell to businesses and rely on referrals or inbound enquiries. Offer a lead generation system that finds and researches the right prospects for them.' },
    { key: 'follow-up', name: 'Faster follow-up', description: 'Enquiries or customers wait for replies. Offer automated follow-up and reminders.' },
  ],
  sequenceTemplate: [
    { delayDays: 0, purpose: 'opener', instructions: 'First contact. Open with one specific, verified observation about their business. Connect it to the one Relay service that fits it best, in one sentence. Ask for a short call. Under 110 words. Make no claims about results Relay has not proven.' },
    { delayDays: 4, purpose: 'follow-up', instructions: 'Short follow-up in the same thread. Describe what a small first step would look like for them (one process, or one list of researched prospects). Under 70 words.' },
    { delayDays: 9, purpose: 'last note', instructions: 'Last note. Acknowledge they are busy, offer a one-page outline instead of a call, and make it easy to say no. Under 50 words.' },
  ],
  callOpener: "Hi, this is [your name] from Relay. I was looking at [company]'s website and noticed [one specific observation from the research]. We help businesses like yours with [the service that fits]. Do you have two minutes for me to explain why I'm calling?",
  discoveryQuestions: [
    'How do new customers usually find you today?',
    'Who handles quotes, bookings or orders, and how much of their week does it take?',
    'Which tasks does your team repeat every day that you wish happened on their own?',
    'What software runs the business today (CRM, accounting, scheduling)?',
    'If you could take one manual process off your plate this quarter, which would it be?',
    'How many more customers could you handle next month if they came in?',
  ],
  objectionHandling: [
    { objection: 'ALREADY_HAVE_PROVIDER', response: 'That makes sense. Most of what we build works with the tools you already use rather than replacing them. Would it be worth comparing one process side by side?' },
    { objection: 'TOO_EXPENSIVE', response: 'Understood. We usually start with one small, fixed-scope piece so you can see the value before committing to more.' },
    { objection: 'BAD_TIMING', response: 'No problem. When would be a better time to revisit? I can send a short outline to keep on file.' },
    { objection: 'NO_NEED', response: 'Fair enough. Which part of your week takes the most manual effort? If nothing stands out, I will leave it there.' },
    { objection: 'SEND_INFORMATION', response: 'Happy to. So it is relevant to you, can I ask one question about how you handle that process today?' },
    { objection: 'NOT_DECISION_MAKER', response: 'Thanks. Who would usually look at improving how that works? I am happy to reach out to them directly.' },
  ],
  qualificationCriteria: [
    'A manual process, or a need for more customers, confirmed by the prospect',
    'A decision maker is involved or identified',
    'Willing to start with a small first project or pilot',
    'A timeline within the next three months',
  ],
};

async function main() {
  const access = systemAccess(organizationId!);
  const client = await db.client.findFirstOrThrow({ where: { id: clientId, organizationId } });

  await updateClient(access, client.id, {
    name: 'Relay',
    websiteUrl: null,
    description: 'Relay builds two things for businesses: customized AI lead generation systems that find, research and organize outreach to the right prospective customers, and custom AI and business process automation that takes manual work out of day-to-day operations.',
    productsServices: ['AI lead generation and customer acquisition systems', 'Custom software applications, integrations and automated workflows'],
    serviceAreas: ['Greater Toronto Area', 'Ontario', 'Canada'],
    industriesServed: SEGMENTS.map((s) => s.name),
    differentiators: [
      'Research on every prospect is tied to public sources and checked before it is used',
      'Outreach is reviewed and approved by a person, and follows Canada’s anti-spam law',
      'Automation is built from reusable, tested components and configured for each business',
      'Systems are supported and improved month to month',
    ],
    currency: 'CAD',
    timezone: 'America/Toronto',
    status: 'ACTIVE',
    notes: "Internal client: Relay's own company, set up as the first client of its own lead generation to prove the system before selling it to others. Never billed.",
  }, { internal: true });

  const offers = [
    {
      name: LEAD_GEN,
      summary: 'A customized system that discovers prospective customers, researches each business, identifies the right professional contacts, qualifies opportunities and organizes personalized sales outreach.',
      description: 'Relay Intelligence configured for one business: who its best customers are, where to find more of them, what to research about each, and how to reach them. Every lead comes with its sources, a priority score and prepared outreach for review.',
      valueProposition: 'More qualified sales conversations without more manual prospecting: the team spends its time on the businesses most likely to buy, with research and outreach already prepared.',
      callToAction: 'A 15-minute call',
    },
    {
      name: AUTOMATION,
      summary: 'Software applications, integrations and automated workflows that reduce manual work, improve productivity and streamline operations.',
      description: 'Relay Studio applications built from reusable, tested solutions and configured for one business: intake, scheduling, follow-up, reporting and the hand-offs between the tools it already uses, supported monthly.',
      valueProposition: 'Repetitive admin, data entry and follow-up handled automatically, so staff can focus on customers and the work that needs a person.',
      callToAction: 'A 20-minute call to map one process',
    },
  ];
  for (const o of offers) {
    const existing = await db.offer.findFirst({ where: { clientId, name: o.name } });
    if (existing) await updateOffer(access, existing.id, o); else await createOffer(access, clientId!, o);
  }

  const icpIds: Record<string, string> = {};
  for (const s of SEGMENTS) {
    const icp: IcpInput = {
      name: s.name,
      description: s.description,
      industries: s.searches,
      industryKeywords: s.keywords,
      excludedIndustries: [],
      locations: LOCATIONS,
      requiredAttributes: s.requiredAttributes,
      targetTitles: s.titles,
      targetDepartments: s.departments,
      targetSeniorities: [...SENIOR],
      smallCompanyMaxEmployees: 20,
      smallCompanyTitles: OWNERS,
      preferredSignals: s.signals,
      signalKeywords: s.signalKeywords,
    };
    const existing = await db.idealCustomerProfile.findFirst({ where: { clientId, name: s.name } });
    icpIds[s.key] = existing ? (await updateIcp(access, existing.id, icp)).id : (await createIcp(access, clientId!, icp)).id;
  }

  const existingPlaybook = await db.playbook.findFirst({ where: { clientId, name: PLAYBOOK.name } });
  const playbook = existingPlaybook ? await updatePlaybook(access, existingPlaybook.id, PLAYBOOK) : await createPlaybook(access, clientId!, PLAYBOOK);

  // One draft campaign per offer. Drafts only: they need a connected mailbox
  // and the client's mailing address before they can be activated, and every
  // email waits in the review queue.
  for (const offerName of [LEAD_GEN, AUTOMATION]) {
    const name = `Relay: ${offerName}`;
    if (await db.campaign.findFirst({ where: { clientId, name } })) continue;
    const offer = await db.offer.findFirstOrThrow({ where: { clientId, name: offerName } });
    await createCampaign(access, {
      clientId: clientId!, name, offerId: offer.id, playbookId: playbook.id,
      objective: `First conversations with researched GTA and Ontario businesses about ${offerName}.`,
      timezone: 'America/Toronto', sendDays: [1, 2, 3, 4, 5], sendStartHour: 9, sendEndHour: 16, dailyCap: 10,
      approvalMode: 'REVIEW_ALL', maxContactsPerAccount: 1, callFollowUp: true,
      // Only drafts grounded in research on the company itself.
      allowContextual: false, contextualDailyCap: 0,
    });
  }

  for (const s of SEGMENTS) {
    const profile: DiscoveryProfileInput = {
      clientId: clientId!,
      icpId: icpIds[s.key],
      name: `${s.name}, GTA and Ontario`,
      isActive: true,
      sources: ['google_places'],
      country: 'CA',
      regions: ['ON'],
      cities: [...GTA, ...REST_OF_ONTARIO],
      industries: s.searches,
      keywords: [],
      excludeKeywords: LARGE_CHAINS,
      maxResultsPerRun: 25,
      // Google Places list price, before Google's monthly free requests.
      monthlyBudgetCents: 300,
      frequency: 'DAILY',
      // Research is queued by the funnel instead: qualified accounts first, within the daily allowance.
      autoResearch: false,
    };
    const existing = await db.discoveryProfile.findFirst({ where: { clientId, name: profile.name, archivedAt: null } });
    if (existing) await updateProfile(access, existing.id, profile); else await createProfile(access, userId ?? (null as unknown as string), profile);
  }

  await updatePipelineSettings(organizationId!, userId ?? (null as unknown as string), {
    autoScreen: true,
    autoAnalyze: true,
    autoDeep: true,
    // Map listings carry no headcount or signals until research finds them, so the bar to be analysed is lower than the default.
    screeningThreshold: 40,
    deepThreshold: 65,
    // Website analysis runs on the low-cost model (a few tenths of a cent to
    // a cent per company); deep research, on the strongest, is the larger share.
    maxAnalysesPerDay: 50,
    maxDeepPerDay: 2,
    // The $20 a month for research: website analysis and deep research.
    analysisBudgetCents: 900,
    deepBudgetCents: 1100,
    // Ceilings, not expected spend: Places list price before free requests, contact lookups, drafting.
    discoveryBudgetCents: 3000,
    enrichmentBudgetCents: 1000,
    outreachBudgetCents: 500,
    globalBudgetCents: 6500,
  });

  const summary = {
    offers: await db.offer.count({ where: { clientId } }),
    icps: await db.idealCustomerProfile.count({ where: { clientId } }),
    playbooks: await db.playbook.count({ where: { clientId } }),
    discoveryProfiles: await db.discoveryProfile.count({ where: { clientId, archivedAt: null } }),
    campaigns: await db.campaign.count({ where: { clientId } }),
  };
  console.log(JSON.stringify(summary));
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
