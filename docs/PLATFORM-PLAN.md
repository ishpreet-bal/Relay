# Relay platform plan — Intelligence and Studio

Written 2026-10-21 from the code on branch `claude/busy-noether-wkwta7`, in
response to two briefs: the lead-intelligence platform brief and its
extension (scalable research, Studio, recurring revenue). The briefs call the
product "Foundry"; the product is named **Relay** everywhere in code and UI.

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
- ⬜ Email verification connector (ZeroBounce/Hunter)
- ⬜ Gmail OAuth sending and approval queue on Gmail
- ⬜ Pipeline Kanban with the brief's stages
- ⬜ Automation library with synthetic demos tied to opportunities (phase E)
- ✅ Cost ledger budgets by category with 50/80/100% warnings (phase C)
- ⬜ AI assistant over permissioned tools

### Brief 2

- ✅ Phase A — this review
- ✅ Phase B — queues, throttles, breakers, attempts, dead letter, ops page, 1,000-task test (see section 4)
- ✅ Phase C — staged qualification, freshness, research versions, budgets, forecasts (see section 4)
- ⬜ Phase D — Studio foundation and two-tenant isolation test
- ⬜ Phase E — opportunity-to-application workflow
- ⬜ Phase F — subscriptions, metering, Stripe test mode, profitability
- ⬜ Phase G — scale validation with measured numbers

---

## 3. Credentials you need to supply

| Variable | Where | Used for |
|---|---|---|
| `GOOGLE_PLACES_API_KEY` | Google Cloud console → enable "Places API (New)" → API key restricted to that API | discovery |
| `APOLLO_API_KEY` (+ `APOLLO_COST_PER_CREDIT_MILLICENTS`) | Apollo → Settings → API | company search, contacts, email lookup |
| `ANTHROPIC_API_KEY` | platform.claude.com | research, drafting, verification |
| `ZEROBOUNCE_API_KEY` or `HUNTER_API_KEY` | vendor dashboard | email verification (connector not built yet) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth client | Gmail sending, customer Google integrations |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` (test mode) | Stripe dashboard, test mode | customer subscription tests |
| Worker host | Railway or Fly | a process running `npm run worker` with the same env |

Set them in Vercel → Project → Settings → Environment Variables (and the
worker's environment), then use each connector's check on the Connectors page.

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
