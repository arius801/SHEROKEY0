# SHEROKEY — Final Handoff & Deployment (A–F)

> **Read this first.** This workspace ships a complete storefront + admin console with
> real domain logic (order/payment state machines, transactional license reservation,
> RBAC, idempotent webhook processing, audit trail) running on an in-browser repository
> adapter. The authoritative production layer (PostgreSQL, Argon2id sessions, provider
> SDKs, SMTP/Resend, Redis) cannot be executed inside this static build environment
> (no server runtime, no database, no network access to package registries). Every
> item below is stated exactly as it is — nothing is labeled "integrated" unless the
> executable code performs it.

---

## A. What was actually implemented (executable, verified by build)

1. **Complete product surface** — home, catalog, search, offers, product pages (SEO
   metadata + JSON-LD), cart, checkout, order results, account center (orders,
   license keys with masked reveal, wishlist, notifications, profile/security/
   preferences), support tickets, FAQ, legal pages, 404/500, full admin console.
2. **Four languages (EN/AR/RU/FR)** with automatic RTL, persisted preference.
3. **Four currencies (USD/EUR/SAR/RUB)** — integer minor units only, admin-editable
   server-authoritative FX rates, locale-aware `Intl` formatting.
4. **Order/payment domain engine** — explicit transition whitelists
   (`PENDING→REQUIRES_ACTION→AUTHORIZED→PAID→REFUNDED/PARTIALLY_REFUNDED`,
   fulfillment `PENDING→PROCESSING→DELIVERED→COMPLETED/CANCELLED`); every
   transition writes history; illegal moves throw; every mutation flows through a
   single transactional `mutate()`.
5. **License vault logic** — all-or-nothing reservation with rollback,
   `UNUSED→RESERVED→DELIVERED→USED/REVOKED`, release strictly after `PAID`,
   duplicate delivery structurally impossible, refunds revoke (never recycle) keys.
6. **Webhook processing contract** — signature gate → `(provider, eventId)`
   idempotency → amount/currency/order re-verification → fulfill exactly once.
   Signature verification uses real HMAC-SHA256 + constant-time compare (the trust
   anchor is the sandbox gateway secret; production swaps in provider schemes).
7. **Server-side repricing** — totals/coupons/tax recalculated in the service layer
   at checkout; the browser never supplies authoritative amounts.
8. **RBAC** — OWNER/ADMIN/SUPPORT/CUSTOMER matrix enforced in the service layer with
   per-resource ownership (IDOR) checks; OWNER-only payment config + role changes.
9. **Pre-payment email OTP** — crypto-random 6-digit code, salted-hash stored, 5-min
   TTL, single-use, 5-attempt cap, rate-limited issue + verify, previous-code
   invalidation, audited. Identity check only — never payment proof.
10. **Auth hardening** — salted-hash passwords, 7-day session expiry, 5-failure
    lockout, sliding-window rate limits (login, register, reset, OTP×2, checkout,
    payment, tickets), logout invalidation, full security-event audit trail
    (19 event types).
11. **Truthful provider status** — admin shows `OPERATIONAL` only when configured +
    verified (reachable only on the real server); this workspace reports
    `NOT CONFIGURED` in LIVE mode and labeled `TEST MODE` otherwise. Checkout hides
    methods the routed provider cannot process for the current currency, and blocks
    payment entirely when nothing is configured.
12. **Real deploy artifacts shipped** — `_headers` (Netlify/Cloudflare), `.htaccess`
    (Apache, HTTPS redirect + CSP/HSTS), `vercel.json`, `robots.txt`, `sitemap.xml`,
    `.env.example`, `.gitignore`, route-level code splitting (13 lazy chunks).

## B. What remains NOT CONFIGURED (missing credentials / no server in this environment)

| Item | Status | Exact reason | Exact fix |
|---|---|---|---|
| PostgreSQL + Drizzle | NOT CONFIGURED | No database exists here; workspace persists in browser storage | Provision Postgres, run the schema from `src/lib/types.ts` via Drizzle migrations |
| Argon2id + HttpOnly session cookies | NOT CONFIGURED | Requires a server process | Node server (`argon2` pkg) + `sessions` table, `HttpOnly;Secure;SameSite=Lax` |
| Stripe | NOT CONFIGURED | No `STRIPE_SECRET_KEY`, SDK cannot be installed (registry unreachable) | `stripe` SDK → PaymentIntents/Checkout server-side; `constructEvent` at `/api/webhooks/stripe` |
| PayPal | NOT CONFIGURED | No `PAYPAL_CLIENT_ID/SECRET` | Orders v2 create/capture + `verify-webhook-signature` at `/api/webhooks/paypal` |
| MIR acquirer | NOT CONFIGURED | No acquirer contract/credentials | Real MIR-compatible acquirer SDK behind the existing `MIR_ACQUIRER` adapter |
| Resend/SMTP email | NOT CONFIGURED | No `RESEND_API_KEY` | Wire the existing `sendEmail()` contract to Resend/SES/SMTP |
| Redis rate limiting | NOT CONFIGURED | No `REDIS_URL` | Replace the in-memory limiter with Upstash/Redis sliding windows |
| Vitest / Playwright suites | NOT RUN | Test runners cannot be installed here | Add suites per §37–44 of the spec; run on CI |

## C. Commands that passed

```
npm run build        ✅  (tsc enforced on every module; 0 type errors)
npm run dev          ✅  (local preview)
npm test / e2e       ⛔  not runnable in this environment (see B)
```

## D. Exact environment variables required (see `.env.example`)

`APP_URL · APP_ENV · AUTH_SECRET · COOKIE_SECURE · DATABASE_URL · REDIS_URL ·
STRIPE_PUBLISHABLE_KEY · STRIPE_SECRET_KEY · STRIPE_WEBHOOK_SECRET ·
PAYPAL_CLIENT_ID · PAYPAL_CLIENT_SECRET · PAYPAL_ENVIRONMENT ·
MIR_PROVIDER_NAME · MIR_PROVIDER_API_KEY · MIR_PROVIDER_SECRET ·
MIR_PROVIDER_WEBHOOK_SECRET · MIR_MERCHANT_ID · EMAIL_PROVIDER · EMAIL_FROM ·
RESEND_API_KEY · SMTP_HOST · SMTP_PORT · SMTP_USER · SMTP_PASS ·
S3_ENDPOINT · S3_REGION · S3_BUCKET · S3_ACCESS_KEY_ID · S3_SECRET_ACCESS_KEY`

## E. Exact webhook URLs required

```
POST https://YOUR_DOMAIN/api/webhooks/stripe    (Stripe events, constructEvent)
POST https://YOUR_DOMAIN/api/webhooks/paypal    (PayPal, verify-webhook-signature)
POST https://YOUR_DOMAIN/api/webhooks/mir       (acquirer HMAC per its docs)
```

## F. Deployment steps

1. `npm ci && npm run build` → deploy `dist/` behind any static host **or** fold the
   pages into the Next.js App Router production app (design preserved 1:1).
2. Provision PostgreSQL 16 + run migrations; enable PITR backups + monthly restore drills.
3. Create the first OWNER via a server-side CLI — never via UI or seed in production.
   (Sandbox dev accounts — owner@/admin@/support@/demo@sherokey.com — exist only in
   the in-browser seed and are never created on the real server.)
4. Fill `.env` from `.env.example`; verify no secret reaches the client bundle.
5. Register the three webhook URLs (E) with the providers; confirm test events pass
   signature verification and idempotency replay checks.
6. Run provider **test-mode** smoke: purchase→webhook→delivery; declined card;
   duplicate webhook; double-click Pay; refund; manual delivery; last-key race.
7. Switch providers to LIVE keys → the admin page will flip from TEST MODE to
   OPERATIONAL only after real configuration + connectivity verification.
8. Point DNS (e.g. sherokey.com) to the host; the shipped `_headers`/`.htaccess`/
   `vercel.json` enforce HTTPS + HSTS + CSP + nosniff + DENY framing automatically.
