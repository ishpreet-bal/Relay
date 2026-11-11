# Relay engineering platform: audit and implementation plan

Written 2026-11-11 from a full read of the repository and the production
database. It records what exists, what was verified broken, what has been
fixed, and the order of work for turning Relay Studio into an engineering
platform run by coordinated AI agents under the founder's approval.

Status words used below: **built** (code and tests exist), **untested live**
(built, never run against the real provider), **missing**.

## 1. What already exists (reuse, do not rebuild)

| Capability | Where | Status |
|---|---|---|
| Durable job queue on Postgres: 15 queues, per-queue concurrency, rate limits, timeouts, retries with backoff, dead letters, idempotency keys, stale-job release | `src/server/services/jobs.ts`, `job-runner.ts`, `src/server/queues/*`, `worker.ts` | built, load-tested (1k synthetic tasks) |
| Provider throttles and circuit breakers shared across workers | `src/server/queues/throttle.ts` | built |
| One entry point for every model call: budget check, retries, fallback, `AiRun` log, usage record with cost | `src/server/ai/provider.ts`, `pricing.ts` (model roles in `MODELS`) | built |
| Monthly budgets by category with 50/80/100% alerts | `src/server/services/pipeline/budgets.ts` | built |
| Tenant isolation as a value (`AccessContext`, `clientFilter`) and explicit permissions | `src/server/access/scope.ts`, `src/lib/rbac.ts` | built; staff are not yet limited per client |
| Audit log, system alerts, worker heartbeats, health checks | `AuditLog`, `SystemAlert`, `services/monitoring.ts` | built |
| Studio: manifest-driven customer applications from tested modules, versioned config, sandbox/production deploys, rollback, approvals inside workflows, webhooks, schedules | `src/server/studio/*` | built; assembles from templates, cannot write new code |
| Delivery: opportunities from research, template matching, effort estimates calibrated by closed projects, demos on synthetic data, proposals, projects with time entries | `src/server/services/delivery/*` | built |
| Customer billing: subscriptions, metered usage, invoices, Stripe adapter with idempotency keys and a live-charge switch | `src/server/services/customer-billing/*` | built; Stripe untested live (no keys set) |
| Client portal scoped to one client | `src/app/(platform)/portal` | built |
| In-app assistant with read-only tools | `src/server/ai/assistant.ts` | built |

What this means for the vision: orchestration, queues, cost tracking, approvals
inside workflows, audit and tenancy are already here. The gap is narrower than
"build an agent platform": it is (a) a project lifecycle with gated stages,
(b) agents that produce requirements, designs and plans, (c) agents that write
and test code in isolation, and (d) a single approval inbox.

## 2. Phase 1: known issues, verified against production (2026-11-11)

| Issue | Verified state | Outcome |
|---|---|---|
| Website contact save times out | Still failing: 49 "Transaction not found/closed" errors in 48 h | **Fixed**: 30 s transaction limit; test saves twelve contacts |
| Research fails on empty Claude credit | Still failing: 247 attempts in 48 h, 969 runs failed, 0 completed | **Mitigated**: an empty balance now pauses the provider for an hour at a time; jobs wait without losing attempts. Credit must still be added by the owner |
| Contact enrichment depends on research | Confirmed: 0 `CONTACT_ENRICHMENT` jobs ever | **Fixed**: qualified accounts get a lookup on their own daily allowance; the job reads the site for published contacts itself |
| Apollo, Hunter, ZeroBounce unused | Confirmed: 0 provider records. Cause was the dependency above, not the adapters | Unblocked by the fix. **Not yet verified live**: needs one real run after deploy; the Render worker must have the same provider keys as Vercel |
| Anyone can create a workspace | Confirmed in code | **Fixed**: invite-only, enforced in the Clerk webhook |
| Staff see every client | Confirmed: 88 queries scope by workspace only | **Open** (next increment; needs a careful pass over each query) |
| Stripe incomplete | Adapter, webhooks and tests exist; no keys in any environment | **Open**: needs the owner's Stripe test keys, then an end-to-end test |
| Preview deployments fail | Database variables exist for Production only | **Open**: owner decision (separate preview database) |

After deploying, 969 accounts whose research already failed can be retried
from System › Queues › Research › "Retry dead letters" once credit is added.

Owner actions Phase 1 cannot do in code:
1. Add credit to the Anthropic Console account and set a monthly limit there.
2. Confirm the Render worker has `APOLLO_API_KEY`, `HUNTER_API_KEY`,
   `ZEROBOUNCE_API_KEY` (they are set on Vercel).
3. In Clerk, set sign-up to Restricted (invitation only) so accounts, not just
   workspaces, are invite-only.
4. Add `WORKSPACE_CREATOR_EMAILS` if the owner will create more workspaces.

## 3. Target architecture

### 3.1 Principles
- **Extend Studio.** New models hang off `DeliveryProject`; no second app.
- **Agents are roles with tools, not personas.** Each has a defined input,
  output schema, tool set, permission set and budget.
- **Use the simplest execution tier that works.** Requirements, architecture,
  estimation and planning are single structured model calls through the
  existing `complete()`. Only agents that must read and change code run in an
  agent loop.
- **Model-independent.** Agents ask for a role (`MODELS.analyst`,
  `MODELS.architect`, `MODELS.developer`, `MODELS.reviewer`); the mapping is
  one table. QA and security review use a different model from the one that
  wrote the code.
- **Evidence gates.** A stage advances only when its completion criteria are
  recorded as evidence (artifact ids, test run ids, approval ids). An agent's
  claim is not evidence.
- **Nothing consequential without approval.** One `Approval` record type and
  one inbox for: customer email, access to customer systems, purchases,
  production deploys, production data changes, DNS, charges.

### 3.2 Data model (additive)
- `EngineeringProject` (1:1 with `DeliveryProject`): stage, repository
  reference, budget (model cents), paused flag.
- `ProjectStageRun`: one row per stage entered: status, criteria, evidence,
  who or what completed it.
- `EngineeringTask`: unit of agent work: role, depends-on, branch name,
  acceptance criteria, status, attempts.
- `AgentRun`: one execution of an agent on a task: model, tokens, cost,
  status, transcript reference, linked `AiRun` rows.
- `ProjectArtifact`: versioned documents (requirements, architecture, plan,
  test report, security report, handover) with content hash.
- `Approval`: kind, payload, requested by (agent run), decided by (user),
  decision, expiry. Workflow approvals in Studio move onto it later.

Stages: intake → requirements → analysis → design → estimate → approval →
tasks → development → QA → security → acceptance → deploy approval →
deployment → monitoring → maintenance.

### 3.3 Where code-writing agents run
Coding agents need a sandbox with a checkout, a shell and a test runner, one
per task, with no access to Relay's own secrets. Building that on the Render
worker would mean owning container isolation. The plan is to use Anthropic's
Managed Agents for these roles: Anthropic hosts the per-session container and
the agent loop; Relay stores the agent definitions, starts a session per
task, mounts the project's repository, and records events, cost and the
resulting pull request. Customer credentials go in a vault per project and
never enter the sandbox in plain text. This is a design decision, **not built
and not tested**; it needs API credit and a GitHub App for repository access.

The orchestrator itself is ordinary Relay code: a job type on the existing
queue that advances projects, schedules tasks whose dependencies are done,
enforces budgets, retries, and escalates to the approval inbox.

### 3.4 Agents
| Agent | Tier | Output | Gate it feeds |
|---|---|---|---|
| Orchestrator | code + queue | stage transitions, task schedule, reports | all |
| Business analyst | structured call | requirements doc, open questions, acceptance criteria | requirements |
| Solution architect | structured call (reads template catalogue and module list) | architecture, integrations, data model, risks | design |
| Estimator | deterministic + existing calibration | hours, model cost, hosting cost | estimate |
| Developers | sandboxed agent loop | branch, commits, pull request | development |
| QA | sandboxed agent loop, different model | test run, defect report | QA |
| Security | sandboxed agent loop + checklist | findings, each resolved or escalated | security |
| DevOps | prepares only | deploy plan, rollback plan | deploy approval |
| Maintenance | scheduled, read-only | alerts, proposed fixes as tasks | monitoring |

## 4. Implementation sequence

1. **Phase 1 remainder**: per-client staff scope; Stripe end to end with test
   keys; preview environment decision.
2. **Orchestrator foundation**: the models in 3.2, stage machine with
   evidence gates, approval inbox, command center page. No model calls.
3. **Analyst, architect, estimator** on `complete()`, with fixtures and a
   scripted-model test suite. First real use: an internal Relay project.
4. **Sandboxed developer and QA agents** behind a feature switch; GitHub App;
   one internal application built end to end before any client work.
5. **Sales to delivery**: opportunity → requirements draft → demo → proposal →
   project, reusing `delivery/opportunities.ts`.
6. **Client-facing project view, deploy approvals, maintenance agent.**

Each step lands as its own pull request with type check, lint, tests and a
production build, and states plainly what was not verified.
