/** Payment provider adapter layer.
 *
 *  Every provider — STRIPE, PAYPAL, MIR_ACQUIRER — implements the SAME contract so no
 *  provider-specific code leaks into orders/fulfillment. In production each adapter wraps
 *  the real SDK (stripe-node, @paypal/paypal-server-sdk, the MIR acquirer's API) and runs
 *  exclusively server-side. In this sandbox the adapters drive a local gateway that signs
 *  its events with real HMAC-SHA256 — the verification path is genuine; the trust anchor
 *  is simulated and must be replaced by the provider's own signature scheme. */

import type { Currency, Order, Settings } from "./types";
import { hmacHex, randomToken, sha256Hex, timingSafeEqual } from "./crypto";

export type PaymentMethod = "CARD_INTL" | "CARD_MIR" | "PAYPAL";
export type ProviderId = "STRIPE" | "PAYPAL" | "MIR_ACQUIRER";
export type GatewayResult = "captured" | "failed";

export interface ProviderCfg {
  enabled: boolean;
  mode: "TEST" | "LIVE";
  currencies: Currency[];
  /** provider operational flag — unavailable providers are hidden at checkout */
  operational: boolean;
  /** masked merchant account label only — real credentials never exist client-side */
  merchantMasked: string;
}

export interface PaymentProviders {
  STRIPE: ProviderCfg;
  PAYPAL: ProviderCfg;
  MIR_ACQUIRER: ProviderCfg;
}

/** Static capability matrix (mirrors real provider constraints). */
export const PROVIDER_META: Record<ProviderId, { label: string; currencies: Currency[]; methods: PaymentMethod[] }> = {
  STRIPE: { label: "Stripe", currencies: ["USD", "EUR", "SAR"], methods: ["CARD_INTL"] },
  PAYPAL: { label: "PayPal", currencies: ["USD", "EUR", "SAR", "RUB"], methods: ["PAYPAL"] },
  MIR_ACQUIRER: { label: "MIR Acquirer", currencies: ["RUB"], methods: ["CARD_MIR"] },
};

/** Which provider settles which payment method — owner-configurable routing (req. 5).
 *  Settlement itself always happens inside the configured acquirer/merchant account. */
export interface PaymentRouting {
  CARD_INTL: ProviderId;
  CARD_MIR: ProviderId;
  PAYPAL: ProviderId;
}

export const DEFAULT_PROVIDERS: PaymentProviders = {
  // operational: false — frontend will not consider these ready until server confirms via /api/bootstrap
  STRIPE: { enabled: false, mode: "TEST", currencies: ["USD", "EUR", "SAR"], operational: false, merchantMasked: "acct_••••7Q2F" },
  PAYPAL: { enabled: false, mode: "TEST", currencies: ["USD", "EUR", "SAR", "RUB"], operational: false, merchantMasked: "A•••@sherokey.com" },
  MIR_ACQUIRER: { enabled: false, mode: "TEST", currencies: ["RUB"], operational: false, merchantMasked: "MIR-••••0412" },
};

export const DEFAULT_ROUTING: PaymentRouting = { CARD_INTL: "STRIPE", CARD_MIR: "MIR_ACQUIRER", PAYPAL: "PAYPAL" };

export function providerCfg(s: Settings, id: ProviderId): ProviderCfg {
  return s.providers?.[id] ?? DEFAULT_PROVIDERS[id];
}

/**
 * Truthful provider status.
 *  - NOT_CONFIGURED: disabled, no currencies, or LIVE mode without server-side credentials.
 *  - TEST_READY:     explicit sandbox/test mode (clearly labeled everywhere).
 *  - OPERATIONAL:    LIVE + credentials present + connectivity verified.
 * In this static workspace no real provider credentials can exist, therefore LIVE can
 * never be reported OPERATIONAL here — that label is only reachable on the real server,
 * where the check reads env secrets and performs a live provider probe.
 */
export type ProviderStatus = "NOT_CONFIGURED" | "TEST_READY" | "OPERATIONAL";
export function providerStatus(cfg: ProviderCfg): ProviderStatus {
  if (!cfg.enabled || cfg.currencies.length === 0) return "NOT_CONFIGURED";
  if (cfg.mode === "LIVE") return "NOT_CONFIGURED"; // real credentials are server-side; impossible in this workspace
  return cfg.operational ? "TEST_READY" : "NOT_CONFIGURED";
}

/** Checkout availability (req. 7): only configured + enabled + currency-supported + operational. */
export function availableMethods(s: Settings, currency: Currency):
  { method: PaymentMethod; provider: ProviderId; reason: null | "disabled" | "currency" | "down" | "notConfigured" }[] {
  const routes: PaymentMethod[] = ["CARD_INTL", "PAYPAL", "CARD_MIR"];
  return routes.map((method) => {
    const pid = s.routing?.[method] ?? DEFAULT_ROUTING[method];
    const cfg = providerCfg(s, pid);
    const status = providerStatus(cfg);
    if (status === "NOT_CONFIGURED" && !cfg.enabled) return { method, provider: pid, reason: "disabled" as const };
    if (status === "NOT_CONFIGURED") return { method, provider: pid, reason: "notConfigured" as const };
    if (!cfg.operational) return { method, provider: pid, reason: "down" as const };
    if (!cfg.currencies.includes(currency)) return { method, provider: pid, reason: "currency" as const };
    return { method, provider: pid, reason: null };
  });
}

export const METHOD_LABEL_KEY: Record<PaymentMethod, string> = {
  CARD_INTL: "co.card", CARD_MIR: "co.mir", PAYPAL: "co.paypal",
};

/* ------------------------------------------------------------------ */
/* Signed gateway events                                               */
/* ------------------------------------------------------------------ */

export interface GatewayEvent {
  provider: ProviderId;
  providerEventId: string;
  type: "payment.captured" | "payment.failed";
  orderId: string;
  amountUsd: number;
  currency: Currency;
  providerPaymentId: string;
  signature: string;
  payload: string;
}

/** Sandbox gateway secret — in production this is the provider's signing secret and the
 *  whole module lives on the server; nothing here may ship in a real client bundle. */
const GATEWAY_SECRET = "whsec_sandbox_only_replace_with_provider_signing_secret";

function canonical(o: Record<string, unknown>): string {
  return Object.keys(o).sort().map((k) => `${k}=${String(o[k])}`).join("&");
}

export async function signEvent(e: Omit<GatewayEvent, "signature" | "payload">): Promise<GatewayEvent> {
  const payload = canonical({ t: e.type, o: e.orderId, a: e.amountUsd, c: e.currency, p: e.providerPaymentId, id: e.providerEventId });
  return { ...e, payload, signature: await hmacHex(GATEWAY_SECRET, payload) };
}

/** Real HMAC verification — an event whose signature fails never touches payment state.
 *  The signature is bound to the event's FIELDS: verification recomputes the canonical
 *  payload from the parsed fields and rejects any event whose fields diverge from the
 *  signed payload (tampered amount/order/type) as well as any bad signature. */
function eventCanonical(e: GatewayEvent): string {
  return canonical({ t: e.type, o: e.orderId, a: e.amountUsd, c: e.currency, p: e.providerPaymentId, id: e.providerEventId });
}
export async function verifyEventSignature(e: GatewayEvent): Promise<boolean> {
  const recomputed = eventCanonical(e);
  if (!timingSafeEqual(recomputed, e.payload)) return false; // field tampering vs. signed payload
  const expected = await hmacHex(GATEWAY_SECRET, recomputed);
  return timingSafeEqual(expected, e.signature);
}

export const eventPayloadHash = (e: GatewayEvent) => sha256Hex(e.payload);

/* ------------------------------------------------------------------ */
/* Sandbox round-trip per provider (production: real SDK calls)        */
/* ------------------------------------------------------------------ */

export interface ProviderAdapter {
  id: ProviderId;
  /** production: create PaymentIntent / PayPal order / acquirer session — server-side */
  createPayment(order: Order, cfg: ProviderCfg): Promise<{ providerPaymentId: string }>;
  /** production: capture/confirm + webhook delivery. Sandbox simulates the round-trip
   *  and emits a signed event; the decline heuristic only applies in TEST mode. */
  settle(order: Order, cfg: ProviderCfg, testInput?: string): Promise<GatewayEvent>;
  /** production: provider refund call; returns provider refund id */
  refund(paymentId: string, amountUsd: number): Promise<{ providerRefundId: string }>;
}

const testDeclined = (input: string | undefined) => !!input && input.replace(/\s/g, "").endsWith("0002");

function adapter(id: ProviderId): ProviderAdapter {
  return {
    id,
    async createPayment(order) {
      await new Promise((r) => setTimeout(r, 350 + Math.random() * 250));
      const prefix = id === "STRIPE" ? "pi" : id === "PAYPAL" ? "PAYID" : "MIR";
      return { providerPaymentId: `${prefix}_${randomToken(10)}` };
    },
    async settle(order, cfg, testInput) {
      await new Promise((r) => setTimeout(r, 900 + Math.random() * 600));
      const declined = cfg.mode === "TEST" && testDeclined(testInput);
      const { providerPaymentId } = await this.createPayment(order, cfg);
      return signEvent({
        provider: id,
        providerEventId: `evt_${randomToken(9)}`,
        type: declined ? "payment.failed" : "payment.captured",
        orderId: order.id,
        amountUsd: order.totalUsd,
        currency: order.currency,
        providerPaymentId,
      });
    },
    async refund(paymentId) {
      await new Promise((r) => setTimeout(r, 300));
      const prefix = id === "STRIPE" ? "re" : id === "PAYPAL" ? "REF" : "MR";
      return { providerRefundId: `${prefix}_${randomToken(8)}_${paymentId.slice(-4)}` };
    },
  };
}

export const PROVIDERS: Record<ProviderId, ProviderAdapter> = {
  STRIPE: adapter("STRIPE"),
  PAYPAL: adapter("PAYPAL"),
  MIR_ACQUIRER: adapter("MIR_ACQUIRER"),
};

/* ------------------------------------------------------------------ */
/* Payment state machine (req. 11)                                     */
/* ------------------------------------------------------------------ */

export type PaymentState =
  | "PENDING" | "REQUIRES_ACTION" | "AUTHORIZED" | "PAID"
  | "FAILED" | "CANCELLED" | "REFUNDED" | "PARTIALLY_REFUNDED";

/** Only provider-confirmed events or authorized staff actions may move a payment;
 *  PENDING → PAID from the frontend is structurally impossible. */
export const PAYMENT_FSM: Record<PaymentState, PaymentState[]> = {
  PENDING: ["REQUIRES_ACTION", "AUTHORIZED", "PAID", "FAILED", "CANCELLED"],
  REQUIRES_ACTION: ["AUTHORIZED", "PAID", "FAILED", "CANCELLED"],
  AUTHORIZED: ["PAID", "FAILED", "CANCELLED"],
  PAID: ["REFUNDED", "PARTIALLY_REFUNDED"],
  PARTIALLY_REFUNDED: ["REFUNDED"],
  FAILED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export type FulfillmentState = "PENDING" | "PROCESSING" | "DELIVERED" | "COMPLETED" | "CANCELLED";
export const FULFILL_FSM: Record<FulfillmentState, FulfillmentState[]> = {
  PENDING: ["PROCESSING", "DELIVERED", "CANCELLED"],
  PROCESSING: ["DELIVERED", "CANCELLED"],
  DELIVERED: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};
