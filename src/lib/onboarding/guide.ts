import type { Role } from '@prisma/client';
import { can, type Permission } from '@/lib/rbac';

export interface GuideTool { href: string; label: string; group: string; permission: Permission; purpose: string; next: string }
const tool = (href: string, label: string, group: string, permission: Permission, purpose: string, next: string): GuideTool => ({ href, label, group, permission, purpose, next });
export const GUIDE_TOOLS: GuideTool[] = [
  tool('/dashboard', 'Dashboard', 'Daily work', 'analytics:read', 'A summary of your sales activity and work waiting for attention.', 'Check the active client, then open the next task.'),
  tool('/calls', 'Call queue', 'Daily work', 'call:read', 'A ranked list of people with a usable phone number and a reason to call.', 'Start with requested callbacks and replies. Open call prep, confirm the number, then log the outcome.'),
  tool('/call-history', 'Call history', 'Daily work', 'call:read', 'The calls your team has recorded, with outcomes, notes and caller names.', 'Review previous conversations before contacting someone again. Calls made outside Relay appear only after someone logs them.'),
  tool('/email-history', 'Email history', 'Daily work', 'message:read', 'Recorded incoming and outgoing emails, including delivery state and drafts.', 'Read the status carefully: a draft is not a sent email. External mailbox history is not automatically imported.'),
  tool('/meetings', 'Meetings', 'Daily work', 'meeting:read', 'Meetings and qualification notes recorded for each client.', 'Confirm the time and send the calendar invitation from your connected calendar or manually.'),
  tool('/inquiries', 'Website inquiries', 'Daily work', 'account:read', 'People who submitted Relay’s website form and may have requested a consultation.', 'Read their stated problem and respond personally. A submission does not send an automatic sales email.'),
  tool('/assistant', 'Ask Relay', 'Daily work', 'account:read', 'Ask questions about the information available in your workspace.', 'Check the underlying records before acting. It cannot infer private company operations from a website.'),
  tool('/discovery', 'Discovery', 'Intelligence', 'account:read', 'Search connected sources for companies that match a discovery profile.', 'Choose the correct client, industry, region and size filters. Finding a company does not mean a contact has been found.'),
  tool('/pipeline', 'Research funnel', 'Intelligence', 'account:read', 'See companies moving through screening, website research and qualification.', 'Open an account to inspect the evidence and any blocked or missing steps.'),
  tool('/accounts', 'Accounts', 'Intelligence', 'account:read', 'Prospective companies you may sell to. Each belongs to one client’s outreach program.', 'Open the company brief: review what they do, sourced facts, possible needs and contact resolution.'),
  tool('/sales', 'Sales pipeline', 'Intelligence', 'account:read', 'Track real sales conversations from an opportunity to a decision.', 'Move stages based on what actually happened, and record the next action.'),
  tool('/contacts', 'Contacts', 'Intelligence', 'account:read', 'People and published business contact routes, with phone numbers and email verification state.', 'Use Has phone or Has email. If missing, open the account and choose Resolve contacts. Never guess an address.'),
  tool('/no-website', 'No-website leads', 'Intelligence', 'call:read', 'Business listings without a confirmed website, kept separate for a different sales conversation.', 'Check the listing and business number, record your call, then convert a qualified lead into an account.'),
  tool('/duplicates', 'Duplicates', 'Intelligence', 'account:read', 'Potential repeated company records that need review.', 'Compare the records before merging; a similar name alone is not proof they are the same company.'),
  tool('/campaigns', 'Campaigns', 'Intelligence', 'campaign:read', 'A client’s outreach sequence, offer, audience and follow-up rules.', 'Use that client’s ideal customers and offer. Review every message before sending.'),
  tool('/review', 'Review queue', 'Intelligence', 'message:read', 'Draft emails waiting for a person to check the facts, offer and recipient.', 'Approve only after reviewing evidence, verification and the recorded outreach basis. Sending has separate gates.'),
  tool('/analytics', 'Analytics', 'Intelligence', 'analytics:read', 'Recorded outreach and conversion results for the selected client.', 'Use actual replies and qualified conversations to improve targeting; opens alone are weak evidence.'),
  tool('/opportunities', 'Opportunities', 'Studio', 'account:read', 'Possible client needs worth discussing and developing into a project.', 'Treat website-based needs as hypotheses. Confirm the problem, current process, volume and owner on a discovery call.'),
  tool('/studio', 'Applications', 'Studio', 'studio:read', 'Client-specific automation applications, their workflows and execution history.', 'Define a trigger, authorized connections, inputs, rules, outputs and failure handling. Test before deployment.'),
  tool('/projects', 'Projects', 'Studio', 'proposal:read', 'Implementation work, milestones and delivery for agreed client projects.', 'Start from a confirmed scope and acceptance criteria, then track what is delivered.'),
  tool('/billing', 'Billing', 'Studio', 'billing:manage', 'Commercial records for services and managed applications.', 'Review the agreed scope and amount before any charge or subscription action.'),
  tool('/packages', 'Service packages', 'Studio', 'billing:manage', 'Build and support cost models used to plan sustainable prices.', 'Replace labelled assumptions with expected hours and provider costs before quoting a client.'),
  tool('/clients', 'Clients', 'Setup', 'clientProfile:write', 'The businesses Relay sells for or builds systems for. A client is different from a prospect account.', 'Set up the client’s profile, offer, ideal customers and playbook. Select that client when running outreach.'),
  tool('/playbooks', 'Playbooks', 'Setup', 'playbook:read', 'Approved call guidance, discovery questions and objection handling for a client.', 'Use questions to confirm the need instead of claiming you know their internal problems.'),
  tool('/suppression', 'Do not contact', 'Setup', 'suppression:read', 'People, emails and domains excluded from outreach.', 'Respect these exclusions before any call or message.'),
  tool('/connectors', 'Connectors', 'Administration', 'connector:manage', 'The data, AI, verification and sending services Relay can use.', 'Check missing, configured and tested states. A stored key does not prove permission, credit balance or provider availability.'),
  tool('/system', 'System', 'Administration', 'ops:read', 'Background jobs, worker status, failures and operational health.', 'Inspect failed research or enrichment jobs when the prospect list is growing but contacts are missing.'),
  tool('/team', 'Team', 'Administration', 'member:manage', 'Workspace membership and role-based access.', 'Give callers the Caller role and client users access only to their own client.'),
  tool('/settings', 'Settings', 'Administration', 'settings:read', 'Workspace defaults, sending identity and operating limits.', 'Confirm the business identity, timezone and sending limits before a pilot.'),
  tool('/research', 'Research queue', 'Advanced tools', 'research:read', 'Detailed research jobs and their state.', 'Use this when you need to investigate an individual research task.'),
  tool('/solutions', 'Solution library', 'Advanced tools', 'proposal:read', 'Reusable solution templates for scoping automation work.', 'Adapt the template to a confirmed client need and supported integrations.'),
  tool('/proposals', 'Proposals', 'Advanced tools', 'proposal:read', 'Commercial proposals with scope and pricing.', 'Review assumptions, exclusions and milestones before sharing.'),
  tool('/portfolios', 'Demo sites', 'Advanced tools', 'portfolio:read', 'Demonstration websites created for a prospect.', 'Label sample content clearly and review every demo before sharing.'),
];
export const PORTAL_TOOLS: GuideTool[] = [
  tool('/portal', 'Overview', 'Your workspace', 'portal:read', 'Results and recent activity for your company’s Relay service.', 'Your company’s records are separate from other clients.'),
  tool('/portal/meetings', 'Meetings', 'Your workspace', 'portal:read', 'Meetings recorded for your business.', 'Review the qualification notes and confirm the next conversation.'),
  tool('/portal/campaigns', 'Campaigns', 'Your workspace', 'portal:read', 'The outreach campaigns Relay runs for your company.', 'Check that the audience and offer match your priorities; ask your Relay manager to change targeting.'),
  tool('/portal/apps', 'Applications', 'Your workspace', 'studio:read', 'The automation applications configured for your company.', 'Use the available workflows and review their outcomes. Connections and deployment are managed separately.'),
  tool('/portal/profile', 'Your business', 'Your workspace', 'portal:read', 'Your company profile, offer and ideal customer criteria.', 'Keep your products, buyer roles, industries, regions and company-size targets current.'),
];
export function toolsFor(role: Role) {
  return (role === 'CLIENT_ADMIN' || role === 'CLIENT_MEMBER' ? PORTAL_TOOLS : GUIDE_TOOLS).filter(t => can(role, t.permission));
}
export function guideForPath(role: Role, path: string) {
  return toolsFor(role).filter(t => path === t.href || path.startsWith(`${t.href}/`)).sort((a, b) => b.href.length - a.href.length)[0];
}
export function guideStorageKey(organizationId: string, userId: string, role: Role) {
  return `relay:welcome:v1:${organizationId}:${userId}:${role}`;
}
