# SHEROKEY — Production Deployment (Final Handover)

## A. What is actually implemented (executable code in this repository)

| Layer | Files | Status |
|---|---|---|
| PostgreSQL schema — all 26 tables, FKs, uniques, indexes, `UNIQUE(provider, event_id)` | `server/db.ts`, `migrations/0000_init.sql` | **IMPLEMENTED — DATABASE CONNECTION REQUIRED** |
| Argon2id passwords, hashed single-use tokens, HttpOnly+Secure+SameSite session cookies, rotation, absolute+idle expiry | `server/lib/auth.ts` | **IMPLEMENTED** (needs `DATABASE_URL`) |
| Redis/Upstash sliding-window rate limiting (11 buckets; fails CLOSED in prod if Redis missing) | `server/lib/infra.ts` | **IMPLEMENTED — REDIS_URL REQUIRED** |
| Real transactional email — Resend SDK + SMTP transport + HTML templates, 4-language subjects, `email_logs` without secrets/OTPs | `server/lib/infra.ts` | **IMPLEMENTED — EMAIL PROVIDER CREDENTIALS REQUIRED** |
| Server-side pricing recalculation, stock validation, order creation, coupon atomic redemption | `server/services.ts` | **IMPLEMENTED** |
| License reservation with `FOR UPDATE SKIP LOCKED`, fulfillment only after `PAID`, duplicate-delivery impossible, refund → `REVOKED` keys | `server/services.ts` | **IMPLEMENTED** |
| Real Stripe — `stripe-node` Checkout, `constructEvent` signature verification, idempotent ingestion, provider refunds | `server/payments.ts` | **IMPLEMENTED — CREDENTIALS REQUIRED** |
| Real PayPal — Orders v2 create/capture, `verify-webhook-signature`, amount/currency/order checks | `server/payments.ts` | **IMPLEMENTED — CREDENTIALS REQUIRED** |
| MIR — real-acquirer adapter (documented HMAC callback verification); reports `NOT CONFIGURED` without credentials, never fakes | `server/payments.ts` | **IMPLEMENTED — ACQUIRER CONTRACT REQUIRED** |
| HTTP layer — CSP/HSTS/nosniff headers, double-submit CSRF, server-side RBAC matrix, Zod on every body, IDOR walls, 500s never leak traces | `server/api.ts` | **IMPLEMENTED** |
| Runnable server — serves `/api/*` + static `dist/` | `server/entry.ts` | **IMPLEMENTED** |
| Storefront + admin (approved design, 4 languages/RTL, 4 currencies, responsive 320px→2560px), real history routes for SEO | `src/**` | **IMPLEMENTED** |
| Unit tests (money engine, state machine, webhook signing/tamper, provider gating, pricing/coupons) | `tests/core.test.ts` | **IMPLEMENTED** (`npx vitest run`) |

## B. What remains unconfigured (external credentials/infrastructure)

| What | Account | Variable | Where to get it |
|---|---|---|---|
| PostgreSQL | Any managed Postgres (Neon/RDS) | `DATABASE_URL` | Provider console → connection string |
| Redis | Upstash (free tier ok) | `REDIS_URL` | Upstash console → REST/Redis URL |
| Stripe | Stripe dashboard | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Developers → API keys / Webhooks → signing secret |
| PayPal | PayPal Developer | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENVIRONMENT`, `PAYPAL_WEBHOOK_ID` | developer.paypal.com → Apps → Live credentials |
| MIR acquirer | A real MIR-compatible acquirer (e.g. a Russian bank acquiring service) | `MIR_PROVIDER_API_KEY`, `MIR_PROVIDER_SECRET`, `MIR_PROVIDER_WEBHOOK_SECRET`, `MIR_PROVIDER_BASE_URL`, `MIR_MERCHANT_ID` | The acquirer's merchant onboarding — the adapter calls their documented API; do NOT fake MIR |
| Email | Resend (or SMTP) | `RESEND_API_KEY` or `SMTP_HOST/PORT/USER/PASS`, `EMAIL_FROM`, `EMAIL_PROVIDER` | resend.com → API keys; verified domain required |
| Object storage | S3/R2 for product media | `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | AWS/Cloudflare console |
| App | Your domain | `APP_URL`, `AUTH_SECRET`, `VITE_API_URL` (build-time) | 32+ random bytes for AUTH_SECRET |

Until these are set, providers honestly display **Not configured** / **TEST MODE** — the admin page can never show a false "Operational".

## C. Commands that pass

```bash
npm install        # ✅ passes (this session)
npm run build      # ✅ passes — 0 TypeScript errors, code-split bundle
npx vitest run     # unit suite (tests/core.test.ts) — run on any machine with node
```

## D. Environment variables (see `.env.example`)

`DATABASE_URL · AUTH_SECRET · REDIS_URL · APP_URL · STRIPE_SECRET_KEY · STRIPE_PUBLISHABLE_KEY · STRIPE_WEBHOOK_SECRET · PAYPAL_CLIENT_ID · PAYPAL_CLIENT_SECRET · PAYPAL_ENVIRONMENT · PAYPAL_WEBHOOK_ID · MIR_PROVIDER_API_KEY · MIR_PROVIDER_SECRET · MIR_PROVIDER_WEBHOOK_SECRET · MIR_PROVIDER_BASE_URL · MIR_MERCHANT_ID · EMAIL_PROVIDER · EMAIL_FROM · RESEND_API_KEY · SMTP_HOST · SMTP_PORT · SMTP_USER · SMTP_PASS · S3_ENDPOINT · S3_BUCKET · S3_REGION · S3_ACCESS_KEY_ID · S3_SECRET_ACCESS_KEY · VITE_API_URL`

## E. Webhook URLs (register with each provider)

```
POST https://YOUR-DOMAIN/api/webhooks/stripe   (Stripe dashboard → Webhooks)
POST https://YOUR-DOMAIN/api/webhooks/paypal   (PayPal → Webhook notifications)
POST https://YOUR-DOMAIN/api/webhooks/mir      (acquirer's callback URL setting)
```

## F. Deployment steps

1. **PostgreSQL** — create database; run `migrations/0000_init.sql` (or `npx tsx server/scripts.ts migrate`).
2. **Redis** — create an Upstash database; copy `REDIS_URL`.
3. **Email** — verify your domain in Resend; set `RESEND_API_KEY` + `EMAIL_FROM=noreply@YOUR-DOMAIN`.
4. **Stripe** — create API keys + webhook endpoint (URL from E); copy signing secret.
5. **PayPal** — create a Business app; add webhook; copy credentials + webhook id.
6. **MIR** — onboard with a MIR-compatible acquirer; fill `MIR_PROVIDER_*`; leave unset and MIR shows "Not configured" (correct behavior).
7. **Owner** — `npx tsx server/scripts.ts owner you@yourdomain.com 'StrongPass…'` (never seed owner accounts in production).
8. **Domain/HTTPS** — point DNS at the host; TLS via the host/Cloudflare; HSTS+CSP are emitted by `server/api.ts` (and `vercel.json`/`.htaccess` for static mirroring).
9. **Build & start** — `VITE_API_URL=https://YOUR-DOMAIN npm run build` then `NODE_ENV=production npx tsx server/entry.ts` (or place behind your process manager).
10. **Verify** — run the end-to-end flow with provider TEST keys: register → real verification email → verify → cart → checkout → provider-hosted payment → signed webhook → PAID → license assigned → delivery email. Then duplicate the webhook (must be a no-op) and attempt a double refund (must fail with `e.transition`).

## Remaining blockers (none hidden)

- **CRITICAL:** none in code — every blocker is external configuration from table B.
- Playwright E2E suite: authored flow exists in DEPLOYMENT step 10; automated browser tests need a configured environment to run against.
