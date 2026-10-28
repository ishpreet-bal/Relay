# Relay: from discovered companies to a service worth buying

Baseline: latest `main` at `cee276a4742b34a6be1eb84b717e85188c14bfaa` (Claude's website update merged October 28, 2026). Changes live on `codex/outreach-readiness`; merge is left to the owner.

## What the code now does

- Website research reads up to 16 relevant public pages across three link levels. Contact pages have priority. It collects links and literal contact details before removing navigation/footer content, keeps short contact pages, checks robots rules and reports skipped pages and page limits. Website contacts retain the page URL and stay unverified with an unknown outreach basis.
- Completed research queues an independent contact-resolution job. Scheduled maintenance also backfills recently researched accounts missing verified email, 25 at a time. The job tries existing contacts, Apollo search and email reveal, Hunter domain search/finding as fallback, and Hunter/ZeroBounce verification when configured. Up to three reveals and three verification operations are attempted per job attempt; successful fresh lookups are cached. A provider outage is retried through the existing durable queue. Missing providers and unresolved contacts remain visible.
- Apollo person IDs work without a revealed surname. Distinct people with the same first name are retained; repeat provider IDs and email addresses are deduplicated. Reveal calls do not request personal emails or mobile numbers. A reported different current employer is rejected.
- Each account has an evidence-based brief with contact routes, research age, crawl limitations, pending/failed work and next steps. For Relay's own INTERNAL client, six workflow playbooks match business facts to specific possible workflows: estimate intake, booking, inventory, inspection reporting, shipment updates and clinic administration. Each includes trigger, inputs, steps, output, human review, recovery behavior, exclusions and validation questions. These are explicitly hypotheses; the website cannot establish the company's private problems. Other clients keep their own active offers and relevance research.
- The brief produces an internal setup-price range and managed monthly estimate using the workspace's rate card and package costs. Setup pricing takes the higher of the selling rate or target-margin floor, plus 25% contingency. Monthly pricing includes estimated infrastructure, AI/provider allowances, support and maintenance. Starter assumptions are labelled. Nothing publishes a price or accepts a customer contract automatically.
- All outreach needs human approval, including campaigns saved under the old automatic mode. The final email gate also checks account/client/workspace ownership, recently verified VALID email and a recorded outreach basis with supporting notes. Campaign outreach additionally needs recent sourced business facts and a specific offer supported by the research. Existing suppression, sender identity, unsubscribe and volume checks remain.
- Provider errors, raw response logging and connector checks redact known secrets and credential fields. Keys continue to live in server environments. Gmail refresh tokens continue to use the existing AES-256-GCM encryption. The UI distinguishes missing, configured/untested, tested and failed credentials; a passing health check is not a claim that every endpoint works.
- All seven public demos use a consistent application workspace frame; the interactive application appears before the explanatory cards.

## The operator's workflow

1. Open an account and inspect the new brief. Company counts are discovery counts, not outreach-ready counts.
2. Run or refresh research. Review the sources and any crawl limitations. A blocked or inaccessible site requires manual research rather than a claim of complete coverage.
3. Use **Resolve contacts**. It queues background enrichment without sending anything. Watch the job and provider log; missing keys have an explicit explanation. A phone-only route stays labelled phone review.
4. Review the contact's current role, source, verification and applicable outreach basis. A public email or purchased contact is not automatically permission to market.
5. Select a workflow hypothesis or the client's relevant offer. Ask the validation questions. Record actual volumes, current software, approval owner and access constraints.
6. Use Opportunities for a qualified scope, assessment, demo and proposal. The new brief is a starting estimate, not a signed quote. Update Packages and the rate card to real costs before quoting.
7. Review and approve the individual message. The final gate can still hold it if details become stale or suppressed.

## Which accounts and API keys to prioritize

| Priority | Service | Configuration | Purpose / limitation |
|---|---|---|---|
| First | Apollo | `APOLLO_API_KEY`, actual per-credit cost | Decision-maker search and work email reveal. Search does not return email; enrichment is separate and plan permissions matter. Test both endpoints with one company. |
| First | Hunter | `HUNTER_API_KEY`, actual search/check costs | Public-domain contact fallback, named-person email finding and email verification. Useful for small businesses missing from Apollo. Test search, finding and verification separately. |
| First | Anthropic | Existing `ANTHROPIC_API_KEY` and workspace header when required | Sourced research and drafting. Keep the working pinned models until model availability, quality and pricing are tested. Claude's latest *code* update is the baseline; no unrelated SDK/model upgrade is included. |
| First | Sending mailbox | Existing Google OAuth client and connected mailbox, or verified Resend domain | Sending identity and real reply handling. Keep customer mailboxes isolated and verify SPF/DKIM. No email is sent by this change. |
| First | External uptime/incident monitoring | Sentry or Better Stack account | Monitor the public site, `/api/health`, worker heartbeat and an agreed alert destination. Existing in-app alerts alone do not notify someone when the whole platform is down. External alert delivery is not connected in this change. |
| Optional | ZeroBounce | `ZEROBOUNCE_API_KEY` | Independent verification alternative/fallback. Start with one verifier; compare real coverage before paying for both. |
| Optional | Google Places | Existing restricted `GOOGLE_PLACES_API_KEY` | Local company discovery and live phone listing lookups. Keep the existing source-retention restrictions; discovery data is not a permanent contact database. |
| Later | Firecrawl | Not integrated in this change | Consider a bounded, metered rendering fallback for JavaScript-heavy public sites after measuring crawl failures. Do not label it connected just because a key exists. |
| Per client | Their CRM, booking, accounting or commerce tool | Minimum scopes for that client's account | Buy/API-enable only what the agreed workflow needs. Check whether a native workflow already solves the problem before writing a custom integration. |

Official provider references checked October 28, 2026:
- Apollo search: https://docs.apollo.io/reference/people-api-search
- Apollo enrichment: https://docs.apollo.io/reference/people-enrichment
- Apollo credit behavior: https://docs.apollo.io/docs/api-pricing
- Hunter APIs: https://hunter.io/api-documentation/v2
- Sentry monitoring: https://sentry.io/for/nextjs/

## Secure connection checklist for the owner

No secrets should be pasted into chat or a GitHub issue. Enter them directly in the host's secret settings.

1. Put server secrets in Vercel Production **and the Render worker's secret environment**, with separate restricted nonproduction credentials. A web app key does not automatically reach Render. Keep private keys out of `NEXT_PUBLIC_*` variables.
2. Keep `ENCRYPTION_KEY` stable and backed up securely: changing it without re-encrypting stored OAuth credentials makes those credentials unreadable. Rotate exposed provider keys at their provider, then replace the host secret and restart/redeploy the relevant runtime.
3. Set real per-credit/check prices and monthly category budgets. A provider balance or billing limit is a second layer. Current usage budgets are application accounting, not an absolute provider-side spend guarantee under every concurrency/failure scenario.
4. Test each required capability with one controlled company: website contacts, Apollo search, Apollo reveal, Hunter fallback, verification, research and the signed-in brief. Record date and outcome without secret values. Health tests may prove only authentication.
5. Use an isolated Preview database. Do not point feature previews at the production database just to make previews pass.

After the owner granted Vercel team access, production metadata confirmed Apollo, Hunter, ZeroBounce, Anthropic, Google Places, Google OAuth, Clerk, database, encryption, unsubscribe and cron variables are present. Only APP_URL is also scoped to Preview/Development. No secret values were displayed or decrypted. Live provider validity and the Render worker environment remain unconfirmed.

Vercel flags private credentials as readable Config values (encrypted at rest, readable by authorized team members). A request to convert Apollo to Secret storage was rejected because the Vercel API now requires `visibility: secret`, which the connected tool does not expose. No environment value or type changed. Convert private credentials to Secret in the Vercel dashboard; leave public configuration such as APP_URL and the Clerk publishable key as Config. This storage flag is not evidence that a key was publicly exposed.

## Reliability commitments we can actually sell

A credible managed-service promise is an agreed operating process with measurable targets, monitoring and remedies. No vendor can promise that software and third-party APIs never fail.

Before a paid production launch, require evidence for:
- A named service owner and escalation contact; business hours and severity-based response targets chosen from actual staffing capacity.
- Acceptance tests on anonymized customer examples, including missing input, duplicate input, rejected credentials, 429/5xx, partial writes, timeout, worker restart and provider outage.
- Idempotent external effects and reconciliation. The current queue provides at-least-once delivery. A new integration must prove that replay cannot double-book, double-charge, double-order or double-send before it goes live.
- A manual fallback and an exception queue for every automated process; original inputs retained under an agreed retention policy.
- Independent uptime alerts, a tested database restore and export, rollback steps and an incident communication process.
- Separate client credentials/data, least-privilege access and a reviewed data-retention policy. Healthcare work needs its own privacy/security assessment before patient data is used.
- A limited pilot with measured success/error rates, operating cost and recovery time. Set any contractual uptime/response/restore targets only after measurement and approval.

Start with one low-risk administrative workflow for one small client. Prefer improving their existing tools over replacing working systems. Prove the full loop before increasing volume or promising managed SLAs.

## Known limits and release checks

The crawler is bounded public-site research, not an exhaustive scrape of the internet or private business systems. It does not render JavaScript, bypass access controls or fetch PDFs. Crawl errors/page caps and unknown private processes stay visible. Source-quote matching checks that a passage exists; a person must still check what the passage actually supports.

Email verification is not a delivery guarantee. Consent evidence and expiry/applicability need human review; this change does not claim to automate a legal determination. Missing contacts can remain missing. In-app health checks and retries already existed; external paging, restore drills and real-provider failure tests still require operator setup.

Validation commands: `TZ=UTC npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test:e2e`. CI now runs on `codex/**` branches with disposable Postgres, followed by a production build and desktop/mobile demo checks. The added tests exercise contact extraction, navigation-only contact pages, robots rules, Apollo ID reveal, Hunter contracts, price assumptions, redaction, tenant checks and send prerequisites.

Signed-in production UI, real provider credentials and production/Render behavior must be tested after the owner grants access and merges/deploys. Passing mocked contract tests must not be described as a live provider certification.
