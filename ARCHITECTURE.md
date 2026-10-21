# Relay — architecture

Relay is an outbound sales operating system for traditional B2B businesses —
trucking companies, machine shops, manufacturers, industrial suppliers,
commercial cleaners. It is also the internal tool of a done-for-you outbound
service, so three kinds of people use it:

- **Relay staff** (admins, operators, analysts) set up clients and run campaigns.
- **Callers** work a prioritized call queue and book meetings.
- **Clients** see results — meetings, campaigns, their business profile — in a portal.

The division of labour is deliberate: the software finds, researches,
prioritizes and drafts; people hold the conversations; every outcome is
recorded so the next decision is better informed.

---

## 1. Shape of the system

**One Next.js 15 deployable plus a worker.** App Router pages, tRPC for typed
API calls, and business logic in `src/server/services` — never in route
handlers or components, so the same logic serves pages, the worker and any
future REST API. The worker (`npm run worker`) runs research, background jobs,
rescoring, sequencing and the call-queue refresh.

**Postgres via Prisma.** Every table is tenant-scoped. Background work uses
Postgres itself as the queue (`Job` rows claimed with `FOR UPDATE SKIP
LOCKED`), so there is no separate queue service to run or lose.

**Providers behind interfaces.** Data, email, AI and (later) calendar, phone
and CRM providers are connectors (`src/server/connectors`). Relay orchestrates
them; it does not try to be a contact database.

```
src/
  app/(app)/        internal workspace pages (staff and callers)
  app/portal/       client portal
  app/api/          tRPC, webhooks (Clerk, Resend, Stripe), unsubscribe
  components/       UI, grouped by area
  lib/              auth, rbac, domain vocabulary, env, tRPC client
  server/access/    AccessContext and client scoping
  server/services/  domain logic (accounts, scoring, campaigns, calls, …)
  server/ai/        research and drafting pipelines, model provider
  server/verification/  claim checking and the auto-send policy
  server/connectors/    provider registry and implementations
  server/worker.ts  background loop
```

---

## 2. Tenancy and access

Two levels:

- **Organization** — the workspace (Relay itself). Hard boundary.
- **Client** — a business Relay sells for. Every prospect, campaign, call,
  meeting, signal and cost belongs to exactly one client.

`AccessContext` (`server/access/scope.ts`) is built from the session and
passed to every service. `clientFilter(access, clientId?)` returns the `where`
fragment for a query: internal roles may see all clients (optionally narrowed
to one), client roles see only their own, and a client user not yet connected
to a client sees nothing. Raw SQL (the analytics breakdowns) applies the same
scope through `clientCond`.

Roles (`lib/rbac.ts`), each with an explicit permission set:

| Role | For |
|---|---|
| SUPER_ADMIN | Owner: everything, including billing |
| RELAY_ADMIN | Runs operations across all clients; team, connectors, settings |
| OPERATOR | Runs campaigns: approves and sends, edits client setup and playbooks |
| ANALYST | Builds lists, researches, drafts; cannot send |
| CALLER | Call queue, call prep, outcomes and meetings — nothing else |
| CLIENT_ADMIN | Client portal, can edit their business profile |
| CLIENT_MEMBER | Client portal, read-only |

Roles are owned by Relay, not Clerk. Invitations carry the intended role and
client in Clerk `publicMetadata`; the membership webhook applies them, never
grants owner from metadata, and falls back to the least-privileged role.

**Database exposure.** RLS is enabled on every table with no policies, which
closes Supabase's auto-generated REST API to the `anon` and `authenticated`
roles. The application connects as the table owner, so isolation in the app
is enforced by the service layer above, not by Postgres policies.

---

## 3. Domain model (main tables)

| Area | Tables |
|---|---|
| Clients | `Client`, `Offer`, `IdealCustomerProfile`, `ProofPoint`, `Playbook` |
| Prospects | `Account`, `Contact`, `Signal`, `Research`, `DataProvenance` |
| Outreach | `Campaign`, `CampaignStep`, `CampaignEnrollment`, `Message`, `MessageClaim`, `Mailbox` |
| Conversations | `CallTask`, `Call`, `Meeting` |
| Compliance | `Suppression`, `AuditLog` |
| Operations | `Job`, `ConnectorSetting`, `ProviderRecord`, `UsageRecord`, `AiRun`, `WebhookEvent` |

Industry knowledge lives in data, not code: a **Playbook** holds target
titles, useful signals, messaging angles, the email sequence, approved claim
types, the call opener, discovery questions, qualification criteria and
objection handling. Four starter templates ship (trucking, machine shop,
commercial cleaning, industrial supplier); a client works from its own copy.

---

## 4. The pipeline

### Accounts and contacts
Accounts arrive by CSV import (rows grouped into accounts by website or
name + city), by hand, or from a contact-data provider. A client's existing
customers are never created as prospects. Each enriched field records where it
came from (`DataProvenance`), and provider enrichment only fills empty fields.

### Scoring (`services/scoring`)
Rule-based and explainable, scored against each active ICP of the client:

| Component | Points | From |
|---|---|---|
| Fit | 0–40 | industry, company size, location |
| Contact | 0–20 | best contact's role fit and reachability |
| Signals | 0–20 | fresh, credible signals the playbook cares about |
| Engagement | 0–10 | replies, clicks, conversations |
| Data quality | 0–10 | how much is known and verified |

Every point carries a sentence ("Logistics Manager matches a target title").
Manual overrides are kept alongside the computed score and logged. ICP edits
mark scores stale and the worker rescores.

### Research (`server/ai/research.ts`)
Reads up to eight pages of the prospect's site and asks a model why this
company might care about *this client's offer*. Facts, signals, ICP checks
and relevance angles must quote the crawled text; anything that cannot be
matched (exact → normalized → fuzzy) is discarded before it is saved.

### Drafting and verification (`server/ai/personalize.ts`, `server/verification`)
A draft is written from a **fact ledger**: verified research facts, signals,
firmographics with their provenance, and the client's *approved* proof points.
The model reports each claim it made; every claim is then checked
independently — is it supported by its source, does it contradict it, is it
stale (recency words need dated evidence under 90 days), and is its claim
type approved for automatic sending?

### Approval policy
A campaign is either **review everything** or **auto-send verified**. A draft
sends without review only if every factual claim is supported, every claim
type is approved, it scores at or above the campaign threshold (0.92 by
default), the linter found nothing blocking, and the campaign is active.
Anything else waits in the review queue with the reason. A person can approve
unverified claims only by saying how they checked them; that note is audited.

### The send gate (`services/send-gate.ts`)
The only path to the email provider: approval, suppression by address, domain
and channel, a cooling-off window across campaigns, workspace and mailbox
caps, SPF/DKIM, sending hours and the opt-out link. A blocked message records
why.

### Calls (`services/call-queue`, `services/calls.ts`)
One `CallTask` per contact, recomputed from replies, engagement, signals,
callbacks and fit. Priority is a sum of readable reasons ("Replied 'send me
more info' 2 days ago"); unanswered attempts lower it and are spaced two days
apart; closed outcomes rest a contact for 90 days. Call prep puts the opener,
why-now, research, proof points, discovery questions, objection handling and
history on one screen. Logging an outcome updates the queue, stops sequences
where appropriate, records objections, schedules callbacks, adds referrals as
contacts and books meetings.

### Meetings and analytics
Meetings record how they were booked and, afterwards, whether they were held
and what they became. Analytics counts the full funnel — accounts, contacts,
emails, replies, calls, conversations, meetings, opportunities, wins, cost —
and breaks results down by seniority, department, industry, company size,
title, signal, angle, step, campaign, playbook, caller and objection. Groups
under 20 are shown but never used for written findings. Nothing is predicted.

---

## 5. Connectors

| Capability | Implemented | Planned (interface only) |
|---|---|---|
| Research source | Company website crawler | — |
| Company / contact data, email finding | Apollo | — |
| Email verification | — | Hunter, ZeroBounce |
| Email sending | Resend (incl. SPF/DKIM status) | Gmail, Outlook |
| AI | Anthropic, OpenAI fallback | — |
| Calendar, phone, CRM | — | Google/Microsoft, Twilio, HubSpot, Salesforce |

A connector is usable only when implemented, its environment variables are
set, and the workspace has not turned it off. Several providers for one
capability run in priority order. Paid lookups are stored as `ProviderRecord`
and reused until they expire. Every model call, provider lookup and email
records a `UsageRecord` cost so cost per meeting is measurable.

---

## 6. Compliance

`Suppression` entries record the value (email, domain or phone), the channel
(all, email, phone), the reason, the source (unsubscribe link, one-click,
reply, bounce, complaint, call outcome, manual, import) and when. Opt-outs,
bounces, complaints and do-not-call requests cannot be removed in the app.
Unsubscribe links use signed tokens; RFC 8058 one-click is supported. Outreach
history is soft-deleted only, so the evidence survives.

---

## 7. Running it

See `SETUP.md`. In short:

```bash
cp .env.example .env
docker compose up -d db
npm install
npx prisma migrate deploy
npm run db:seed                 # optional: SEED_DEMO_WORKSPACE=<slug> for example clients
npm run dev                     # app on :3000
npm run worker                  # background work
```

Checks: `npm run typecheck`, `npm run lint`, `npm test`.

---

## 8. Known gaps

- **Calendar, phone and CRM connectors** are interfaces only. Meetings are
  booked in Relay and the caller sends the invite from their own calendar.
- **Email verification providers** are not implemented; imported emails keep
  whatever verification status the source gave them.
- **Discovery** is by import, manual entry or Apollo — there is no crawler
  that finds companies from scratch, by design.
- **Apollo** request and response shapes follow its public documentation but
  have not been exercised against a live account in this repository.
- **Legacy agency tools** (solution library, proposals, demo sites) remain
  viewable; proposal generation depended on the old research output and is
  retired.
