# Relay — Sales OS for AI automation agencies

A pipeline platform built around one principle: **the operator approves every
message before it leaves the building.** Volume is capped on purpose. The
competitive edge is research quality, not send count.

---

## 1. Why this shape

**Next.js 15 App Router + tRPC, one deployable.** Splitting frontend and backend
at this stage buys deployment complexity and nothing else. tRPC gives end-to-end
types without maintaining a separate schema. If a public API is needed later,
`/api/v1/*` REST routes wrap the same service layer — which is why business logic
lives in `src/server/services`, not in route handlers.

**Postgres + Prisma + RLS.** Multi-tenancy is enforced twice: once in the typed
service layer, once in the database. A single forgotten `organizationId` filter
should be a failed query, not a breach. `withTenant()` sets `app.current_org` on
the session, and every tenant table has a `FORCE ROW LEVEL SECURITY` policy.

**Anthropic primary, OpenAI fallback.** The research and personalization work is
long-context document reasoning — read a whole site, produce grounded claims.
Provider choice lives behind one interface (`src/server/ai/provider.ts`) so a
model swap is a config change. Every call is logged to `AiRun` with token counts
and cost, and the org has a monthly budget ceiling enforced before the call.

**n8n for integrations, not for core logic.** n8n is excellent at "when a Stripe
invoice is paid, post to Slack and update SharePoint." It's a poor place to put
the send gate. Core sequencing runs in the Node worker against Postgres; n8n
subscribes to Relay webhooks and handles customer-specific glue.

**No queue service on day one.** Scheduled sends and follow-ups are a
`nextActionAt` column plus a worker polling with `FOR UPDATE SKIP LOCKED`. It is
transactional with the data it's acting on, it survives restarts, and it removes
an entire moving part. Redis is present for rate limiting and caching only.

### The two decisions that shape everything else

**Grounded generation.** Nothing is generated from the model's general
knowledge about an industry. The research pass crawls the prospect's own site,
stores the raw extract, and every pain point, opportunity, and ROI figure
carries `sourceUrls`. The personalization pass may only reference facts present
in `Research.citations`. The draft review screen shows each personalized claim
next to the page it came from, so the reviewer verifies rather than trusts. This
is what makes "no invented facts" a system property instead of a prompt request.

**The send gate.** `src/server/services/send-gate.ts` is the only path to the
mail provider. It checks human approval, suppression by address and domain, a
25-day cross-campaign cooling-off window, org and per-mailbox volume caps, SPF/
DKIM verification, sending-window hours, and the presence of an opt-out link. A
blocked message surfaces its reason in the UI. Everything else in the platform
can be rewritten; this file is the compliance posture.

---

## 2. Module map

| # | Module | Primary tables | Key service |
|---|--------|----------------|-------------|
| 1 | Lead discovery | `Lead`, `Contact`, `DiscoveryRun` | `services/discovery/*`, `scoring.ts` |
| 2 | AI research | `Research`, `AiRun` | `ai/research.ts`, `crawler.ts` |
| 3 | Solution library | `SolutionTemplate` | `services/templates.ts` + data-driven renderer |
| 4 | Personalization | `Message` | `ai/personalize.ts` |
| 5 | Campaigns | `Campaign`, `CampaignStep`, `CampaignEnrollment` | `services/campaigns.ts` |
| 6 | Follow-up | `CampaignEnrollment.nextActionAt` | `worker.ts` |
| 7 | CRM | `Activity`, `Task`, `Meeting` | `services/crm.ts` |
| 8 | Proposals | `Proposal` | `services/proposal.ts` + `@react-pdf/renderer` |
| 9 | Portfolio sites | `PortfolioSite`, `PortfolioView` | wildcard subdomain routing in middleware |
| 10 | Admin | `Invoice`, `AuditLog`, `AiRun` | `services/analytics.ts` |

Module 3 is one renderer driven by a JSON `spec`, not thirteen hand-built demos.
Adding an industry means adding a seed row, not a directory.

---

## 3. Third-party integrations

| Service | Used for | Failure mode |
|---|---|---|
| Clerk | Auth, organizations, invitations | Webhook syncs users to `User`/`Membership`; app never trusts client claims |
| Anthropic | Research, personalization, proposal copy | Falls back to OpenAI, then queues for retry |
| Resend | Sending + delivery/open/click/bounce webhooks | Bounces write straight to `Suppression` |
| Stripe | Subscription billing, client invoicing | Webhook-driven, idempotent via `WebhookEvent` |
| Google Places | Local business discovery by geo + category | Rate limited; run is resumable via `DiscoveryRun` |
| Apollo (optional) | Contact enrichment | Optional; absent key degrades gracefully |
| Supabase Storage | Logos, proposal PDFs | Signed URLs only |
| Cal.com | Meeting booking on portfolio sites | Embedded; webhook creates `Meeting` |

Email verification, bounce handling, and unsubscribe are first-class tables
rather than provider features, so switching providers doesn't lose compliance
history.

---

## 4. Build sequence

Each phase is deployable and testable on its own.

- **Phase 1 (done here)** — schema, tenancy, RBAC, env validation, Docker, CI, scoring, send gate, RLS.
- **Phase 2** — Clerk auth flow, org onboarding, app shell and navigation, lead table with filtering/import, lead detail with CRM timeline.
- **Phase 3** — crawler, research pipeline, AI provider abstraction, budget enforcement, research review UI.
- **Phase 4** — personalization engine, draft review queue with claim-level provenance, approval flow, Resend integration, webhook ingestion, suppression management.
- **Phase 5** — campaign builder, enrollment, worker sequencing, follow-up rules, campaign analytics.
- **Phase 6** — solution template renderer plus the thirteen industry seeds.
- **Phase 7** — proposal generator and PDF pipeline; portfolio microsites with wildcard subdomains.
- **Phase 8** — admin analytics, Stripe billing, invoicing, audit log viewer, deployment runbook.

---

## 5. Running it

```bash
cp .env.example .env      # fill in keys
docker compose up -d db redis
npm install
npx prisma migrate dev
npm run db:seed           # built-in solution templates + demo org
npm run dev               # app on :3000
npm run worker            # sequencing + send worker
```

---

## 6. Build log

All eight phases are complete. What shipped in each:

| Phase | Delivered |
|---|---|
| 1 | Prisma schema, RLS policies, RBAC, env validation, send gate, lead scoring, Docker, CI |
| 2 | Clerk auth + org sync webhook, app shell, lead table with facet filtering, CSV import with confirm-mapping, CRM timeline |
| 3 | Polite crawler, AI provider abstraction with fallback + budget ceiling, grounded research with citation verification, evidence drawer |
| 4 | Fact-ledger personalization, two-tier drafting, draft linter, review queue with claim provenance, Resend integration, suppression, RFC 8058 unsubscribe |
| 5 | Campaign builder, enrollment, worker sequencer, follow-up scheduling in org timezone, inbound reply handling, stop conditions |
| 6 | Solution spec schema, data-driven demo renderer with device frames, 13 industry seeds, template forking |
| 7 | Proposal builder priced from a rate card, PDF pipeline, public share links, acceptance capture, prospect microsites with view tracking |
| 8 | Admin analytics with cohort-based conversion, Stripe billing, plan limits, invoicing, audit log viewer |

### Post-launch, in rough priority order

1. **Discovery providers.** `DiscoveryRun` and the filter schema exist; the
   Google Places and Apollo adapters do not. Today leads arrive by CSV or by
   hand.
2. **Mailbox onboarding UI.** Mailboxes can be created through the API but there
   is no settings screen for adding one and polling its SPF/DKIM status.
3. **Meeting booking.** `Meeting` is modelled and read by analytics, but nothing
   writes to it yet — a Cal.com webhook would close that loop.
4. **A/B testing on step instructions.** The data model supports it
   (`promptVersion` on every message); the analysis does not exist.
5. **JavaScript rendering** for the ~15% of prospect sites the crawler can't read.
