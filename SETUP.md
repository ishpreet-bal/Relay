# Relay — setup and wiring

How the pieces connect, in the order you should connect them. Budget about two
hours for the first pass, most of it waiting on DNS.

---

## 1. The shape of the system

Two things run. Everything else is a service you call.

```
┌──────────────────────────────────────────────────────────────┐
│  Next.js app          (Vercel or any Node host)              │
│  ├─ /dashboard …      internal workspace (staff, callers)    │
│  ├─ /portal           client portal                          │
│  ├─ /u/[token]        public unsubscribe                     │
│  ├─ /api/trpc         typed API                              │
│  └─ /api/webhooks/*   inbound from Clerk, Resend, Stripe     │
└──────────────────────────────────────────────────────────────┘
              │                              ▲
              │ reads/writes                 │ webhooks
              ▼                              │
┌──────────────────────────┐    ┌────────────────────────────┐
│  Postgres  (Supabase)    │    │  Clerk · Resend · Stripe   │
│  jobs queue lives here   │    │  Anthropic · Apollo        │
└──────────────────────────┘    └────────────────────────────┘
              ▲
              │ claims work with FOR UPDATE SKIP LOCKED
┌──────────────────────────────────────────────────────────────┐
│  Worker  (Railway / Fly / any always-on host)                │
│  ├─ research and enrichment jobs                             │
│  ├─ rescoring after ICP or data changes                      │
│  ├─ sequencer: drafts, verifies, sends approved mail         │
│  └─ hourly call-queue refresh, daily guardrail               │
└──────────────────────────────────────────────────────────────┘
```

**The worker cannot run on Vercel.** It is a long-lived loop, and serverless
functions are killed after seconds. Deploy the same repo to Railway or Fly.io
with `npm run worker` as the start command; it shares the code and the
environment.

---

## 2. Accounts you need

| Service | What it does here | Required? |
|---|---|---|
| **Postgres** (Supabase or any) | Everything, including the job queue | Yes |
| **Clerk** | Sign-in, organizations, invitations | Yes |
| **Anthropic** | Research, drafting, verification | For research and drafting |
| **Resend** | Sending, delivery events, inbound replies, domain status | For email |
| **Apollo** | Company enrichment, finding contacts and emails | Optional |
| **OpenAI** | Fallback when Anthropic is unavailable | Optional |
| **Stripe** | Workspace billing | Optional |

Every provider except Postgres and Clerk is optional. A missing one shows as
**not configured** on the Connectors page and the features that need it say
so — nothing is filled in with made-up data.

---

## 3. Order of operations

### 3.1 Database

```bash
git clone <your-repo> relay && cd relay
cp .env.example .env
npm install
```

Create a Supabase project. From **Project Settings → Database**, copy both
connection strings into `.env`:

```
DATABASE_URL=postgresql://...pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_DATABASE_URL=postgresql://...supabase.com:5432/postgres
```

The pooled URL is for the app; the direct one is for migrations.

```bash
npx prisma migrate deploy
npm run db:seed
```

**Database role.** Migrations enable row-level security on every table with no
policies. That closes Supabase's auto-generated REST API (the `anon` and
`authenticated` roles see nothing). The app must therefore connect as the
table owner — the default `postgres` user does — or as a role with
`BYPASSRLS`. Tenant isolation inside the app is enforced by the service layer.

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

Propagation takes 15 minutes to a few hours. Then add the address as a
**mailbox** in **Settings → Sending mailboxes** and press **Check domain**: Relay
asks Resend whether the domain is verified. A campaign whose mailbox isn't
SPF+DKIM verified cannot be activated — deliberately; working around it is how
a domain gets burned in week one.

**Use a subdomain you don't care about**, e.g. `outbound.example.com`, not the
main domain. If cold outreach damages the reputation of the main domain,
invoices and ordinary email start landing in spam too.

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

### 3.4 Connectors

Provider credentials live only in the server environment — never in the
database or the browser. **Connectors** (admins only) shows each provider as
connected, not configured (naming the missing variables), turned off, or not
built yet; it can test a connection and set priority when several providers
can do the same job.

```
APOLLO_API_KEY=...                         # company + contact data, email finding
APOLLO_COST_PER_CREDIT_MILLICENTS=0        # optional: what one credit costs you, for cost tracking
RESEND_COST_PER_EMAIL_MILLICENTS=0         # optional: per-email cost for unit economics
```

Paid lookups are cached (`ProviderRecord`) and reused until they expire, so
the same company is never paid for twice.

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

### 3.6 Example clients (optional)

Workspaces are created through Clerk, so sign up first. Then:

```bash
SEED_DEMO_WORKSPACE=<workspace slug> npm run db:seed
```

This installs the four starter playbooks and two example clients — ABC
Transport (Ontario–US trucking) and Northline Industrial Supply — with offers,
ideal customer profiles, proof points (unapproved) and client playbooks. It
adds no prospects: those come from your imports.

### 3.7 Stripe (optional: workspace billing)

Create three products with **price lookup keys** exactly matching
`PRICE_TO_PLAN` in `src/server/services/billing.ts`:

```
foundry_solo_monthly
foundry_agency_monthly
foundry_scale_monthly
```

Lookup keys, not price IDs — that's what the code searches on. A mismatched key
throws a clear error at checkout rather than silently assigning the wrong plan.
The keys keep their `foundry_` prefix from before the rename so existing
Stripe prices keep working. Without Stripe keys, billing shows as not
configured and everything else works.

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

### 3.8 Secrets

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

---

## 4. Running it

**Local:**
```bash
docker compose up -d db redis
npx prisma migrate deploy
npm run db:seed
npm run dev            # :3000
npm run worker         # separate terminal
```

For webhooks locally, tunnel: `npx untun tunnel http://localhost:3000` or use
`stripe listen --forward-to localhost:3000/api/webhooks/stripe`.

**Production:** deploy the app, then the same repo as the worker with
`npm run worker` and identical environment variables.

**Checks:** `npm run typecheck`, `npm run lint`, `npm test`.

---

## 5. First-run checklist

1. **Sign up → create your workspace.** The first member becomes the owner.
   If no `Organization`/`Membership` rows appear, the Clerk webhook isn't
   reaching you.
2. **Playbooks → Install starter templates.**
3. **Clients → New client.** Fill in the business profile, then add an offer,
   an ideal customer profile and proof points, and approve the proof points
   the client has confirmed. Copy a playbook to the client.
4. **Settings → Sending mailboxes.** Add the address, then **Check domain**
   until SPF and DKIM show verified.
5. **Accounts → Import** a CSV into the client. Check the mapping screen.
   Accounts are scored against the ICP as they arrive.
6. **Open an account → Research.** Look at the verified facts and the "why
   they might care" angles, each with the passage it came from.
7. **Campaigns → New.** Choose the client, ICP, offer and playbook. Start with
   **Review every email**; switch to automatic sending of verified drafts once
   you trust what you see.
8. **Accounts → select → Add to campaign**, then activate.
9. **Review queue.** Each draft lists its claims and the evidence for each.
   Approve and send one to yourself first.
10. **Call queue.** Open the top person, read the prep, make the call, log the
    outcome. Book a meeting and check it appears in the client's portal
    (**Clients → View their portal**).
11. **Team → Invite** a caller and a client user. Client users must be tied to
    their client.

---

## 6. How data actually moves

**Account → meeting:**
```
CSV import / manual / Apollo
  → Account + Contacts (deduped per client; existing customers skipped)
  → scored against the client's ICPs, with reasons
  → research: crawl → model → every fact/signal/angle must quote the page
  → campaign enrollment (best contacts per account, one live sequence each)
  → draft written from the fact ledger (facts, signals, approved proof points)
  → each claim verified: supported? contradicted? stale? approved type?
  → policy: auto-approve only if all verified + types approved + score ≥ threshold
           otherwise → review queue with the reason
  → send-gate: suppression, cooling-off, caps, SPF/DKIM, hours, opt-out link
  → Resend
  → engagement and replies feed the call queue
  → caller: prep → call → outcome → meeting → client portal
```

**Reply → sequence stops:**
```
Resend inbound webhook
  → matched to the workspace by recipient mailbox, then to the message
  → classified (positive, neutral, negative, out-of-office, referral, unsubscribe)
  → out-of-office: sequence continues; anything else stops it for the account
  → opt-out wording → suppressed on every channel
  → contact rises in the call queue if the reply warrants a call
```

**Bounce, complaint or do-not-call → suppression:**
```
webhook or call outcome → Suppression (value, channel, reason, source, time)
  → queued messages cancelled, enrollments exited, call task cancelled
  → cannot be removed in the app
```

---

## 7. Things that will bite you

**"I signed in but see nothing."** The Clerk webhook didn't create your
`Membership`. Check `WebhookEvent` for `provider = 'clerk'`.

**"A client user sees 'access is being set up'."** Their membership isn't tied
to a client. Fix it in **Team**.

**"Research keeps failing."** See **System → Research that needs attention**.
Usual causes: a JavaScript-only site, `robots.txt`, or the AI budget.

**"Nothing sends automatically."** Expected until a campaign is set to send
verified drafts, its claim types are approved, and drafts clear the threshold.
The review queue says which condition each draft missed.

**Bounce rate above 3%.** Stop and clean the list. Providers filter on this and
the damage takes weeks to undo.

---

## 8. What's deliberately not built

- **A contact database or web-scale crawler.** Relay orchestrates providers.
- **Calendar, dialer and CRM integrations.** Interfaces exist; providers don't.
  Meetings are recorded in Relay and invites sent from the caller's calendar.
- **JavaScript rendering in the crawler.** Server HTML only.
- **Predictive scoring.** Scores are rules with reasons; analytics counts
  outcomes. A learned model can replace the weights once there is enough data.
