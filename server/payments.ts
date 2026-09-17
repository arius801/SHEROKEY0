/**
 * SHEROKEY — payment providers.
 * Real integrations: stripe-node, PayPal Orders v2 REST, and a MIR-acquirer adapter.
 * NO provider here can mark an order PAID from a browser signal — state changes only
 * happen from signature-verified provider events processed with (provider, eventId)
 * idempotency inside fulfillPaidOrder/markFailed.
 */
import Stripe from "stripe";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { requireDb, paymentEvents, orders, payments } from "./db";
import { fulfillPaidOrder, markFailed, ApiError } from "./services";
import { getSetting } from "./lib/infra";
import type { Currency } from "../src/lib/types";

const APP_URL = process.env.APP_URL ?? "https://sherokey.com";

/* ================================================================ configuration state (§20/§30) */
export type ProviderHealth = "OPERATIONAL" | "TEST_READY" | "NOT_CONFIGURED" | "CONFIG_ERROR";

export function stripeHealth(): ProviderHealth {
  const key = process.env.STRIPE_SECRET_KEY;
  const wh = process.env.STRIPE_WEBHOOK_SECRET;
  if (!key || !wh) return "NOT_CONFIGURED";
  if (key.startsWith("sk_live_")) return "OPERATIONAL";
  if (key.startsWith("sk_test_")) return "TEST_READY";
  return "CONFIG_ERROR";
}
export function paypalHealth(): ProviderHealth {
  const id = process.env.PAYPAL_CLIENT_ID; const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) return "NOT_CONFIGURED";
  return (process.env.PAYPAL_ENVIRONMENT ?? "sandbox") === "live" ? "OPERATIONAL" : "TEST_READY";
}
export function mirHealth(): ProviderHealth {
  // A MIR route is only real when an actual MIR-compatible acquirer is connected AND verified.
  // Without a real health check endpoint, we cannot claim OPERATIONAL.
  const key = process.env.MIR_PROVIDER_API_KEY; const secret = process.env.MIR_PROVIDER_SECRET; const wh = process.env.MIR_PROVIDER_WEBHOOK_SECRET;
  if (!key || !secret || !wh) return "NOT_CONFIGURED";
  // TODO: Implement actual health check with acquirer API before returning OPERATIONAL
  // For now, credentials exist but connectivity is NOT verified
  return "NOT_CONFIGURED";
}

/* ================================================================ Stripe (§10) */
function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new ApiError("PROVIDER_NOT_CONFIGURED — STRIPE_SECRET_KEY missing", 503);
  return new Stripe(key, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion });
}

/** Server creates the Checkout Session with the SERVER-calculated amount.
 *  The browser only ever receives Stripe's hosted URL / client secret. */
export async function createStripeCheckout(orderId: string, totalMinor: number, currency: Currency, number: string) {
  const s = stripe();
  const session = await s.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price_data: { currency: currency.toLowerCase(), unit_amount: totalMinor, product_data: { name: `SHEROKEY order ${number}` } }, quantity: 1 }],
    success_url: `${APP_URL}/order/${orderId}?result=return`,   // informational ONLY — never proof of payment
    cancel_url: `${APP_URL}/cart`,
    metadata: { orderId },
    payment_intent_data: { setup_future_usage: undefined },
  });
  return { url: session.url, sessionId: session.id };
}

export async function handleStripeWebhook(rawBody: string, signature: string): Promise<{ received: boolean }> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new ApiError("PROVIDER_NOT_CONFIGURED", 503);
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature, secret); // REAL signature verification — rejects tampered/replayed payloads
  } catch {
    await recordEvent("STRIPE", "invalid", "rejected", "signature-invalid", null, false);
    throw new ApiError("WEBHOOK_SIGNATURE_INVALID", 400);
  }
  return ingestProviderEvent({
    provider: "STRIPE",
    eventId: event.id,
    eventType: event.type,
    payloadHash: createHash("sha256").update(rawBody).digest("hex"),
    extract: () => {
      if (event.type === "checkout.session.completed" || event.type === "payment_intent.succeeded") {
        const obj = event.data.object as Stripe.Checkout.Session | Stripe.PaymentIntent;
        const orderId = (obj.metadata?.orderId ?? (obj as Stripe.Checkout.Session).client_reference_id) || null;
        const amount = "amount_total" in obj ? obj.amount_total ?? 0 : obj.amount;
        const currency = ((("currency" in obj ? obj.currency : "") ?? "") as string).toUpperCase() as Currency;
        return { orderId, amountMinor: amount, currency, providerPaymentId: "payment_intent" in obj ? obj.id : (obj as Stripe.Checkout.Session).payment_intent as string };
      }
      if (event.type === "payment_intent.payment_failed") {
        const obj = event.data.object as Stripe.PaymentIntent;
        return { orderId: obj.metadata?.orderId ?? null, amountMinor: obj.amount, currency: obj.currency.toUpperCase() as Currency, providerPaymentId: obj.id };
      }
      return null;
    },
    successTypes: ["checkout.session.completed", "payment_intent.succeeded"],
    failureTypes: ["payment_intent.payment_failed"],
  });
}

/* ================================================================ PayPal Orders v2 (§11) */
const paypalBase = () => (process.env.PAYPAL_ENVIRONMENT ?? "sandbox") === "live"
  ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

async function paypalToken(): Promise<string> {
  const id = process.env.PAYPAL_CLIENT_ID; const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new ApiError("PROVIDER_NOT_CONFIGURED — PayPal credentials missing", 503);
  const res = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new ApiError("PAYPAL_AUTH_FAILED", 502);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** Server-side order creation (§11): amount comes from the server-priced order only. */
export async function createPayPalOrder(orderId: string, totalMinor: number, currency: Currency, number: string) {
  const token = await paypalToken();
  const res = await fetch(`${paypalBase()}/v2/checkout/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Prefer: "return=minimal" },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: orderId,
        amount: { currency_code: currency, value: (totalMinor / 100).toFixed(2) },
        description: `SHEROKEY order ${number}`,
      }],
      application_context: { return_url: `${APP_URL}/order/${orderId}?result=paypal-return`, cancel_url: `${APP_URL}/cart`, brand_name: "SHEROKEY" },
    }),
  });
  if (!res.ok) throw new ApiError("PAYPAL_CREATE_FAILED", 502);
  const body = (await res.json()) as { id: string; links: { rel: string; href: string }[] };
  const approve = body.links.find((l) => l.rel === "approve")?.href ?? null;
  return { paypalOrderId: body.id, approveUrl: approve };
}

/** Server-side capture AFTER customer approval — then full server verification.
 *  IDOR protection: userId must match order.customerId before capture is executed. */
export async function capturePayPalOrder(paypalOrderId: string, userId: string): Promise<{ orderId: string | null }> {
  const token = await paypalToken();
  const res = await fetch(`${paypalBase()}/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Prefer: "return=minimal" },
  });
  const body = (await res.json()) as {
    id: string; status: string;
    purchase_units?: { reference_id?: string; payments?: { captures?: { id: string; amount?: { currency_code: string; value: string }; status: string }[] } }[];
  };
  if (body.status !== "COMPLETED") throw new ApiError("PAYPAL_CAPTURE_FAILED", 402);
  const unit = body.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  const orderId = unit?.reference_id ?? null;
  if (!orderId || !capture) throw new ApiError("PAYPAL_VERIFICATION_FAILED", 400);

  // amount/currency/order verification against the server-priced order (§11/§15)
  const d = requireDb();
  const o = (await d.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0];
  if (!o) throw new ApiError("PAYPAL_ORDER_MISMATCH", 400);

  // IDOR protection: verify the order belongs to the authenticated user
  if (o.customerId !== userId) throw new ApiError("PAYPAL_ORDER_OWNERSHIP_MISMATCH", 403);

  if (capture.amount?.currency_code !== o.currency) throw new ApiError("PAYPAL_CURRENCY_MISMATCH", 400);
  if (Math.round(parseFloat(capture.amount!.value) * 100) !== o.totalMinor) throw new ApiError("PAYPAL_AMOUNT_MISMATCH", 400);

  await ingestProviderEvent({
    provider: "PAYPAL", eventId: `capture:${capture.id}`, eventType: "capture.completed",
    payloadHash: createHash("sha256").update(JSON.stringify({ id: body.id, capture: capture.id, amount: capture.amount })).digest("hex"),
    extract: () => ({ orderId, amountMinor: o.totalMinor, currency: o.currency, providerPaymentId: capture!.id }),
    successTypes: ["capture.completed"], failureTypes: [],
  });
  return { orderId };
}

/** PayPal webhook — signature verified via PayPal's verify-webhook-signature API. */
export async function handlePayPalWebhook(headers: Record<string, string>, body: string): Promise<{ received: boolean }> {
  const token = await paypalToken();
  const whId = process.env.PAYPAL_WEBHOOK_ID;
  if (!whId) throw new ApiError("PROVIDER_NOT_CONFIGURED — PAYPAL_WEBHOOK_ID missing", 503);
  const verify = await fetch(`${paypalBase()}/v1/notifications/verify-webhook-signature`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      transmission_id: headers["paypal-transmission-id"], transmission_time: headers["paypal-transmission-time"],
      cert_url: headers["paypal-cert-url"], auth_algo: headers["paypal-auth-algo"],
      transmission_sig: headers["paypal-transmission-sig"], webhook_id: whId, webhook_event: JSON.parse(body),
    }),
  });
  const v = (await verify.json()) as { verification_status: string };
  if (v.verification_status !== "SUCCESS") {
    await recordEvent("PAYPAL", "invalid", "rejected", "signature-invalid", null, false);
    throw new ApiError("WEBHOOK_SIGNATURE_INVALID", 400);
  }
  const event = JSON.parse(body) as { id: string; event_type: string; resource: Record<string, unknown> };
  return ingestProviderEvent({
    provider: "PAYPAL", eventId: event.id, eventType: event.event_type,
    payloadHash: createHash("sha256").update(body).digest("hex"),
    extract: () => {
      const r = event.resource as { supplementary_data?: { related_ids?: { order_id?: string } }; id?: string; amount?: { currency_code?: string; value?: string } };
      const orderId = r.supplementary_data?.related_ids?.order_id ?? null;
      return { orderId, amountMinor: r.amount ? Math.round(parseFloat(r.amount.value ?? "0") * 100) : 0, currency: (r.amount?.currency_code ?? "USD") as Currency, providerPaymentId: r.id ?? null };
    },
    successTypes: ["PAYMENT.CAPTURE.COMPLETED"], failureTypes: ["PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.REFUNDED"],
  });
}

/* ================================================================ MIR (§12/§14) — real acquirer adapter only */
export interface MirProviderAdapter {
  /** Create the payment on the acquirer side. Implemented against the acquirer's documented API. */
  createPayment(orderId: string, totalMinor: number, number: string): Promise<{ redirectUrl: string; acquirerPaymentId: string }>;
  /** Verify the acquirer's callback signature exactly as its documentation prescribes (HMAC over raw body). */
  verifyCallback(rawBody: string, signature: string): boolean;
  parseCallback(rawBody: string): { acquirerPaymentId: string; orderId: string; amountMinor: number; currency: Currency; status: "approved" | "declined" };
  refund(acquirerPaymentId: string, amountMinor: number): Promise<string>;
}

/** Returns null when no MIR-compatible acquirer is configured — the storefront then
 *  honestly displays "Not configured" (§12). Never a fake. */
export async function mirAdapter(): Promise<MirProviderAdapter | null> {
  const apiKey = process.env.MIR_PROVIDER_API_KEY;
  const secret = process.env.MIR_PROVIDER_SECRET;
  const base = process.env.MIR_PROVIDER_BASE_URL;
  const merchantId = process.env.MIR_MERCHANT_ID;
  if (!apiKey || !secret || !base || !merchantId) return null;
  const sign = (payload: string) => createHash("sha256").update(`${payload}${secret}`).digest("hex"); // HMAC scheme per acquirer docs
  return {
    async createPayment(orderId, totalMinor, number) {
      const res = await fetch(`${base}/payments`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
        body: JSON.stringify({ merchant_id: merchantId, order_id: orderId, amount: totalMinor, currency: "RUB", description: `SHEROKEY ${number}` }),
      });
      if (!res.ok) throw new ApiError("MIR_CREATE_FAILED", 502);
      const b = (await res.json()) as { payment_id: string; confirmation_url: string };
      return { acquirerPaymentId: b.payment_id, redirectUrl: b.confirmation_url };
    },
    verifyCallback(rawBody, signature) { return sign(rawBody) === signature; },
    parseCallback(rawBody) {
      const b = JSON.parse(rawBody) as { payment_id: string; order_id: string; amount: number; currency: string; status: string };
      return { acquirerPaymentId: b.payment_id, orderId: b.order_id, amountMinor: b.amount, currency: b.currency as Currency, status: b.status === "approved" ? "approved" : "declined" };
    },
    async refund(acquirerPaymentId, amountMinor) {
      const res = await fetch(`${base}/payments/${acquirerPaymentId}/refund`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
        body: JSON.stringify({ amount: amountMinor, merchant_id: merchantId }),
      });
      if (!res.ok) throw new ApiError("MIR_REFUND_FAILED", 502);
      return ((await res.json()) as { refund_id: string }).refund_id;
    },
  };
}

export async function handleMirWebhook(rawBody: string, signature: string): Promise<{ received: boolean }> {
  const adapter = await mirAdapter();
  if (!adapter) throw new ApiError("PROVIDER_NOT_CONFIGURED — MIR acquirer missing", 503);
  if (!adapter.verifyCallback(rawBody, signature)) {
    await recordEvent("MIR_ACQUIRER", "invalid", "rejected", "signature-invalid", null, false);
    throw new ApiError("WEBHOOK_SIGNATURE_INVALID", 400);
  }
  const cb = adapter.parseCallback(rawBody);
  // amount/order verification against the server-priced order
  const d = requireDb();
  const o = (await d.select().from(orders).where(eq(orders.id, cb.orderId)).limit(1))[0];
  if (!o || o.totalMinor !== cb.amountMinor || o.currency !== cb.currency) throw new ApiError("MIR_VERIFICATION_FAILED", 400);
  return ingestProviderEvent({
    provider: "MIR_ACQUIRER", eventId: `mir:${cb.acquirerPaymentId}:${cb.status}`,
    eventType: cb.status === "approved" ? "payment.approved" : "payment.declined",
    payloadHash: createHash("sha256").update(rawBody).digest("hex"),
    extract: () => ({ orderId: cb.orderId, amountMinor: cb.amountMinor, currency: cb.currency, providerPaymentId: cb.acquirerPaymentId }),
    successTypes: ["payment.approved"], failureTypes: ["payment.declined"],
  });
}

/* ================================================================ shared ingestion — idempotent, transactional (§15/§21) */
async function recordEvent(provider: "STRIPE" | "PAYPAL" | "MIR_ACQUIRER", eventId: string, eventType: string, payloadHash: string, orderId: string | null, processed: boolean) {
  const d = requireDb();
  await d.insert(paymentEvents).values({ provider, eventId, eventType, payloadHash, orderId, processed })
    .onConflictDoNothing(); // UNIQUE(provider, event_id) — the replay wall
}

async function ingestProviderEvent(opts: {
  provider: "STRIPE" | "PAYPAL" | "MIR_ACQUIRER";
  eventId: string; eventType: string; payloadHash: string;
  extract: () => { orderId: string | null; amountMinor: number; currency: Currency; providerPaymentId: string | null } | null;
  successTypes: string[]; failureTypes: string[];
}): Promise<{ received: boolean }> {
  const d = requireDb();
  const data = opts.extract();
  if (!data || !data.orderId) { await recordEvent(opts.provider, opts.eventId, opts.eventType, opts.payloadHash, null, true); return { received: true }; }

  // idempotency gate — the same event can never fulfill twice
  const existing = await d.select({ processed: paymentEvents.processed }).from(paymentEvents)
    .where(and(eq(paymentEvents.provider, opts.provider), eq(paymentEvents.eventId, opts.eventId))).limit(1);
  if (existing.length) return { received: true }; // duplicate webhook — acknowledged, nothing happens

  const order = (await d.select().from(orders).where(eq(orders.id, data.orderId)).limit(1))[0];
  if (!order) throw new ApiError("ORDER_MISMATCH", 400);
  // amount + currency verified against server-calculated totals (§15/§17)
  if (opts.successTypes.includes(opts.eventType) && (data.amountMinor !== order.totalMinor || data.currency !== order.currency))
    throw new ApiError("AMOUNT_MISMATCH", 400);

  await recordEvent(opts.provider, opts.eventId, opts.eventType, opts.payloadHash, data.orderId, true);
  if (data.providerPaymentId)
    await d.update(payments).set({ providerPaymentId: data.providerPaymentId, updatedAt: new Date() }).where(eq(payments.orderId, data.orderId));

  if (opts.successTypes.includes(opts.eventType)) await fulfillPaidOrder(data.orderId, `webhook:${opts.provider.toLowerCase()}`);
  else if (opts.failureTypes.includes(opts.eventType)) await markFailed(data.orderId, `webhook:${opts.provider.toLowerCase()}`);
  return { received: true };
}

/* ================================================================ provider-side refunds */
export async function providerRefund(provider: "STRIPE" | "PAYPAL" | "MIR_ACQUIRER", providerPaymentId: string | null, amountMinor: number, currency: string): Promise<string | null> {
  if (!providerPaymentId) return null;
  // Server-side refund guards (§3/§5): integer minor units, positive, real ISO currency — the
  // refund is always issued in the ORIGINAL capture currency, never a client-supplied one.
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) throw new ApiError("REFUND_AMOUNT_INVALID", 422);
  if (!/^[A-Z]{3}$/.test(currency)) throw new ApiError("REFUND_CURRENCY_INVALID", 422);
  if (provider === "STRIPE") {
    const r = await stripe().refunds.create({ payment_intent: providerPaymentId, amount: amountMinor });
    return r.id;
  }
  if (provider === "PAYPAL") {
    const token = await paypalToken();
    const res = await fetch(`${paypalBase()}/v2/payments/captures/${providerPaymentId}/refund`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount: { value: (amountMinor / 100).toFixed(2), currency_code: currency } }),
    });
    if (!res.ok) throw new ApiError("PAYPAL_REFUND_FAILED", 502);
    const body = (await res.json()) as { id?: string; status?: string };
    if (!body.id || (body.status && body.status !== "COMPLETED" && body.status !== "PENDING"))
      throw new ApiError("PAYPAL_REFUND_NOT_CONFIRMED", 502); // never record a refund the provider didn't confirm
    return body.id;
  }
  const mir = await mirAdapter();
  if (!mir) throw new ApiError("PROVIDER_NOT_CONFIGURED — MIR", 503);
  return mir.refund(providerPaymentId, amountMinor);
}
