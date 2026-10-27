/**
 * The three services, written once and used by the homepage, the service
 * pages, the navigation and the inquiry form. Nothing here is a price or a
 * result: pricing is quoted per business, and no outcome is promised.
 */

export type ServiceKey = 'automation' | 'acquisition' | 'websites';

export type Service = {
  key: ServiceKey;
  href: string;
  name: string;
  /** How a visitor would say it: the three starting points on the homepage. */
  choice: string;
  choiceDetail: string;
  headline: string;
  summary: string;
  examples: string[];
  /** What Relay takes care of, end to end. */
  managed: string[];
  pricing: string;
};

export const SERVICES: Service[] = [
  {
    key: 'automation',
    href: '/services/automation',
    name: 'Business Automation',
    choice: 'Automate my business',
    choiceDetail: 'Custom software and workflows for the repetitive work in your operations.',
    headline: 'Your business runs better when the repetitive work runs itself.',
    summary:
      'We study how your business actually operates, decide what is worth automating, and build software around it: connected to the tools you already use, hosted and looked after by us.',
    examples: [
      'Automated data entry and document processing',
      'Quality assurance and production reporting',
      'Inventory monitoring and notifications',
      'Supplier management workflows',
      'Invoice and quotation processing',
      'Appointment scheduling and reminders',
      'Customer support workflows',
      'Spreadsheet, database and reporting automation',
      'Employee onboarding and administration',
      'Keeping data in sync across systems',
      'Custom internal dashboards',
      'Industry-specific operational software',
    ],
    managed: [
      'Mapping your current process with the people who run it',
      'Designing the solution and agreeing what it will and will not do',
      'Building, testing and connecting it to your existing systems',
      'Hosting, monitoring and fixing problems',
      'Changes and improvements as your business changes',
    ],
    pricing: 'Quoted for your business after a free consultation: a project price for the build and a monthly service fee for hosting, monitoring and support.',
  },
  {
    key: 'acquisition',
    href: '/services/customer-acquisition',
    name: 'Customer Acquisition',
    choice: 'Find me more customers',
    choiceDetail: 'A managed system that finds, researches and organizes the right prospects.',
    headline: 'Finding your next customer shouldn’t be another full-time job.',
    summary:
      'We configure a customer acquisition system around your ideal customer and your offer: finding relevant businesses, researching them, organizing the pipeline and preparing outreach for you to approve.',
    examples: [
      'Discovering relevant prospective businesses',
      'Filtering by industry, location and company characteristics',
      'Researching each prospect from public, sourced information',
      'Identifying relevant professional business contacts',
      'Qualifying and prioritizing leads',
      'Preparing personalized outreach for your review',
      'Organizing your CRM',
      'Scheduling follow-ups',
      'Managing your sales pipeline',
      'Monitoring lead activity',
      'Campaign reporting',
    ],
    managed: [
      'Defining your ideal customer and what makes a lead worth pursuing',
      'Configuring discovery and research for your market',
      'Running it continuously and keeping data organized',
      'Preparing outreach you review before anything is sent',
      'Following the marketing and consent rules that apply to you',
    ],
    pricing: 'A tailored monthly service, set by your markets, volumes and channels. Research and data costs within the agreed volumes are included.',
  },
  {
    key: 'websites',
    href: '/services/websites',
    name: 'Websites & Digital Foundations',
    choice: 'Build my online presence',
    choiceDetail: 'A professional website, booking, business email and the basics, done properly.',
    headline: 'Build the foundation your business deserves.',
    summary:
      'For new and smaller businesses: a professional website and the simple tools around it (booking, inquiries, business email, analytics), set up and maintained for you. Add automation later, when you need it.',
    examples: [
      'Professional business websites',
      'Landing pages',
      'Contact forms and inquiry management',
      'Online appointment booking',
      'Basic CRM setup',
      'Business email setup',
      'Simple customer communication workflows',
      'Website analytics',
      'Search engine foundations',
      'Simple e-commerce, when it fits',
      'Ongoing website maintenance',
    ],
    managed: [
      'Writing and designing the site with you',
      'Domain, hosting and business email setup',
      'Booking and inquiry tools connected to your inbox or CRM',
      'Updates, fixes and small changes after launch',
    ],
    pricing: 'Fixed-scope packages, quoted after a short call, so a small business can start with what it needs and add more later.',
  },
];

export function serviceByKey(key: ServiceKey): Service {
  return SERVICES.find((s) => s.key === key)!;
}
