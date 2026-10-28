# Workspace walkthrough and sales workflow

## Changes in this branch

Built on `main` at `5cac70a3a64966a9c6e8714c07d3eb30bf0e68b5` (the owner merged the contact-readiness work). Incorporates all six auth files from Claude's `f05a9eaeecbd89b349e42838fda7f2e532cadf46`, including its latest visible field borders, without replacing the other merged work. The source commits are retained as additional commit ancestry.

- A first-visit tour explains Intelligence, Studio, client/account/contact, personalized audiences, sales conversations and managed delivery. Staff and client users receive different tours. Dismissal is versioned and remembered per browser, organization, user and role. It does not require a schema migration. Start here remains available after dismissal.
- `/guide` explains every internal tool available to the current role; `/portal/guide` explains client tools. Searchable explanations, concrete next steps, and a complete first-call path replace unexplained navigation labels. Route-level permissions remain authoritative; hiding links is not an access control.
- Each internal page has an expandable explanation under its toolbar. This uses the server-resolved role, without an extra session request.
- `/call-history` shows the latest 50 logged calls, caller, outcome, notes and callback. `/email-history` shows paginated recorded incoming/outgoing messages and their actual state. Neither fabricates activity or imports an external inbox/phone history.
- Contacts also exposes a separate, paginated Company phone numbers list for discovered accounts that have a main line but no named contact yet. It reads actual account records and does not fabricate a person. The list loads only when opened.
- Contacts displays addresses and numbers directly, with suppression and verification labels. The phone filter includes a company's available main line without pretending it is a person's direct number. Call prep also shows the contact email.
- Callback retrieval happens before the queue page limit. A promised low-score callback cannot be crowded out by high-score leads. Future requested callbacks remain scheduled until their requested time.
- Private tRPC requests keep Clerk middleware context but let tRPC enforce its own session and permissions, returning structured errors instead of redirecting an API request to HTML. Other private APIs return JSON 401/403 responses for missing sessions/workspaces. An additional client transport check reports HTML/deployment failures without exposing their response bodies. Private page redirects and deny-by-default procedure authorization remain.
- Call-queue Refresh queues the existing durable CALL_QUEUE_REFRESH job and returns promptly; it no longer tries to refresh up to 1,500 contacts inside a single web request.
- Removed the shared dialog animation that overwrote horizontal centering, making dialogs inaccessible on narrow screens.
- Large sidebar menus and guide links do not prefetch every private destination in the background. No claim of measured production latency improvement is made.

## Live inspection, October 28, 2026

The user confirmed Render workspace `tea-dbdnl58ae00c738qv160`.

- Active worker: **Relay-Automation**, `srv-dbdnnivb9u1s73ab470g`, one 0.5 CPU/512 MB instance, `npm run worker`, all queue groups. It runs merged main commit `5cac70a...`; deployment `dep-dbh1t8eq1p3s73bj6210` is live. Autodeploy follows main commits.
- Older worker **Relay**, `srv-dbdnnd5g1s2s73c4mis0`, is suspended with `stuck_crashlooping`. No restart, deletion or configuration changes were made. Determine whether it is obsolete before resuming it; two workers must have deliberate group/capacity settings.
- Runtime logs show worker startup and completed discovery runs at 1:05 and 1:35 p.m. Toronto time, each importing 25 results. These counts describe discovery runs, not unique customers or usable contacts.
- The sampled hour used roughly 151–220 MB RAM with low CPU. No warning/error-level runtime entries were returned for the inspected post-deployment window. These observations do not prove contact provider access, credits, enrichment completion or a service-level guarantee.
- Build output reported dependency vulnerabilities. This branch does not apply an unreviewed major dependency upgrade. Reconcile advisories and test supported upgrades before a paid production launch.
- Vercel production is READY on the same merged commit (`dpl_UekKzGU1g8BAnvKVLhqzqt1v9KW2`). The recent 20-minute error/fatal query returned no entries; the first 1-hour query failed retention validation and must not be treated as a clean log check.
- Render's exposed tools do not provide a read-only environment-variable listing; provider credentials on the worker could not be verified. The connected Supabase account does not list a Relay project, so no unrelated project was queried and production contact/job counts remain unverified.
- The exact user-reported failing request was not captured. HTML-producing API redirects were confirmed in source and fixed with regression tests; this is not a claim that every possible source of the reported error is resolved in production.

## Contacts, Apollo and activity are different concerns

Apollo is optional. Public website contact extraction, manual entry and CSV import do not require it. To use Apollo data, the operator needs an Apollo account, appropriate API permissions and credits under its current plan. A key present in Vercel does not prove it is present on Render or has access to every endpoint. Hunter is an alternative implemented contact/email source; ZeroBounce or Hunter provides independent verification. Do not add multiple paid vendors before measuring the gap each closes.

The current Apollo connector searches people and reveals work emails. It explicitly does **not** request paid mobile/direct-number revelation (`reveal_phone_number: false`). Website/company main lines and manually supplied contact numbers are supported. Paid phone enrichment would require a separately implemented and tested asynchronous callback flow and budget controls. Do not present it as already available.

Call history requires someone to record the call outcome in Relay. Email history reflects Relay's message records and distinguishes drafts from sent messages. Sending requires a working mailbox/provider and identity configuration; capturing replies requires the supported inbound integration. A contact-data subscription does not supply these automatically.

References: [Apollo API pricing](https://docs.apollo.io/docs/api-pricing), [people enrichment](https://docs.apollo.io/reference/people-enrichment), [phone retrieval](https://docs.apollo.io/docs/retrieve-mobile-phone-numbers-for-contacts).

## How personalization works today

1. Create/select the client Relay sells for, not just a shared prospect list.
2. Complete that client's profile and active offer: what they sell, where, to whom, and what may truthfully be claimed.
3. Under Ideal customers, create criteria such as industrial manufacturers, minimum 1,000 employees, approved regions and operations/procurement buyer roles. Exclude industries that do not fit. Missing size data is uncertainty, not a confirmed size match.
4. Configure that client's discovery profile to the same audience. ICPs, discovery profiles and campaign audiences are separate saved objects today; changing one is not an automatic rewrite of the others.
5. Select the client in the workspace selector. Account/contact scores are computed against that client's active ICPs. Use its offer and playbook when creating a campaign or preparing a call.
6. Review the company-specific evidence and possible needs. Record what the person confirms or rejects; use actual qualified conversations to refine the program.

## A practical company-specific AI service

The idea is feasible when sold as managed workflows with defined access and outcomes. A website-research agent can propose where to investigate. It cannot discover internal inventory accuracy, margins, staffing problems or lost revenue without evidence and authorized access.

Example: a contractor confirms that quote requests sit in a shared inbox for two days.

- Trigger: a new quote request in the authorized shared mailbox.
- Inputs: message, service area, availability and an approved pricing/qualification reference.
- Actions: extract the request, create/update the CRM record, check required fields, draft the reply and propose appointment slots.
- Controls: allowlisted actions, per-client credentials, duplicate protection, a person approving commitments and prices, and no invented availability.
- Reliability: retry safe steps, alert on a stuck task, retain a trace, route ambiguous requests to a human, and keep the original inbox usable as a manual fallback.
- Acceptance: agreed response-time target, correct routing, no duplicate records, reviewed drafts and observed pilot performance. Sell a measurable deliverable after validating it, not an autonomous employee that supposedly understands everything.

Use the same structure for inventory alerts, meeting coordination or report assembly: map the real process, establish the source of truth, connect only the systems required, implement a small workflow, test edge cases, pilot, then expand. An AI layer handles extraction, classification and suggestions; explicit rules govern money, permissions, commitments and destructive actions. Existing Studio applications and workflows are the delivery surface; arbitrary autonomous exploration of a customer's systems is not implemented.

## Company email domain

1. Choose and buy a domain from a registrar after checking availability and brand fit. No domain was purchased in this task.
2. Set up business mailboxes with a service such as Google Workspace or Microsoft 365. A domain registration alone is not an inbox.
3. Add the provider's exact MX records for receiving mail, SPF and DKIM authentication, and a DMARC policy with reporting. Use the provider's setup wizard; do not copy generic DNS values from an example. Keep one valid SPF record and combine authorized senders as instructed by the providers.
4. Connect the mailbox/provider through Relay's supported integration, configure the sender identity and reply route, then test delivery, replies, bounces and unsubscribe handling with controlled addresses.
5. Scale based on recipient relevance and observed delivery/reply quality, within reviewed limits. Buying a domain does not make high-volume outreach ready.

References: [Google sender guidelines](https://support.google.com/mail/answer/81126), [Resend domain introduction](https://resend.com/docs/dashboard/domains/introduction).

## Path toward 1,000 paying clients

Distinguish prospect records from paying clients. Importing 1,000 companies is not acquiring 1,000 customers.

Start with one niche and one repeatable paid outcome. A reasonable proposed sequence is 5–10 managed pilots, then a capacity review at 25–50 clients, followed by expansion only when onboarding time, reliability, retention and margins support it. Those are planning stages, not projected results.

Measure contact coverage, verified reachability, qualified conversations, proposal conversion, activation, support hours per client, provider spend, workflow failures and retention. A sales forecast should use measured conversion rates; no defensible win or satisfaction probability exists yet. Keep enrichment and customer automation on separately capacity-managed workers when paid workload warrants it. Load-test on disposable data, set per-tenant budgets and limits, establish alert ownership and rollback procedures, and validate restore/recovery before committing to service targets.

The next commercial step is a controlled live pilot with a small researched cohort and a specific workflow offer. Confirm worker provider access and credits, inspect actual enrichment jobs, verify contact routes, make human-led discovery calls, and turn confirmed needs into scoped implementations. The UI changes alone cannot supply missing provider access or prove the operational model.
