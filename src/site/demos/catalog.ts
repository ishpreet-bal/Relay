/**
 * The demo catalogue: what each sample application shows, in plain words.
 * Every demo runs on fictional data in the browser. None is a client
 * project, and none connects to a real system.
 */

export type DemoMeta = {
  slug: string;
  industry: string;
  title: string;
  tagline: string;
  problem: string;
  manual: string[];
  automated: string[];
  output: string;
  customize: string[];
};

export const DEMOS: DemoMeta[] = [
  {
    slug: 'quality-report',
    industry: 'Manufacturing',
    title: 'Quality records to a shift report',
    tagline: 'Three lines, three file formats, one validated report.',
    problem: 'Each production line records inspections its own way. Someone has to collect the files, fix the mistakes, combine them and write up the numbers before anyone can act.',
    manual: ['Download each line’s file and copy it into a master spreadsheet', 'Spot blanks, unit mix-ups and typos by eye', 'Rebuild pivot tables to work out yield by line', 'Write the summary and email it to the quality lead'],
    automated: ['Files are picked up from wherever each line saves them', 'Every record is checked: blanks sent back, inches converted, labels standardized', 'Yield, out-of-tolerance parts and defect types are calculated per line', 'A report and an alert for any line below target are prepared'],
    output: 'A line-by-line yield report, a ranked list of issues, and an alert for lines below target.',
    customize: ['Your parts, specifications and tolerances', 'Where your data lives: spreadsheets, a shared drive, an MES or a database', 'Who gets which report, and when', 'Thresholds that trigger an alert or a hold'],
  },
  {
    slug: 'estimate',
    industry: 'Construction',
    title: 'Customer inquiry to draft estimate',
    tagline: 'A message in the customer’s own words becomes a priced draft and a plan.',
    problem: 'Every inquiry needs the same first steps: work out what the customer wants, ask what is missing, price it from the rate sheet and plan the next visits. It eats evenings.',
    manual: ['Read the inquiry and note the project type, size and finishes', 'Open the rate sheet and build the estimate line by line', 'Email back to ask for whatever was missing', 'Add the site visit and supplier calls to the calendar'],
    automated: ['The inquiry is read for project type, size, materials, timing and location', 'Line items are priced from your rate sheet, with contingency and HST', 'Questions for anything missing are drafted', 'Follow-up tasks are created with dates'],
    output: 'A draft estimate with a price range, questions for the customer, and a dated task list, ready for an estimator to check.',
    customize: ['Your rate sheet, markups and payment terms', 'The project types and trades you take on', 'Where inquiries come from: web form, email, phone notes', 'Your CRM, calendar and quoting tools'],
  },
  {
    slug: 'shipments',
    industry: 'Logistics & Trucking',
    title: 'Scan events to customer updates',
    tagline: 'Every shipment tracked against its promise; customers told only what matters.',
    problem: 'Dispatch spends the day answering “where is my shipment?” while checking carrier portals one by one, and customers hear about delays late or not at all.',
    manual: ['Check each carrier portal or call drivers for locations', 'Compare against promised delivery times in a spreadsheet', 'Phone or email customers about delays as they come up', 'Compile an end-of-day dispatch summary'],
    automated: ['Scan and GPS events flow into one tracking view', 'Each shipment’s arrival is re-estimated as events arrive', 'Status moves between on time, at risk, delayed and delivered', 'A customer update is written only when the status changes'],
    output: 'A live board of every shipment, the customer updates that would go out, and a dispatch summary at any point in the day.',
    customize: ['Your carriers, telematics and TMS', 'How early “at risk” should trigger', 'Message wording, channels and which customers get them', 'Invoice reconciliation against delivered loads'],
  },
  {
    slug: 'clinic-admin',
    industry: 'Healthcare administration',
    title: 'Front-desk paperwork routed and reminders sent',
    tagline: 'Administrative items to the right queue; reminders on schedule.',
    problem: 'Faxes, forms, emails and voicemails all land at the front desk. Sorting them takes time, and reminders depend on someone remembering to send them.',
    manual: ['Read every incoming item and decide who handles it', 'Forward or print it for the right person', 'Call or text patients the day before their appointment', 'Track what is still waiting'],
    automated: ['Each item is classified by type', 'It is routed to scheduling, records, billing or the front desk, with a priority', 'Anything that reads as clinical goes to the clinical team, never answered automatically', 'Reminders go out on the schedule you set, with no clinical details'],
    output: 'Work queues with every item sorted and prioritized, and a reminder schedule for tomorrow’s appointments.',
    customize: ['Your item types, queues and staff', 'Your scheduling system', 'Reminder timing, channels and wording', 'The privacy and record-keeping requirements that apply to your clinic, assessed before anything is built'],
  },
  {
    slug: 'booking',
    industry: 'Spas, salons & local services',
    title: 'Booking request to confirmed appointment',
    tagline: 'The right person, a slot that fits, and reminders that go out on their own.',
    problem: 'Bookings arrive by phone, text and direct message. Fitting a two-hour colour into a busy day, and remembering to send reminders, is all done by hand.',
    manual: ['Check the paper or shared calendar for each staff member', 'Work out whether the service fits before the next client', 'Text the customer to confirm, then again the day before', 'Remember to invite them back in a few weeks'],
    automated: ['The customer picks a service, a staff member and a preferred time', 'Only slots long enough for the service, with cleanup time, are offered', 'The booking is confirmed and added to the calendar', 'Reminders and a rebooking nudge are scheduled automatically'],
    output: 'The closest available options, the confirmed booking on the day’s calendar, and the messages the customer will receive.',
    customize: ['Your services, durations, prices and staff skills', 'Opening hours, breaks and buffers', 'Deposits and cancellation rules', 'The booking tool and calendar you already use'],
  },
  {
    slug: 'inventory',
    industry: 'Retail & e-commerce',
    title: 'Stock levels to draft purchase orders',
    tagline: 'Know what will run out before it does, and reorder in one approval.',
    problem: 'Reorders happen when someone notices an empty shelf. By then the supplier’s lead time means days of lost sales.',
    manual: ['Count stock or export it from the POS', 'Guess which items are selling fast', 'Email each supplier with quantities', 'Track which orders are still on the way'],
    automated: ['Stock and sales are read from your store every day', 'Days of stock left are compared with each supplier’s lead time', 'Items at their reorder point are flagged', 'Purchase orders are drafted per supplier, for you to approve'],
    output: 'Low-stock alerts and draft purchase orders grouped by supplier, with quantities rounded to case packs.',
    customize: ['Your store, POS or e-commerce platform', 'Safety stock and how many days each order should cover', 'Supplier lead times, case packs and minimum orders', 'Order status messages for your customers'],
  },
  {
    slug: 'prospects',
    industry: 'Startups & professional services',
    title: 'Ideal customer profile to qualified prospects',
    tagline: 'Describe who you sell to; get a researched, ranked list with reasons.',
    problem: 'Founders search for prospects by hand, research them in tabs and track everything in a spreadsheet, between everything else.',
    manual: ['Search directories and maps for businesses that might fit', 'Visit each website to judge the fit', 'Copy details into a spreadsheet', 'Write each first message from scratch'],
    automated: ['Your ideal customer is defined: industry, size, location, signals', 'Matching businesses are found from public sources', 'Each one is scored against the profile, with the reasons shown', 'A first line of outreach is prepared for qualified prospects, for you to review'],
    output: 'A ranked list of prospects with the reasons each one does or does not fit, and draft openers for the qualified ones.',
    customize: ['Your market, offer and what makes a good customer', 'The data sources used for discovery and research', 'Scoring weights and the qualification threshold', 'Your CRM and the approval step before anything is sent'],
  },
];

export const demoBySlug = (slug: string) => DEMOS.find((d) => d.slug === slug);
