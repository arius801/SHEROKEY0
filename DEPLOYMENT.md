# SHEROKEY — Production Deployment Guide

> **Honesty note.** This repository contains the complete storefront, admin console,
> and the *service contracts* (pricing engine, order/fulfillment state machines,
> RBAC matrix, idempotent webhook processing, transactional key reservation)
> running against an in-browser repository adapter. The authoritative production
> layer — PostgreSQL, Argon2id sessions, provider SDKs, SMTP/Resend delivery,
> Redis rate limiting — must be deployed as a real server (Next.js App Router or
> equivalent) behind the same contracts. **Nothing in this static build talks to
> a real bank, provider, or database, and it must not be presented as doing so.**

---

## 1. Target architecture

```
Browser (this UI, preserved)
   │  HTTPS only
Next.js App Router (TypeScript strict)
   ├─ Server Actions / Route Handlers   ← Zod validation + RBAC at every entry
   ├─ Drizzle ORM → PostgreSQL 16       ← authoritative data
   ├─ argon2id + sessions table         ← HttpOnly/Secure/SameSite=Lax cookies
   ├─ Upstash Redis                     ← rate limits, webhook idempotency
   ├─ stripe-node / paypal-server-sdk / MIR acquirer SDK   (server-side only)
   ├─ Resend (or SES/SMTP)              ← transactional email
   └─ S3/R2 + presigned URLs            ← media & delivery assets
```

## 2. Database

Run the Drizzle migrations that mirror `src/lib/types.ts` 1:1. Core tables:
`users, sessions, email_verification_tokens, password_reset_tokens, products,
product_translations, categories, license_keys, carts, cart_items, orders,
order_items, order_status_history, payments, payment_events
(UNIQUE(provider, provider_event_id)), refunds, coupons, coupon_redemptions,
reviews, wishlists, notifications, support_tickets, support_ticket_messages,
email_logs, audit_logs, settings`.

Money is stored as **BIGINT minor units**; prices are recalculated
server-side at checkout — the browser is never trusted for amounts.

## 3. Webhook endpoints

| Provider | URL | Verification |
|---|---|---|
| Stripe | `POST /api/webhooks/stripe` | `stripe.webhooks.constructEvent` with `STRIPE_WEBHOOK_SECRET` |
| PayPal | `POST /api/webhooks/paypal` | `verify-webhook-signature` API call |
| MIR acquirer | `POST /api/webhooks/mir` | provider HMAC per its docs |

All three feed the **same** `processPaymentEvent()` contract already in
`src/state/store.tsx`: signature gate → `(provider, eventId)` idempotency →
amount/currency/order re-verification → `PAID` → fulfill exactly once.

## 4. Fulfillment guarantee

Keys are reserved with `SELECT … FOR UPDATE SKIP LOCKED` inside the same
transaction that flips the order to `PAID`. Manual delivery remains hard-gated
on `paymentStatus === 'PAID'`. No client signal can release a key.

## 5. Deploy checklist

1. `npm ci && npm run build`
2. Provision PostgreSQL + run migrations; enable PITR backups + monthly restore drills
3. Create the first OWNER via a server-side CLI (`scripts/create-owner.ts`) —
   **never** via UI or seed in production
4. Set every variable from `.env.example`; confirm none are bundled client-side
5. Register the three webhook URLs with the providers; verify test events
6. Put the domain behind HTTPS with HSTS + CSP + `X-Content-Type-Options` headers
7. Smoke test in provider **test modes**: purchase → webhook → delivery;
   declined card; duplicate webhook replay; refund; manual delivery
8. Switch providers to live keys, flip `APP_ENV=production`

## 6. Development-only seed credentials (this sandbox)

These exist **only** in the browser sandbox seed (`src/lib/seed.ts`) so the
workspace is usable; they are never seeded in production:

| Role | Email | Password |
|---|---|---|
| OWNER | owner@sherokey.com | Owner@2024 |
| ADMIN | admin@sherokey.com | Admin@2024 |
| SUPPORT | support@sherokey.com | Support@2024 |
| CUSTOMER | demo@sherokey.com | Demo@2024 |

Test-mode gateway behavior (TEST providers only): a card ending `0002`
declines; any other 16-digit card captures.

## 7. Remaining production blockers (do not ship without these)

| Severity | Blocker |
|---|---|
| CRITICAL | PostgreSQL + Drizzle as authoritative store (browser storage today) |
| CRITICAL | Server sessions (argon2id, HttpOnly cookies) |
| CRITICAL | Real Stripe/PayPal/MIR SDK calls + provider-signed webhooks |
| HIGH | Real email provider delivery (Resend/SES/SMTP) |
| HIGH | Redis-backed rate limiting + server-side Zod |
| HIGH | Vitest/Playwright suite incl. concurrency tests |
| MEDIUM | SSR/Next.js for indexable routes, sitemap, OG meta at the edge |
| MEDIUM | S3/R2 media pipeline + edge security headers |
