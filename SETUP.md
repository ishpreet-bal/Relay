# Foundry — setup and wiring

How the pieces connect, in the order you should connect them. Budget about two
hours for the first pass, most of it waiting on DNS.

---

## 1. The shape of the system

Four things run. Everything else is a service you call.

```
┌──────────────────────────────────────────────────────────────┐
│  Next.js app          (Vercel)                               │
│  ├─ /app              signed-in UI, tRPC API                 │
│  ├─ /p/[token]        public proposals                       │
│  ├─ /site/[sub]       public prospect microsites             │
│  ├─ /u/[token]        public unsubscribe                     │
│  └─ /api/webhooks/*   inbound from Clerk, Resend, Stripe     │
└──────────────────────────────────────────────────────────────┘
              │                              ▲
              │ reads/writes                 │ webhooks
              ▼                              │
┌──────────────────────────┐    ┌────────────────────────────┐
│  Postgres  (Supabase)    │    │  Clerk · Resend · Stripe   │
│  RLS on every tenant tbl │    │  Anthropic · Google Places │
└──────────────────────────┘    └────────────────────────────┘
              ▲
              │ claims work with FOR UPDATE SKIP LOCKED
┌──────────────────────────────────────────────────────────────┐
│  Worker  (Railway / Fly / any always-on host)                │
│  ├─ research queue     crawl → generate → verify             │
│  ├─ sequencer          drafts follow-ups, sends approved     │
│  └─ daily guardrail    contextual-tier performance check     │
└──────────────────────────────────────────────────────────────┘
```

**The worker cannot run on Vercel.** It is a long-lived loop, and serverless
functions are killed after seconds. Options, in order of preference:

1. Deploy the same repo to Railway or Fly.io with `npm run worker` as the start
   command. Simplest, and it shares the codebase.
2. Convert the loop to a Vercel Cron job hitting an authenticated route every
   minute. Works, but you lose the `SKIP LOCKED` concurrency model and inherit a
   60-second execution ceiling.

Option 1 is what the Dockerfile and compose file are built for.

---

## 2. Accounts you need

| Service | What it does here | Free tier enough to start? |
|---|---|---|
| **Supabase** | Postgres + file storage for logos and PDFs | Yes |
| **Clerk** | Sign-in, organizations, invitations | Yes |
| **Anthropic** | Research and personalization | Pay as you go |
| **Resend** | Sending, delivery events, inbound replies | 100/day free |
| **Stripe** | Your own subscription billing | Yes |
| **Vercel** | Hosts the app | Yes |
| **Railway or Fly.io** | Hosts the worker | ~$5/mo |
| **Google Places** *(optional)* | Local business discovery | Pay as you go |
| **OpenAI** *(optional)* | Fallback when Anthropic is unavailable | Pay as you go |

You can run everything except discovery and AI fallback on free tiers while you
test.

---

## 3. Order of operations

Do these in order. Later steps depend on earlier ones.

### 3.1 Database

```bash
git clone <your-repo> foundry && cd foundry
cp .env.example .env
npm install
```

Create a Supabase project. From **Project Settings → Database**, copy both
connection strings into `.env`:

```
DATABASE_URL=postgresql://...pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_DATABASE_URL=postgresql://...supabase.com:5432/postgres
```

The pooled URL is for the app; the direct one is for migrations. Prisma needs
both — migrations fail through a connection pooler.

```bash
npx prisma migrate deploy
npm run db:seed          # loads the 13 industry demos
```

Verify: `npx prisma studio` should show `SolutionTemplate` with 13 rows.

### 3.2 Clerk

Create an application. Turn **Organizations** on — the whole tenancy model
depends on it, and the app redirects to `/onboarding` for any user without one.

Copy into `.env`:
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

Then **Webhooks → Add Endpoint**:
- URL: `https://your-app.vercel.app/api/webhooks/clerk`
- Events: `user.created`, `user.updated`, `organization.created`,
  `organization.updated`, `organization.deleted`,
  `organizationMembership.created`, `organizationMembership.updated`,
  `organizationMembership.deleted`
- Copy the signing secret to `CLERK_WEBHOOK_SECRET`

**This webhook is not optional.** Clerk owns identity; Postgres mirrors it. If
the webhook isn't firing, users sign in successfully and then have no
`Membership` row, so every query returns nothing and the app looks broken in a
confusing way. Test it before moving on.

### 3.3 Sending domain

This is the step with a waiting period, so start it early.

In Resend, add your sending domain. It gives you DNS records — add all of them
at your registrar:

| Type | Purpose | Skip it and… |
|---|---|---|
| MX | Receives replies | Inbound replies never arrive; sequences never stop on reply |
| TXT (SPF) | Authorizes Resend to send as you | Campaigns can't be activated |
| TXT (DKIM) | Signs your mail | Campaigns can't be activated |
| TXT (DMARC) | Tells providers what to do with failures | Deliverability suffers quietly |

Propagation takes 15 minutes to a few hours. `campaigns.setStatus` refuses to
activate a campaign whose mailbox isn't SPF+DKIM verified — that check is
deliberate, and working around it is how a domain gets burned in week one.

**Use a subdomain you don't care about**, e.g. `outbound.youragency.com`, not
your main domain. If cold outreach damages the reputation of `youragency.com`,
your invoices and client email start landing in spam too.

Then:
```
RESEND_API_KEY=re_...
RESEND_WEBHOOK_SECRET=whsec_...
```

Resend **Webhooks → Add**:
- URL: `https://your-app.vercel.app/api/webhooks/resend`
- Events: `email.sent`, `email.delivered`, `email.opened`, `email.clicked`,
  `email.bounced`, `email.complained`
- Second endpoint for inbound: `https://your-app.vercel.app/api/webhooks/inbound`

Both use the same secret and the same Svix verifier (`webhook-verify.ts`).

### 3.4 Wildcard subdomain for prospect microsites

Add a wildcard DNS record:

```
*.demos.youragency.com   CNAME   cname.vercel-dns.com
```

In Vercel, add `*.demos.youragency.com` as a domain on the project. Then:
```
PORTFOLIO_ROOT_DOMAIN=demos.youragency.com
```

`src/middleware.ts` detects any host ending in that root, extracts the
subdomain, and rewrites to `/site/<subdomain>` **before authentication runs** —
a prospect must never meet a login wall on a page you sent them.

### 3.5 AI

```
ANTHROPIC_API_KEY=sk-ant-...
AI_MONTHLY_BUDGET_CENTS=50000     # $500. Start lower while testing.
OPENAI_API_KEY=sk-...             # optional fallback
```

The budget is enforced *before* every call. Over cap, research jobs requeue
rather than fail, and resume when the month rolls or you raise the ceiling.

**Verify the pricing table.** `src/server/ai/pricing.ts` has per-model rates and
a `PRICING_LAST_VERIFIED` date. Check them against Anthropic's current pricing
page — a stale table silently corrupts every cost and margin figure in the
admin dashboard.

### 3.6 Stripe (your own billing)

Create three products with **price lookup keys** exactly matching
`PRICE_TO_PLAN` in `src/server/services/billing.ts`:

```
foundry_solo_monthly
foundry_agency_monthly
foundry_scale_monthly
```

Lookup keys, not price IDs — that's what the code searches on. A mismatched key
throws a clear error at checkout rather than silently assigning the wrong plan.

**Webhooks → Add endpoint**: `https://your-app.vercel.app/api/webhooks/stripe`
with `customer.subscription.created`, `.updated`, `.deleted`,
`invoice.paid`, `invoice.payment_failed`, `invoice.finalized`,
`checkout.session.completed`.

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Stripe signs with its own scheme, not Svix — that's why `webhooks/stripe`
uses `constructEvent` instead of the shared verifier.

### 3.7 Secrets

```bash
openssl rand -base64 32   # ENCRYPTION_KEY
openssl rand -hex 32      # UNSUBSCRIBE_SIGNING_KEY
openssl rand -hex 16      # CRON_SECRET
```

**Never rotate `UNSUBSCRIBE_SIGNING_KEY` casually.** Every unsubscribe link you
have ever sent is signed with it. Rotating invalidates all of them, and a
recipient clicking a dead opt-out link is both a bad experience and a
compliance problem.

---

## 4. Running it

**Local:**
```bash
docker compose up -d db redis
npx prisma migrate dev
npm run db:seed
npm run dev            # :3000
npm run worker         # separate terminal
```

For webhooks locally, tunnel: `npx untun tunnel http://localhost:3000` or use
`stripe listen --forward-to localhost:3000/api/webhooks/stripe`.

**Production:**
```bash
vercel --prod          # app
# then, on Railway/Fly, deploy the same repo with:
#   start command: npm run worker
#   same env vars, same DATABASE_URL
```

The worker needs the identical `.env`. It talks to the same database and shares
the same code — it is not a separate service to maintain.

---

## 5. First-run checklist

Work through this in the app. Each step depends on the last.

1. **Sign up → create your workspace.** Confirm in Prisma Studio that
   `Organization` and `Membership` rows appeared. If not, the Clerk webhook
   isn't reaching you.
2. **Settings → rate card.** Set your day rate. It defaults to $1,200/day and
   every proposal prices off it.
3. **Settings → sending limits.** Defaults are 60/day, 12/hour. Reasonable for
   a warm domain; start at 20/day on a new one.
4. **Leads → Import CSV.** Confirm the column mapping screen before importing.
5. **Open a lead → Research this company.** Watch the grounding rate on the
   provenance bar. Anything below ~70% means the crawler struggled with that
   site, usually because it's JavaScript-rendered.
6. **Add a mailbox** in Settings and confirm SPF/DKIM show verified.
7. **Campaigns → New.** The default sequence is opener → 30 days → 45 days.
8. **Enroll a few leads**, activate, and wait for the worker to draft.
9. **Review queue.** Read a draft. Expand "What this email claims" and check a
   claim against its source. Approve and send one to yourself first.
10. **Generate a proposal** and open the PDF.
11. **Create a demo site**, publish, and load
    `https://<subdomain>.demos.youragency.com`.

---

## 6. How data actually moves

Worth understanding once, because most support questions are really questions
about this flow.

**Lead → contacted:**
```
CSV import / discovery
  → Lead (score computed from 6 transparent signals)
  → research queued
  → worker: crawl 8 pages → model generates claims with quotes
  → grounding.ts verifies every quote against crawled text
  → unverified claims DELETED, never shown
  → Research row + ROI computed by arithmetic from hour estimates
  → campaign enrollment
  → personalize.ts builds a fact ledger from verified claims ONLY
  → draft generated, tier = VERIFIED or CONTEXTUAL
  → lint.ts checks for unsupported claims
  → Message lands in DRAFT or NEEDS_EDIT — never APPROVED
  → human reviews in /review, sees each claim beside its source
  → approve
  → send-gate.ts: suppression, 25-day cooling-off, caps, SPF/DKIM, opt-out link
  → Resend
```

**Reply → sequence stops:**
```
Resend inbound webhook
  → match by In-Reply-To, then by sender address
  → INBOUND Message + timeline entry
  → exitEnrollment() cancels EVERY queued message for that lead
  → lead → ENGAGED, temperature HOT
  → if the reply text asks to stop, suppress immediately
```

**Bounce or complaint → suppression:**
```
Resend webhook → hard bounce or complaint
  → suppress() writes the address
  → cancels queued messages, exits enrollments, marks lead SUPPRESSED
  → cannot be removed, by anyone, including owners
```

The invariant across all of it: **a human approves every message, and no
message can say anything research didn't verify.** Every other rule in the
codebase is downstream of those two.

---

## 7. Things that will bite you

**"My leads list is empty but I imported 200."** The Clerk webhook didn't fire,
so you have no `Membership` row and RLS is filtering everything. Check
`WebhookEvent` for `provider = 'clerk'`.

**"Research keeps failing."** Check `Research.error`. Common causes: the site is
fully JavaScript-rendered (the crawler reads server HTML), `robots.txt`
disallows crawling, or the AI budget is exhausted.

**"Drafts generate but never send."** Expected. They wait in `/review`. If
you've approved them and they still sit, check the send gate reason on the
draft card — usually SPF/DKIM unverified or a daily cap.

**"Everything is 'Industry only'."** Research isn't producing verified facts.
Either it hasn't run, or the sites aren't crawlable. Fix the research before
sending a batch of low-information emails.

**Bounce rate above 3%.** Stop. Clean the list. Providers filter on this and the
damage takes weeks to undo.

---

## 8. What's deliberately not built

Stated plainly so you don't go looking:

- **Real e-signature.** Proposal acceptance is a typed name, timestamp, and IP.
  Enough to show intent; not a qualified electronic signature. Route through a
  dedicated provider if you need one.
- **JavaScript rendering in the crawler.** Server HTML only. A headless browser
  would roughly triple crawl cost and time for maybe 15% more coverage.
- **Automatic logo scraping.** A microsite renders a prospect's logo only when
  you record who granted permission.
- **Sending without approval.** There is no configuration flag for it. The
  review step is the product.
