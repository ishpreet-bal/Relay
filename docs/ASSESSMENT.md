# Relay — architecture assessment and evolution plan

Written 2026-10-06, before the repositioning from "research-first cold email
for AI automation agencies" to "outbound sales operating system for
traditional B2B small businesses". Everything below is from reading the code,
not the README; where the two disagree, the code is what is described.

---

## 1. What exists today

**Shape.** One Next.js 15 (App Router) deployable with tRPC, Prisma on
Postgres (Supabase), Clerk for identity, a separate long-running Node worker
(`src/server/worker.ts`) that polls Postgres with `FOR UPDATE SKIP LOCKED`.
~6k lines of TypeScript. Typecheck, lint and 9 unit tests pass.

| Area | State | Notes |
|---|---|---|
| Tenancy | `Organization` = Clerk org = tenant; every table carries `organizationId` | Enforced only in the application layer (see risks) |
| Auth / RBAC | Clerk session → `Membership` row → role → explicit permission strings (`lib/rbac.ts`), declared per tRPC procedure | Good pattern; roles are agency-shaped (OWNER/ADMIN/OPERATOR/ANALYST/VIEWER) |
| Lead model | `Lead` is really a company; `Contact` hangs off it | Conflates account lifecycle with research progress (`RESEARCHING`, `DRAFTED` are statuses) |
| Scoring | Transparent 6-signal rule score, breakdown stored and shown | Weights are hard-coded for "AI automation agency fit", not relative to a client's ICP |
| Research | Polite 8-page crawler → model → **grounding verifier** (exact / normalized / fuzzy quote match) → unverified claims deleted | The best part of the codebase. Prompt is automation-agency specific (pain points, ROI hours) |
| Personalization | Fact ledger built only from verified research; two tiers (VERIFIED / CONTEXTUAL); linter blocks unsupported specifics and implied familiarity | Second-best part. Prompts are agency specific |
| Send gate | Single choke point: approval, suppression (address + domain), 25-day cooling-off, org/hour/mailbox caps, SPF/DKIM, opt-out link | Solid. Hard-codes "a human approved every message" |
| Campaigns | Steps with delays, send window in org timezone (DST-safe), enrollment per lead, reply/bounce stop conditions | Not linked to any ICP, offer or client |
| Webhooks | Clerk, Resend (delivery + inbound), Stripe — all signature-verified and idempotent via `WebhookEvent` | Good |
| Suppression | Email/domain, cancels in-flight work, bounces/complaints irremovable | No phone / do-not-call, no client scope, no source |
| CRM | `Activity` timeline, `Task`, `Meeting` (modelled, never written) | No calls, no call outcomes |
| Analytics | Pipeline, outreach rates, matured-cohort conversion, revenue, tier A/B z-test guardrail | Vanity-adjacent; no funnel beyond email |
| AI cost | Every model call logged to `AiRun` with tokens and cost; monthly budget enforced before calls | Good foundation for unit economics |
| Billing | Stripe subscription for the workspace, webhook-synced plan | Works; plan limits defined but `assertWithinPlan` is never called |
| Agency extras | Solution template library, proposals priced from a rate card + PDF, prospect demo microsites | Working, but specific to selling automation projects |

## 2. What to preserve

- **The grounding verifier** (`ai/grounding.ts`) and the principle that a claim
  without verified evidence never reaches a draft. It generalizes directly to
  signals and claim-level verification.
- **The fact-ledger personalization pattern and the draft linter.** Extend
  them with claim types and a verification score; do not replace them.
- **The send gate as the only path to the mail provider.** Auto-send changes
  *who* approves a message, not whether the gate runs.
- **Explicit permission strings declared on each procedure**, audit logging,
  webhook idempotency, DST-safe send windows, the `SKIP LOCKED` worker,
  `AiRun` cost logging, and the budget ceiling.
- **The design system** (tokens in `globals.css`, `card`/`btn`/`input`
  primitives, tabular numerals, the segmented score meter).

## 3. What to refactor

| Today | Becomes | Why |
|---|---|---|
| `Lead` | `Account` (table rename, data kept) scoped to a `Client` | The product separates companies from people; one company can be a prospect for two clients without sharing a pipeline |
| `LeadStatus` (13 states mixing research progress and pipeline) | `AccountStatus`: DISCOVERED → ENRICHED → QUALIFIED → ACTIVE_OUTREACH → ENGAGED → CALLING → MEETING_BOOKED → WON / LOST / DISQUALIFIED | Research progress already lives on `Research.status` |
| Agency-fit score | ICP-relative score: Fit 40 / Contact 20 / Signals 20 / Engagement 10 / Data 10, every point with a reason | The score must mean "fit for *this client's* ICP" |
| "Every message is manually approved" | Approval policy per campaign: auto-approve messages whose verification score clears a threshold and whose factual claims are all of approved types; everything else goes to review | Manual approval of every email does not scale |
| Research prompt about automation pain points | Offer-aware research: facts, typed signals and relevance to the client's offer, every one quote-verified | The research question is now "why would this account care about what our client sells?" |
| Agency roles | SUPER_ADMIN, RELAY_ADMIN, OPERATOR, ANALYST, CALLER, CLIENT_ADMIN, CLIENT_MEMBER, with a client scope | Three parties use the system: Relay staff, callers, clients |
| Enrollment per lead | Enrollment per contact; a reply from anyone at the account stops the account | Multi-threading accounts |

## 4. Data model changes

New entities (all carry `organizationId`; client-owned ones carry `clientId`):

- **Client** — the business Relay sells for; **Offer**, **IdealCustomerProfile**
  (company criteria, contact criteria, preferred signals), **ProofPoint**
  (case studies, testimonials, customers — the only "sender" claims a draft may make).
- **Playbook** — reusable, admin-configurable approach (targets, titles,
  signals, approved claim types, sequence template, call script, objection
  handling). Org-level templates plus client copies. Seeded with trucking,
  machine shop, commercial cleaning and industrial supplier examples — as rows,
  not code.
- **Signal** — typed trigger (HIRING, EXPANSION, NEW_LOCATION, …) with source
  URL, verbatim quote, event date, confidence, verification status.
- **Call** (with `CallOutcome` and `ObjectionType` enums), **CallTask** (the
  materialized, prioritized queue item with its "why call now" reasons).
- **Meeting** (extended) — scheduling status separate from outcome
  (qualified opportunity / won / lost), estimated and actual deal value.
- **MessageClaim** — each factual sentence in a draft, its claim type, the
  evidence it rests on, support score, freshness, status.
- **ProviderRecord** — every external data request: provider, operation,
  external id, request/response, confidence, cost, fetched/expires — doubles as
  the paid-enrichment cache. **DataProvenance** — field-level source of truth
  ("email came from provider X on date Y, status VERIFIED").
- **ConnectorSetting** — per-provider enablement and priority (fallback chains).
- **Job** — generic background job with QUEUED/RUNNING/COMPLETED/FAILED/RETRYING.
- **UsageRecord** — cost per enrichment/AI call/email/lookup, attributable to
  client, campaign and provider.
- Suppression gains channel (email/phone/all), phone scope, optional client
  scope, and a source. Contacts gain do-not-email / do-not-call flags,
  consent basis, phone fields, seniority/department, provenance.
- Messages gain verification status/score, approval source (human or
  policy), and learning fields (variant, CTA, sequence position, score at send,
  reply classification).

Existing data is migrated in place: each organization with data gets a house
client that owns its existing leads, campaigns and meetings.

## 5. Missing features (in priority order)

1. Client, offer, ICP, playbook configuration and onboarding.
2. Account/contact separation with provenance and ICP-relative scoring.
3. Human call queue, call preparation, outcome capture, callbacks, meetings.
4. Verification statuses and policy-based auto-send.
5. Client portal (results, meetings, campaign performance, settings).
6. Full-funnel analytics including calls, meetings, deals and cost per meeting.
7. Connector framework and the first real providers.
8. Admin operations views: review queue across clients, jobs, connectors, costs.

## 6. Technical risks found during inspection

**Fixed as part of this work:**

- **Unsubscribe links recorded the wrong address.** The signed token payload
  is split on `.`, so `jane.doe@acme.com` was suppressed as `jane`. The person
  who opted out would keep receiving mail. (compliance, critical)
- **RFC 8058 one-click unsubscribe was unreachable.** `List-Unsubscribe-Post`
  pointed at `/u/:token` (a page), while the POST handler lived at
  `/api/Unsubscribe/:token` (wrong case) behind authentication.
- **Inbound replies could attach to another tenant.** The fallback match
  looked up the sender address across *all* organizations.
- **New Clerk members became OPERATOR by default** (could approve and send),
  and nobody could ever become OWNER, so billing was unreachable.
- Sidebar linked to a non-existent `/drafts` route.

**Documented, not yet fixed:**

- **There is no row-level security.** `ARCHITECTURE.md` describes RLS policies
  and `withTenant()`; no migration creates a policy and nothing calls
  `withTenant()`. Isolation rests entirely on application-layer filters. This
  work makes those filters structural (scoped services and procedures) and
  enables RLS with no policies on every table, which closes the Supabase Data
  API (PostgREST) path for the `anon`/`authenticated` roles without affecting
  the Prisma connection (table owner). Full per-tenant RLS policies remain a
  hardening phase.
- `assertWithinPlan` is defined but never enforced.
- `claim-linter.ts` and `industry-context.ts` are unused duplicates of logic in
  `lint.ts` / `personalize.ts`.
- The worker's sequencer sleeps `minMinutesBetweenSends` minutes inside the
  loop, blocking all other organizations while it waits.
- Opens are unreliable (Apple Mail privacy) and are used only as a weak
  engagement input, never as a success metric.

## 7. Implementation phases

Each phase leaves the build, lint, typecheck and tests green and is committed
separately.

| Phase | Scope | Status |
|---|---|---|
| 0 | Critical fixes above; this assessment | this change |
| 1 | Core domain schema and migration; role model; client scoping | this change |
| 2 | Accounts and contacts (list, detail, create, import), scoring, provider interfaces, provenance | this change |
| 3 | Offer-aware research, signals, claim verification, review statuses | this change |
| 4 | ICP-driven campaigns, contact-level enrollment, approval policy | this change |
| 5 | Call queue, call prep, outcomes, callbacks, meetings | this change |
| 6 | Client portal | this change |
| 7 | Funnel analytics with breakdowns | this change |
| 8 | Real connectors (contact data, email verification, calendar, phone, CRM) added one at a time as credentials become available | interfaces only |

See `ARCHITECTURE.md` for the resulting architecture.
