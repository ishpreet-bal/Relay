# Relay platform plan — Intelligence and Studio

Written 2026-10-21 from the code on branch `claude/busy-noether-wkwta7`, in
response to two briefs: the lead-intelligence platform brief and its
extension (scalable research, Studio, recurring revenue). The briefs call the
product "Foundry"; the product is named **Relay** everywhere in code and UI. Its two systems are **Relay Intelligence** (discovery, research, qualification, outreach) and **Relay Studio** (custom automation applications, reusable solutions, deployment, recurring client management). Internal identifiers that predate the rename (the `foundry_*` Stripe price lookup keys, the organization slug, the Supabase project name) are left as they are so nothing that depends on them breaks.

This document is the running architecture review and checklist. Each phase
section is updated when the phase lands; nothing is marked done without a
test that exercised it.

---

## 1. Architecture review (brief 2, part 21)

### 1.1 What is implemented and working

| Area | State | Evidence |
|---|---|---|
| Identity, orgs, roles | Clerk orgs → `Membership` → role → explicit permissions (`lib/rbac.ts`), checked on every tRPC procedure | `scope.test.ts`; production deploy with one owner |
| Tenancy | `Organization` (the agency) → `Client` (a business Relay works for or with). Every client-owned row carries `clientId`; `AccessContext` + `clientFilter` scope every query; client users see only their client. RLS is enabled with no policies on every table, which closes the Supabase REST API; the app connects as the database owner | `scope.test.ts`, migration SQL |
| Company records | Accounts with normalized identity (name, canonical domain, email domains, provider ids), field-level provenance with retention dates, CSV import, manual entry, saved views, CSV export | `normalize.test.ts`, `match.test.ts`, `export-csv.test.ts` |
| Deduplication | Evidence-scored matching (id, domain, email domain, phone, name+address/city); strong matches enrich empty fields only; borderline ones are created and queued for review; per-company advisory lock against concurrent inserts; merge moves every related record | unit tests + discovery DB test |
| Discovery | Profiles (categories, keywords, area, size, sources, schedule, monthly budget), runs that advance in resumable steps, Google Places (find only, details from the business's own site) and Apollo company search adapters, per-result outcomes and reasons, usage records marked as estimates | `run.int.test.ts` (5 cases against Postgres), adapter tests |
| Research (stage-3 style) | 8-page polite crawl → model → grounding verifier; unverified claims are dropped; facts carry citations; relevance angles are labelled inferences | existing tests and production code |
| Outreach | Fact-ledger drafting, linter, verification, single send gate (approval, suppression, cooling-off, caps, SPF/DKIM, unsubscribe), CASL-oriented consent fields on contacts | existing tests |
| Calling, meetings, CRM | Call queue, call prep, outcomes, meetings, activity timeline, client portal | existing code |
| Background work | Postgres job table claimed with `FOR UPDATE SKIP LOCKED`, retries with exponential backoff, stale-lock release, a long-running worker, a cron tick for deployments without one, and page-driven steps for discovery | `run.int.test.ts` resume case |
| Costs | `UsageRecord` per external call (provider, type, cost in millicents, estimate flag), `AiRun` per model call, AI monthly budget guard, per-profile discovery budgets enforced server-side | discovery budget test, `pricing.test.ts` |
| Billing (agency's own plan) | Stripe subscription for the workspace, verified idempotent webhooks | existing code |

### 1.2 What is only UI, legacy, or partial

- **Solution library, Demo sites, Proposals** ("Legacy tools" in the
  sidebar) work, but stand apart from the account pipeline: a demo is a
  data-driven page from `SolutionTemplate.spec`, a proposal is generated for an
  account, and neither is linked to research findings, opportunities or a
  customer application. They are reused, not rebuilt, in Studio (section 4).
- **`Research.painPoints / opportunities / estimatedHoursSaved`** are legacy
  columns read by proposals; current research writes facts and relevance.
- **No Studio at all**: no customer applications, templates with versions,
  module manifests, integration connections, workflow executions, customer
  subscriptions or outcome measurement.
- **No staged qualification**: every account is equal until someone queues
  research; there is no screening score, freshness policy, research version
  history or event-driven reconsideration.
- **Jobs have one queue**: no per-queue concurrency, provider throttling,
  circuit breakers, dead-letter state, attempt history, or pause/resume. The
  System page lists jobs but cannot inspect attempts or pause a queue.

### 1.3 Background job infrastructure: decision

The brief allows Inngest, Supabase Queues, or a compatible existing system.
**Decision: extend the existing Postgres queue.** It already gives durable
persistence, transactional claims, retries with backoff and crash recovery,
runs on the database we already pay for, needs no new vendor or SDK, and
lets a job's effects and its completion commit in one transaction. Inngest
would add a second source of truth for job state and a per-step bill;
Supabase Queues (pgmq) would still need our own workers and offers nothing
the `Job` table lacks for this volume.

What it needs (phase B):
- **Logical queues** (`Job.queue`): discovery, normalize, screening,
  research, deep-research, enrichment, verification, scoring, opportunities,
  refresh, demos, customer-workflows, billing, maintenance — each with its
  own concurrency, rate limit, timeout and pause switch (`QueueSetting`).
- **Worker groups**: `npm run worker -- --group intelligence|studio|all`.
  Customer workflows run in their own process with reserved concurrency, so
  prospecting can never starve a paying customer's automation. The cron tick
  never runs customer workflows.
- **Provider throttles and circuit breakers** (`ProviderThrottle`): requests
  per minute per provider, and an open breaker after repeated failures that
  pauses only that provider's jobs.
- **Attempt history** (`JobAttempt`), a **dead-letter** state for jobs that
  used up their attempts, manual retry, and **idempotency keys** unique per
  queue so a re-delivered job can't double-charge or double-create.

Delivery is at-least-once. Duplicate effects are prevented by idempotency
keys, database constraints (one account per client and domain, one result
per run and place, one identifier per client and provider id) and
transactional writes — not by the queue.

### 1.4 Database changes

Extend, don't duplicate. Existing entities cover several of the brief's names:

| Brief entity | Relay entity |
|---|---|
| tenants / tenant_memberships | `Client` + client-role `Membership` (portal users) |
| usage_records | `UsageRecord` (extended with job, queue, duration, actual cost) |
| job_queues / job_attempts | `Job.queue` + `QueueSetting`, new `JobAttempt` |
| company_signals | `Signal` (extended with event source and date) |
| research_versions | new `ResearchVersion` (immutable history; `Research` stays the current row) |
| opportunity_assessments | new `Opportunity` |
| application_templates / template_versions | new `AppTemplate` / `AppTemplateVersion` (the demo-oriented `SolutionTemplate` stays for demo pages) |
| application_modules | code registry (`studio/modules`), referenced by key and version |
| client_applications / application_configurations | new `ClientApplication` / `AppConfigVersion` |
| integration_connections | new `IntegrationConnection` (encrypted secrets) |
| workflow_definitions / workflow_executions | workflow steps live in the validated manifest; new `WorkflowExecution` |
| automation_audits | new `AutomationAssessment` |
| project_estimates | new `Project` (estimate vs actual hours and cost) |
| deployment_records | new `Deployment` |
| subscription_records | new `CustomerSubscription` (+ `Invoice` exists) |
| customer_outcomes | new `OutcomeMetric` (baseline vs measured, method stored) |
| solution_performance | derived from projects, deployments and outcomes (a view, not a table) |
| system_alerts | new `SystemAlert` |

New `Account` columns for the research funnel: `stage`, `screeningScore`,
`screeningReasons`, `promotedById`, `lastObservedAt`, `contentFingerprint`,
`researchVersion`, `nextRefreshAt`, `researchCostMillicents`. Migrations are
additive; no column is dropped or rewritten.

### 1.5 Separating Intelligence and Studio

One deployable, two module trees, shared core:

```
src/server/
  services/            shared core + Intelligence (accounts, discovery, research, scoring, outreach, calls)
  services/discovery/  Intelligence: discovery engine
  services/pipeline/   Intelligence: screening, stage gates, refresh policy, opportunities   (phase C)
  studio/              Studio: templates, modules, manifests, applications, integrations,
                       workflows, deployments, assessments, projects, subscriptions          (phases D–F)
  queues/              platform: queue settings, throttles, breakers, attempts               (phase B)
```

Isolation is at the workload level, not the code level: separate queues,
separate worker groups, reserved concurrency for customer workflows,
per-customer execution quotas, and budgets that pause optional research
without touching customer workflows. A dedicated deployment for a customer
is a deployment record pointing at another environment, provisioned and
priced deliberately — never created automatically.

### 1.6 Reused components

Access scope and RBAC; job queue and worker; connectors registry and usage
accounting; provenance; the crawler (now SSRF-guarded); grounding verifier;
ROI arithmetic (`services/roi.ts`); proposal generation; data-driven demo
renderer (`SolutionTemplate.spec`); Stripe client and webhook verification;
`ENCRYPTION_KEY` envelope for secrets; audit log.

### 1.7 External integrations needed

| Integration | Needed for | Status |
|---|---|---|
| Google Places API (New) | discovery | adapter built, unit + DB tested with stubs; **needs `GOOGLE_PLACES_API_KEY`**, not yet run against Google |
| Apollo | company search, people search, email lookup | adapters built; **needs `APOLLO_API_KEY`**, not yet run against Apollo |
| Anthropic | research, drafting, verification | live in production code; needs `ANTHROPIC_API_KEY` |
| Email verification (ZeroBounce or Hunter) | contact verification | planned connector; needs a key |
| Google Workspace / Microsoft 365 OAuth | sending from real inboxes; customer integrations | planned; needs OAuth client ids |
| Resend | transactional and campaign sending | adapter exists |
| Stripe | workspace billing (exists); customer subscriptions (phase F) | needs test-mode keys for phase F tests against Stripe |
| Worker host (Railway or Fly) | scheduled discovery more often than daily, research queue, customer workflows | not deployed |

### 1.8 Primary technical risks

1. **Vercel Hobby is for non-commercial use only** and allows cron once a
   day. A sales operation needs Pro ($20/month), which also allows
   per-minute cron and longer functions.
2. **Data licensing.** Google's terms allow storing place ids indefinitely
   and coordinates for 30 days; other Places content has no caching
   exception. Relay stores neither, building records from the businesses'
   own websites. Apollo data is stored under the Apollo subscription's terms;
   if that subscription lapses, its terms decide what must be removed.
3. **CASL.** A published business address is implied consent only when
   published by the person, without a "no solicitation" notice, and relevant
   to their role. Relay records the basis per contact; the operator must
   still review it before outreach.
4. **Untrusted web content in prompts.** Pages are quoted as data, outputs
   are schema-validated and grounded, and nothing a page says can trigger an
   action. The crawler refuses private networks.
5. **Postgres as queue at scale.** Fine for thousands of jobs a minute; the
   risk is long transactions and connection exhaustion, managed with short
   claims, per-queue concurrency and the Supabase pooler. Measured in phase B.
6. **Cost overrun** from unbounded AI research — addressed by stage gates,
   per-stage budgets enforced in the backend, and estimates shown before runs.
7. **Cross-tenant leakage** in Studio — every Studio row carries `clientId`,
   every query goes through the access scope, and phase D includes a
   two-tenant isolation test.
8. **Free Supabase projects pause after 7 days of low activity** and cap the
   database at 500 MB; production needs Pro.

### 1.9 Operating cost of the initial architecture

Prices from vendor pages as of October 2026 (some confirmed only through
search excerpts; re-check before committing). US dollars unless noted.

**Fixed, per month**

| Item | Cost | Notes |
|---|---|---|
| Vercel Pro | $20 | required for commercial use |
| Supabase Pro | $25 | 8 GB disk, no pausing |
| Worker on Railway Hobby | $5 + usage | a small mostly idle worker usually stays within the included $5 (estimate) |
| Google Workspace Business Starter | C$9.20 per user (annual) | sending inbox; 2,000 messages/day/user |
| Resend | $0 (3,000/month, 100/day) or $20 (50,000/month) | |
| Apollo (optional) | $49–$119 per seat | 2,500–6,000 credits/month |

**Variable, per unit**

| Step | Unit cost | Formula / assumption |
|---|---|---|
| Discovery via Places | ~$0.0023 per business found | $35 per 1,000 Text Search (Enterprise) requests ÷ ~15 usable results per page; the first 1,000 requests a month are free, which covers ~15,000 businesses |
| Discovery via Apollo | ~$0.0002 per business | 1 credit per page of up to 100 results; credit ≈ plan price ÷ credits |
| Website identity read | ~$0 | our compute; 2 requests per business |
| Stage 2 screening | $0 | deterministic code, no model |
| Stage 3 AI analysis | ~$0.085 per company | research on Sonnet 5: ≤24k input + ~2.5k output tokens ($2/$10 per M) + Haiku verification |
| Stage 4 deep research | ~$0.28 per prospect | deep pass (~30k in / 4k out at Opus 5.5 $4/$20 ≈ $0.20) + 2 contacts × (Apollo email 1 credit ≈ $0.024 + verification ≈ $0.017) |

**Monthly cost formula**

```
cost = fixed
     + D  × c_discover          D  = businesses discovered or refreshed this month
     + S3 × c_analysis          S3 = companies given AI analysis this month
     + S4 × (c_deep + k × (c_email + c_verify))   S4 = deep prospects, k = contacts each
     + storage(N)               N  = total stored companies (≈6 KB each with provenance; to be measured)
```

Stored records do not drive AI cost; D, S3 and S4 do, and each is capped by
budget settings. Illustrative month (not a prediction): 10,000 discovered
(≈$0 inside the Places free allowance, $23 at list price), 500 analysed
($42), 50 deep ($14) → about $56 variable + ~$60 fixed.

| Stored companies (N) | Storage | Example activity (2% analysed, 0.2% deep per month) | Variable AI + enrichment |
|---|---|---|---|
| 1,000 | ~6 MB | 20 / 2 | ~$2 |
| 10,000 | ~60 MB | 200 / 20 | ~$23 |
| 100,000 | ~600 MB (Supabase Pro) | 2,000 / 200 | ~$226 |
| 1,000,000 | ~6 GB (Pro; likely a larger compute add-on) | 20,000 / 2,000 | ~$2,260 |

Phase C adds these assumptions as editable settings and a forecast page.

### 1.10 Smallest complete implementation of the new architecture

1. Queue groups with per-queue limits, throttles, breakers, attempts, dead
   letter, pause/resume, and an operations page — proven with 1,000 queued
   tasks and injected failures (phase B).
2. Stage gates on accounts: deterministic screening score, thresholds,
   manual promotion, freshness and refresh scheduling, research versions and
   per-stage budgets (phase C).
3. Studio core: versioned templates, module registry, validated manifests,
   applications with config versions and rollback, encrypted integration
   connections, workflow executions on the isolated queue — proven with two
   synthetic tenants (phase D).
4. Opportunity → solution match → demo config → assessment → proposal →
   project → application (phase E).
5. Customer subscriptions, usage metering, Stripe test-mode adapter,
   profitability (phase F).

---

## 2. Checklist

Legend: ✅ done and tested · 🟡 built, needs credentials or a live run · ⬜ not started

### Brief 1

- ✅ Production schema for companies, contacts, provenance, discovery, duplicates, saved views
- ✅ Lead explorer: search, filters, saved views, CSV export
- ✅ Company detail with identity, profiles, branches, provenance, duplicate banner
- ✅ Manual entry and CSV import through the same matching
- ✅ Deduplication, review page, merge
- ✅ Activity tracking
- 🟡 Google Places discovery (stubbed tests pass; needs key and a live run)
- 🟡 Apollo company discovery (stubbed tests pass; needs key and a live run)
- ✅ Discovery profiles, runs, schedules, budgets, results, provenance, run monitoring
- ✅ Retention sweep for time-limited source data
- 🟡 Scheduled runs: worker every 15 min, cron daily (Hobby) — worker not deployed
- 🟡 Email verification: ZeroBounce and Hunter adapters, Verify on contacts (faked-provider tests pass; needs a key and a live run)
- 🟡 Gmail sending: OAuth connect per mailbox, Gmail API send behind the same send gate and review queue, DNS domain check (faked-Google tests pass; needs an OAuth client and a live run)
- ✅ Sales pipeline board (accounts by status) and the opportunity board
- ✅ Automation library (Studio templates) with synthetic demos tied to opportunities (phase E)
- ✅ Cost ledger budgets by category with 50/80/100% warnings (phase C)
- 🟡 Ask Relay: read-only assistant with permission-filtered tools (scripted-model tests pass; needs ANTHROPIC_API_KEY for a live run)
- ✅ Platform health alerts (stuck queues, paused providers, dead letters, failed webhooks, failing customer apps)
- ✅ Customer portal: Applications (branded dashboard, records, submit, approvals, activity)

### Brief 2

- ✅ Phase A — this review
- ✅ Phase B — queues, throttles, breakers, attempts, dead letter, ops page, 1,000-task test (see section 4)
- ✅ Phase C — staged qualification, freshness, research versions, budgets, forecasts (see section 4)
- ✅ Phase D — Studio foundation, two-tenant isolation test, Studio screens (see section 4)
- ✅ Phase E — opportunity to application, acceptance test passing (see section 4)
- ✅ Phase F — subscriptions, metering, invoices, Stripe test-mode adapter, profitability (see section 4); Stripe API calls untested without a key
- ✅ Phase G — scale validation at 100k companies, three bottlenecks found and fixed, numbers before and after (see section 4)

---

## 3. Credentials you need to supply

| Variable | Where | Used for |
|---|---|---|
| `GOOGLE_PLACES_API_KEY` | Google Cloud console → enable "Places API (New)" → API key restricted to that API | discovery |
| `APOLLO_API_KEY` (+ `APOLLO_COST_PER_CREDIT_MILLICENTS`) | Apollo → Settings → API | company search, contacts, email lookup |
| `ANTHROPIC_API_KEY` | platform.claude.com | research, drafting, verification |
| `ANTHROPIC_WORKSPACE_ID` (optional) | Claude Console → the workspace's ID. Only for an API key that isn't scoped to a workspace (Anthropic then rejects requests without it); a key created inside a workspace needs nothing extra | every AI call |
| `ZEROBOUNCE_API_KEY` or `HUNTER_API_KEY` (+ `*_COST_PER_CHECK_MILLICENTS`) | vendor dashboard | email verification before sending |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud → APIs & Services → enable Gmail API → OAuth client (Web), authorised redirect URI `https://<your domain>/api/oauth/google/callback`. `gmail.send` is a sensitive scope: unverified apps work for test users you add; Google's app verification is needed beyond that. The consent screen's home page is `/about` and its privacy policy is `/privacy` (both public) | sending from Gmail / Workspace mailboxes |
| `PRIVACY_CONTACT_EMAIL` (optional) | the address people write to for access, correction or deletion requests | shown on the public privacy policy; without it the page says to reply to any email received |
| `SITE_URL` (optional) | the public website's own address once it has a domain, e.g. `https://example.ca` | canonical links, the sitemap and share previews; defaults to `APP_URL` |
| `SITE_EMAIL_DOMAIN` (optional) | the company's email domain once the Google Workspace mailboxes exist, e.g. `example.ca` | shows hello@, sales@ and support@ on the website; without it the site offers the inquiry form only |
| `INQUIRY_CLIENT_ID` (optional) | a client's id | where website inquiries land; defaults to the workspace's one internal client (Relay) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` (test mode first) | Stripe dashboard → Developers; webhook endpoint `/api/webhooks/stripe` with customer.subscription.* and invoice.* events | customer subscriptions (and the workspace plan) |
| `CUSTOMER_BILLING_LIVE=enabled` | only when you decide to charge real customers | allows a live Stripe key to create customer charges |
| Worker host | Railway or Fly | a process running `npm run worker` with the same env |

Set them in Vercel → Project → Settings → Environment Variables (and the
worker's environment), then use each connector's check on the Connectors page.

Preview deployments of feature branches currently fail at `prisma migrate
deploy` because the database variables are set for Production only. That is
the safe state (a preview never migrates the production database). To get
working previews, give the Preview environment its own database (a Supabase
branch), never the production one.

---

## 4. Phase reports

### Phase B — scalable job infrastructure (2026-10-22)

**Built**
- 15 logical queues (`server/queues/registry.ts`) in three worker groups,
  each with concurrency, per-workspace share, starts per minute, timeout,
  attempts and backoff base; operator overrides in `QueueSetting`; pause and
  resume per queue.
- Claims run under a per-queue advisory lock, so limits hold across any
  number of workers. Timed-out work that is still running keeps its slot
  until it settles (Node can't cancel it).
- `JobAttempt` history for every execution (succeeded, failed, timed out,
  continued, abandoned), dead letters (`deadLetteredAt`, `failureKind`),
  retry of one job or every dead letter in a queue, idempotency keys unique
  per queue, batch enqueue.
- `ProviderThrottle`: per-provider requests per minute and a circuit breaker
  (threshold, cooldown doubling to 30 min, trial request). Discovery,
  enrichment chains and Anthropic calls go through it; a paused provider
  defers only its own jobs, without using up their attempts, and enrichment
  chains fall through to the next provider.
- Usage records carry the job that incurred them (via async context), the
  operation and duration.
- Workers run a group (`npm run worker:studio`, `worker:intelligence`, or
  all) and report heartbeats; the cron tick runs only serverless-safe queues.
- System page: queues (depth, held, running/limit, oldest, done, average
  time, error rate, dead letters, cost), provider limits and breakers,
  workers, and a job inspector with attempts, payload, result and cost.

**Migrations**: `20261022000000_queues_and_throttles` (additive; backfills
each existing job's queue and marks existing failures as dead letters).

**Tests** (`src/server/queues/__tests__/queue.int.test.ts`, real Postgres)
- 1,000 synthetic tasks, 4 workers, queue concurrency 8, with injected
  failures before writes (100), after writes (40), attempts beyond the 2 s
  timeout (5), permanent failures (4), a worker that claimed 8 and died, a
  duplicate enqueue of all 1,000, and 100 company pairs written by two tasks.
  Result, three consecutive runs on this machine: 14.9–18.0 s (56–67 tasks/s),
  never more than 8 concurrent, 996 completed and 4 dead letters, 1,040
  writes producing exactly 897 company records, every attempt recorded.
- Per-workspace share, pause, per-minute rate, provider budget deferral, and
  breaker open → other work unaffected → trial success closes it.

**Bugs the load test found and fixed**
- Matching could miss the exact match when many companies share a first
  word (the candidate scan was capped across all keys). Strong keys are now
  looked up separately, and an account holding the domain always matches.
- A timed-out attempt released its slot while its work kept running.

**Limits of what was measured**: one machine, local Postgres, synthetic
handlers doing one account write each. Throughput against Supabase through
its pooler, with real provider latency, is not measured yet (phase G). The
operations UI was type-checked and built but not exercised in a browser
(sign-in needs Clerk credentials).

**New dependencies**: none.

### Phase C — automation intelligence (2026-10-22)

**Built**
- Funnel stages on every account (`DISCOVERED → SCREENED_OUT | QUALIFIED →
  ANALYZED → DEEP_RESEARCHED`) with opportunity tiers (Hot, Warm,
  Exploratory, Low, Suppressed). Nothing is deleted for scoring low.
- Stage 2 screening (`services/pipeline/screening.ts`), deterministic and
  explained point by point: ICP fit (reusing the existing account score),
  business events in the last six months, an active website, operational
  scale, completeness, reachability. Runs in batches of 200 over every
  account that is new, changed, or has a new signal.
- Gates: configurable thresholds, daily caps for automatic analysis and deep
  research, budget categories checked before queuing and again before
  spending, and manual promotion that sticks until unpinned.
- Stage 3 is the existing grounded research, now run through the research
  queue with a trigger; each completed run is kept as an immutable
  `ResearchVersion` with verified facts, AI hypotheses and unknowns apart,
  the content fingerprint and the fields that changed.
- Stage 4 deep research (`services/pipeline/deep.ts`) on `claude-opus-5-5`
  with structured output (JSON schema) and the server-side refusal fallback:
  it sees only stage-3 verified facts, must cite them for every claim, and
  anything citing a fact that doesn't exist is dropped and counted. ROI is a
  low/high scenario computed by the existing ROI engine from stated
  assumptions. Decision makers come only from a connected, permitted
  provider.
- Freshness: refresh schedules by tier; a refresh re-reads one page and
  compares fingerprints; only website-sourced fields are updated (a person's
  value is kept and the difference noted); only a material change to a
  hot/warm account with research older than 30 days queues new analysis.
- Category budgets (discovery, analysis, deep, enrichment, outreach, global)
  enforced in discovery steps, enrichment chains, research and deep
  research; alerts at 50/80/100% (`SystemAlert`, one open alert per key).
- Cost forecast (`services/pipeline/forecast.ts`) for 1k, 10k, 100k and 1M
  stored companies and any custom scenario, with editable assumptions.
- Research funnel page: stored / discovered / refreshed / analysed / deep
  counts kept apart, stage drill-down with reasons and actions, budgets,
  alerts, settings and forecast. Account page: stage, tier, reasons,
  actions and version history.

**Also fixed**: AI requests for current models (temperature and prefill
400 on `claude-sonnet-5`, the research model); AI price table.

**Migrations**: `20261022010000_research_pipeline` (additive; already
researched accounts start at ANALYZED).

**Tests**: 16 unit tests (screening, stage rules, refresh schedule, deep
output validation, ROI scenarios, forecasts) and a 5-case acceptance test
on Postgres taking three companies through the funnel with websites and
the model stubbed. It shows the poor fit kept as screened out with its
reasons, the daily cap holding back the second good fit, grounding dropping
an unsupported fact, an invented reference dropped in deep research,
manual promotion passing the cap but not the budget (with a critical alert),
and refresh keeping a person's value.

**Limits**: no live model call has been made (no `ANTHROPIC_API_KEY` in this
environment), so prompt quality and real token costs are unmeasured; the
deep-research cost in the forecast is an estimate. The funnel UI was built
and type-checked, not used in a browser.

### Phase D — Studio foundation (2026-10-22)

**Built**
- Modules (`server/studio/modules.ts`): records, business rules,
  notifications, approvals, reporting, scheduling and integrations, each
  tested code identified by key and major version, contributing typed steps
  (validate, create/update/find record, condition, transform, notify,
  approval, aggregate, schedule reminders, HTTP request).
- Manifests (`server/studio/manifest.ts`): an application is data, never
  code — branding, terminology, roles, collections and fields, rule values,
  workflows, integrations, dashboard widgets and limits. Validation checks
  shape, modules and versions, step types and their config, every reference
  (collections, fields, rules, roles, earlier steps, integrations), that each
  connection belongs to this customer, cron expressions and time zones, and
  platform limits. Customer overrides are a separate, narrower schema.
- Four starter templates (manufacturing quality claims, construction quote
  requests, logistics shipment updates, local-services bookings), each with
  synthetic test input for every workflow and estimates marked as estimates.
- Versioning: published template versions are immutable; built-ins are
  shared and can't take versions from one workspace (they are copied
  first); configuration versions are immutable; upgrades keep the
  customer's overrides, report breaking changes and never deploy by
  themselves; rollback redeploys the previous configuration.
- Production gate: a configuration reaches production only after every
  workflow has passed a test run in that exact version. Test runs use
  synthetic input, write only test records, call only sandbox connections
  and dry-run production ones.
- Execution on the `customer-workflows` queue with a per-application daily
  quota and concurrency, so one customer's volume or failure doesn't touch
  another's. Steps that write commit the write and the run checkpoint in one
  transaction, so a retry resumes without writing twice. Approvals pause a
  run until someone with access to that customer decides.
- Triggers: manual, webhook (`POST /api/studio/hooks/{app}/{workflow}`,
  per-application bearer token stored as a hash, 64 KB JSON, an
  Idempotency-Key starts one run), schedules in an IANA time zone, and
  record-created (from a durable pending list, keyed per record;
  record-triggered runs don't trigger further runs, so no loops).
- Connections: https only, public addresses only (SSRF guard on every
  redirect), secrets AES-256-GCM encrypted with `ENCRYPTION_KEY`, never
  returned to a browser, used only by that customer's runs.
- Permissions: `studio:read/run` (including customer users, scoped to their
  own customer), `studio:write` (operators), `studio:deploy` (production,
  rollback, resume, archive) and `studio:secrets` (connections, webhook
  tokens; also customer admins for their own systems). Every change is
  audited (secrets never logged).
- Screens: `/studio` (applications by customer, templates, connections,
  modules) and `/studio/apps/[id]` (path to production, configuration editor
  with live validation, workflows and webhook token, runs with step logs and
  approvals, records, deployments, rollback, pause/resume, upgrades). The
  page works queued runs forward while open, so tests finish on deployments
  without a worker.

**Migrations**: `20261022020000_studio_foundation`,
`20261022030000_studio_triggers` (both additive: new tables plus two
nullable columns).

**Tests**
- Acceptance (`studio.int.test.ts`, real Postgres): two synthetic customers
  on one template with different branding, rules, limits and connections.
  Shows: another customer's connection rejected; a sandbox call made with the
  customer's own secret and the secret never returned; production blocked
  until every workflow passed; the same claim escalated for one customer
  (threshold 10) and not the other (200); records, runs, approvals and
  listings invisible across customers; one customer's failure and daily
  limit not affecting the other; rollback; a minor template upgrade keeping
  overrides with no breaking changes and no automatic deploy.
- Runtime (`studio-runtime.int.test.ts`): built-ins can't be versioned by a
  workspace, copies can; record-triggered runs fire once per record and
  don't loop; a run whose external call failed once resumes and writes its
  record once (two calls, one record, two attempts); the webhook route
  answers 401/404/400/413 correctly, the same Idempotency-Key gives the same
  run, and a rotated token replaces the old one.
- Unit (`studio.test.ts`, 15): every built-in template validates; code,
  unknown modules and step types are refused; reference checks; module,
  cron and time-zone checks; connection ownership; overrides; breaking
  changes; value resolution and text rendering evaluate nothing; record
  validation; cron in UTC and America/Toronto; encryption round-trip, fresh
  IV and tamper detection.
- Browser check: the Studio screens were run against a local server with a
  temporary sign-in stub (not committed) and synthetic data: list, templates,
  connections, application page, run dialog, approval, production deploy and
  the configuration editor. It found a real bug (fixed and covered by a
  test): approving a run queued a new job but left the run pointing at the
  finished one, so a page could not resume it.
- Totals after this phase: 27 files, 209 tests, all passing; typecheck,
  lint and production build clean.

**Limits**
- Customer users can call the Studio API for their own customer, but the
  customer-facing screens (their branded app, approvals, records) are not
  built yet; customer users are sent to the portal, which doesn't show
  Studio applications.
- Roles inside a manifest (e.g. quality manager) aren't mapped to individual
  customer users yet; any user with `studio:run` on that customer can
  approve.
- Only REST API connections; Google Workspace, Microsoft 365, database and
  file-import connections are not built. No AI step module yet.
- Production runs need the worker (`npm run worker:studio`). The daily cron
  doesn't run customer workflows, and a page only drives runs while it's
  open.
- "Dedicated deployment" is a recorded field; nothing provisions one (by
  design, per the brief).
- No live call to a real customer system has been made; external calls in
  tests are stubbed.

**New dependencies**: none.

**Next**: phase E (solution matching and reusability classification,
assessments, personalised demos on synthetic data, proposals, projects with
estimate vs actual), then phase F (subscriptions, metering, Stripe test
mode, profitability).

### Phase E — opportunity to application (2026-10-22)

**Built**
- Opportunities (`services/delivery/opportunities.ts`) come from the latest
  deep research (one per researched opportunity that cites a verified fact,
  idempotent per research version) or are added by hand.
- Solution matching (`services/delivery/matching.ts`) against the Studio
  template catalogue: overlap between the words describing the work and each
  template's use cases, name and description, plus an industry bonus.
  Reuse class: exact, configuration, moderate or custom, with the reasons
  (matched terms, industry, barriers). Not feasible is only ever a person's
  call. Effort: from scratch ≈ 2.5 × the template's build estimate; reuse
  needs 15/35/65/100% of that; with three or more closed projects on the
  template, the estimate is scaled by their actual ÷ estimated hours.
  A person can override the template and class with a reason.
- Assessment (`services/delivery/assessment.ts`): tasks per week, minutes per
  task, automatable share (low–high), loaded hourly cost, optional error rate
  and cost, each with its source (stated by the prospect, observed, research
  estimate, our assumption). The projection is a low/high scenario with
  payback against the price, labelled PROJECTED, and it names unconfirmed
  inputs. Research's hours seed an assessment whose inputs are all marked
  unconfirmed.
- Review gate: only a qualified opportunity (assessed, not "not feasible")
  gets a demo or a proposal.
- Demos: the matched template as a sandbox app on a per-workspace demo
  client (kind DEMO, hidden from client lists and never billed), branded with
  the company's public name, filled by test runs on synthetic variations of
  each workflow's test input.
- Proposals: priced from the rate card (hours × day rate ÷ 8, discovery fee,
  the template's monthly price); the projection is shown as a scenario with
  its inputs. An opportunity's proposal must be approved internally before it
  can be sent or accepted. Acceptance is the share-link signature or a
  recorded authorisation (who, and the evidence).
- Conversion (admin): the customer tenant, a delivery project carrying the
  estimate and price, and a draft application. Production still goes through
  Studio's test gate.
- Delivery projects: time entries by category, estimate against actual and
  cost at the internal hourly rate; closing a project feeds calibration.
- Deep research now matches against the Studio catalogue.
- Screens: Opportunities board, opportunity page (evidence, match, reasons,
  estimates, assessment, decision, demo, proposal, customer), account panel,
  Projects.

**Migration**: `20261022040000_opportunity_to_application` (additive: four
tables, `Client.kind`, `Organization.internalHourlyCostCents`, four nullable
proposal columns).

**Tests**: acceptance (`delivery/__tests__/opportunity.int.test.ts`, six
cases on Postgres): research → two opportunities (one exact template match,
one custom), idempotent sync; qualifying refused without an assessment; the
projection labelled and naming its unconfirmed input; no demo for a custom
build; a demo in the DEMO client with only synthetic test records; proposal
priced by arithmetic; acceptance refused before approval (service and share
link); conversion creating customer, project and a draft app (idempotent);
production deploy refused until tests pass, then allowed; the first
production record lands in the customer's own tenant; time logged against
the estimate; calibration kicks in at three closed projects. Seven unit
tests (stemming, scoring, classes, effort, projection, input validation,
synthetic variations). Browser check of the whole flow (board, review,
demo, approval, acceptance, conversion, time logging) passed after one fix
(an approval could report an error after it had saved).

**Limits**: matching is lexical; synonyms the templates don't use won't
match (a person can override). Effort factors are starting assumptions
until real projects calibrate them. No live model call was made in this
environment.

### Phase F — billing and business operations (2026-10-22)

**Built**
- Customer subscriptions (`services/customer-billing/`): setup fee, monthly
  fee, runs included, price per extra run (thousandths of a cent). Drafts
  until the workspace owner authorises them; the demo client is never billed.
- Ledger provider: Relay issues the setup invoice at authorisation, a period
  invoice in arrears at each period end (monthly fee plus runs above the
  included amount), and a prorated final invoice on immediate cancellation;
  each once (idempotency key), numbered INV-YYYY-NNNN; payment is recorded by
  hand; open invoices can be voided.
- Stripe provider (`stripe-adapter.ts`): customer, product and an emailed
  monthly subscription (send_invoice, net 14) with the setup fee on the first
  invoice, all with idempotency keys; runs above the included amount are
  added as an invoice item to the next invoice; cancel now or at period end.
  A live key is refused unless `CUSTOMER_BILLING_LIVE=enabled`.
- Webhooks: the existing Stripe endpoint (signature verified, each event
  processed once) routes customer-subscription events by metadata, mirrors
  Stripe invoices and subscription status, marks past due on failed payment,
  and does not apply a live-mode event while live billing is off (it raises
  a critical alert instead).
- Metering: succeeded production runs from the platform's own records, per
  period (`MeteredUsage`). Failed and test runs are not billed.
- The daily maintenance pass closes ended periods (and catches up if several
  have passed).
- Reports: MRR and ARR, MRR history, invoiced, collected, outstanding,
  overdue, churned subscriptions; per-customer margin for a month (revenue
  minus delivery time at the internal hourly cost and the template's
  infrastructure estimate). Provider costs and research spent to win the
  customer are shown in their own currency, not converted.
- Billing page (owner only).

**Migration**: `20261022050000_customer_billing` (additive: three tables).

**Tests**: acceptance (`customer-billing/__tests__/billing.int.test.ts`, six
cases on Postgres, test mode, no live charges): no billing for the demo
client; nothing invoiced before authorisation; setup invoice; 130 succeeded
production runs metered (10 failed, 20 test and another customer's 50 not
counted); one period invoice of $450 + 30 × $0.05; a second cycle adds
nothing; paid once; immediate cancellation prorated 15 of 31 days; cancel at
period end takes effect at the next close; MRR, ARR, invoiced, collected,
outstanding, churn, MRR history and a customer's margin match hand
calculations; live keys refused without the switch; webhooks: a forged
signature rejected, a signed event applied once (replay deduplicated) and
the invoice mirrored as paid, a live-mode event not applied and alerted.
Four unit tests on invoice arithmetic and on the exact requests sent to
Stripe (idempotency keys, metadata, collection method, setup item, overage).
Browser check: subscription drafted from a project, authorised, setup
invoice issued, MRR shown.

**Limits**: no call to the Stripe API itself has been made (no key here);
the adapter's requests are unit-tested against a fake client, and webhook
handling against locally signed events. Taxes are not calculated (0). One
currency per subscription; reports group by currency.

### Phase G — scale validation (2026-10-22)

**Method**: `scripts/scale/validate.ts` creates a throwaway workspace with
synthetic data, measures, and deletes it. It refuses non-local databases
unless `SCALE_ALLOW=1`. Same parameters both runs: 100,000 companies,
20,000 screened, 10,000 queue tasks (concurrency 16, 4 workers), 50 customer
applications × 40 runs (4 workers). Machine: 4 vCPU Xeon 2.8 GHz, 16 GB,
local Postgres 16, Node 22. Results are in `docs/scale/`.

| Measure | Before | After fixes |
|---|---|---|
| Bulk load | 4,048 companies/s | 3,815/s |
| First-time scoring (4 workers) | (inside screening) | 177 accounts/s |
| Screening, already-scored accounts (2 jobs per workspace) | 57/s *including first-time scoring* | 2,268/s |
| Funnel metrics at 100k, p50 / p95 | 97 / 123 ms | 131 / 168 ms |
| Explorer, top by score, p50 / p95 | 72 / 84 ms | 73 / 94 ms |
| Explorer, name search, p50 / p95 | 300 / 906 ms | 97 / 130 ms |
| Explorer, industry + city filters, p50 / p95 | 20 / 26 ms | 27 / 42 ms |
| Dedup lookup against 100k, p50 / p95 | 11.5 / 185 ms | 14 / 26 ms |
| Queue: 10,000 tasks creating companies in a 100k-company client | 18/s | 51/s |
| Customer workflows: 2,000 runs across 50 apps | 45/s, all succeeded | 42/s, all succeeded |
| Customer isolation | 40 records per app, 0 in another customer | same |

**What the measurements found and what changed**
- Company matching OR-ed its strong keys together with relation subqueries,
  which scanned every account in the client, and its near-miss lookup used
  a parameterised LIKE prefix that Postgres planned as a walk over every
  name sharing a first word. Strong keys are now separate indexed lookups,
  and near-misses are the 20 alphabetical neighbours on each side. Creating
  a company in a 100k-company client went from 168 to 50 ms (p50).
- Explorer search had no index for substring matching: trigram GIN indexes
  on company name, domain, city and contact email and last name, with
  contact matches looked up first so the search is an OR of indexable
  conditions.
- Screening did several queries per account; it now reads a batch in one
  query and writes it in one statement.

**Limits of what was measured**: one machine with a local database; no
network latency to the database or providers; synthetic companies with
uniform names (every name shares its first word, a worst case for
near-miss matching and the reason the old lookup was slow). Small changes
between runs (funnel metrics 97 → 131 ms) are within run-to-run variation
on a shared machine, not attributed to a change. Supabase over its pooler,
real provider latency, and 1M-company volumes are not measured. The
forecast for 1M companies in the cost model remains a projection.

**Migrations**: `20261022060000_search_trigram_indexes` (five GIN indexes;
`pg_trgm` is already installed in production, in `public`).

### Also added after phase F

- Platform health alerts (`services/monitoring.ts`), raised and resolved by
  the scheduled maintenance pass, shown on the System page; tested on
  Postgres.
- Customer portal Applications: the customer's deployed apps in their
  branding with dashboard figures, records, submit forms, approvals and
  activity; staff "view as" is read-only.
- Email verification (ZeroBounce, Hunter): only a provider's VALID counts as
  verified; unknown stays unverified.
- Sales pipeline board.
- Ask Relay: Claude with read-only tools filtered by role and scoped by
  access; tool output treated as data; budgeted and logged.
- Gmail sending: OAuth per mailbox (send-only scope, signed state, account
  must match the mailbox), encrypted refresh token, Gmail API send behind
  the existing send gate with unsubscribe headers, DNS-based SPF/DKIM check,
  revoke on disconnect. Migration `20261022070000_gmail_mailboxes`.

None of the new provider integrations (ZeroBounce, Hunter, Google, Stripe,
Anthropic for the assistant) has been called live from this environment:
their tests fake the provider. Each shows a clear not-configured state until
its keys are set.


### Relay as its own first client (2026-10-23)

Brief: rename to Relay (Relay Intelligence, Relay Studio), configure Relay
itself as the first, internal client, and run the first real discovery.

**Naming.** The navigation groups the product as Relay Intelligence
(Discovery, Research funnel, Accounts, Sales pipeline, Contacts, Duplicates,
Campaigns, Review queue, Analytics) and Relay Studio (Opportunities,
Applications, Projects, Billing). The about page and site metadata describe
both. Unchanged on purpose: the `foundry_*` Stripe lookup keys, the
organization slug `foundry-main-v2`, the Supabase project name, the
repository's local folder name. The organization's display name comes from
Clerk; rename it there and the webhook updates Relay's copy.

**Relay as an internal client.** `Client.kind` can now be `INTERNAL`: listed
and prospected for like a customer, labelled "internal", never billed
(subscriptions refuse it), no client portal. The Relay client is switched to
it once this branch is deployed (switching earlier would hide it from the
current production build, which lists only `CUSTOMER`).

**Configuration** (`scripts/setup/relay-internal.ts`, through the app's own
services; production was configured with the same records):

- Profile: what Relay does, its two services, GTA, Ontario and Canada as
  service areas, the ten target industries. No website yet; none needed.
- Offers: *AI Lead Generation & Customer Acquisition*; *Custom AI & Business
  Process Automation*.
- One ideal customer profile per industry: manufacturing and industrial;
  construction and contracting; trucking, transportation and logistics;
  medical and healthcare administration; pharmaceuticals; spas, salons and
  beauty; retail and e-commerce; real estate; professional services;
  startups and emerging companies. Each has its search categories, target
  titles, the attributes research checks, and timely signals.
- One discovery profile per industry: Google Places, 14 GTA cities and 8
  more in Ontario, 25 new businesses per run, daily, US$3 a month at list
  price (before Google's free monthly requests), large chains excluded.
  First runs are staggered two hours apart, manufacturing first.
- Research funnel: screening on; a business qualifies for website analysis
  at 40 (a map listing in a target industry with a confirmed website scores
  about 53 before research, under the default 55); up to 8 analyses and 2
  deep researches a day; US$14 analysis + US$6 deep research = the US$20 a
  month research budget. Ceilings for the rest: discovery US$30, contact
  lookups US$10, drafting US$5, everything US$65.
- Playbook "Relay: AI lead generation and automation" and one draft
  campaign per offer: every email reviewed, research-based drafts only,
  weekdays 9:00 to 16:00 Toronto time, 10 a day, one person per company.

**Changes to make it work end to end:**

- Discovery runs continue from where the previous run of the profile
  stopped, and only businesses new to Relay count toward the 25; a run
  makes at most 15 paid searches. Before this a daily profile repeated its
  first searches and found the same businesses every day.
- Qualified accounts that miss a day's analysis allowance are queued on
  later days, best first.
- Research weighs every active offer: each "why they might care" angle
  names its offer; deep research gives a fit (strong, possible, weak, none)
  and a proposed first engagement per offer, each strong or possible fit
  citing verified facts. Deep research turns its evidence-backed automation
  ideas into opportunity records (matched to a Studio template, classified
  for reuse, estimated), and opportunity lists show the estimate priced at
  the rate card (setup + monthly). The Studio template catalogue is
  installed before deep research so matching has something to match.
- CASL sender identification: every email's text and HTML parts end with
  who sent it, on whose behalf, the mailing address and a contact address.
  The send gate refuses a client without a mailing address
  (`Client.mailingAddress`, migration `20261023080000_client_mailing_address`).
- The worker refuses to start with incomplete configuration and lists every
  missing variable.

Tests: discovery rotation and new-only counting, the backlog queue, service
fit validation, and the CASL footer and gate on Postgres; 252 tests passing.

---

## 5. Public website

The public website lives in the same app, in its own root layout
(`src/app/(site)`), separate from the workspace (`src/app/(platform)`). It
has no sign-in scripts, app providers or database reads, so its pages are
static; the only thing it writes is an inquiry, through `/api/inquiries`.

- Pages: home, services (automation, customer acquisition, websites), how it
  works (access and pricing), industries, seven demos, contact, about and
  privacy. `/` is the homepage for everyone; signing in lands on `/workspace`,
  which sends people to their home as `/` used to.
- Demos run on fictional data in the browser. Their logic is in
  `src/site/demos` with tests; the industry previews are computed by it.
- Inquiries are stored as sent, then linked to an account, a contact with its
  consent (implied by the inquiry, or express when the visitor opts in), a
  note and a reply task. Spam (the hidden field, or a send within seconds) is
  kept but held out of the CRM; sends are limited per IP and per email.
  Suggested consultation times are confirmed from Website inquiries, which
  creates the meeting. Nothing is emailed automatically.
- The brand name is one setting, `BRAND.name` in `src/site/config.ts`.
- Service packages (Relay Studio) hold the internal cost model behind each
  offering; it is never shown on the site.

