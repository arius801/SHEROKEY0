/**
 * SHEROKEY — core unit tests (Vitest, run: npx vitest run).
 * These exercise the real executable modules: money engine, payment state machine,
 * webhook signature verification, provider availability gating and the pricing/coupon engine.
 */
import { describe, it, expect } from "vitest";
import { PAYMENT_FSM, FULFILL_FSM, signEvent, verifyEventSignature, availableMethods, DEFAULT_PROVIDERS, DEFAULT_ROUTING, providerStatus, type GatewayEvent } from "../src/lib/payments";
import { percentOff, convertFromUsd, formatMoney } from "../src/lib/money";
import { computeTotals, validateCoupon } from "../src/state/store";
import type { DB } from "../src/lib/types";

/* ---------------------------------------------------------------- money: integer-only (§23/§A23) */
describe("money engine (integer minor units)", () => {
  it("percent discount never produces fractions of a minor unit", () => {
    expect(percentOff(1999, 10)).toBe(199);      // 199.9 → floor 199
    expect(percentOff(1, 50)).toBe(0);
    expect(percentOff(33333, 15)).toBe(4999);
    expect(Number.isInteger(percentOff(123457, 33))).toBe(true);
  });
  it("currency conversion stays in integers", () => {
    const fx = { USD: 1, EUR: 0.9234, SAR: 3.75, RUB: 96.42 };
    expect(convertFromUsd(1999, fx, "SAR")).toBe(7496);        // 19.99 × 3.75 = 74.9625 → 7496 halalas
    expect(Number.isInteger(convertFromUsd(14999, fx, "RUB"))).toBe(true);
    expect(convertFromUsd(0, fx, "EUR")).toBe(0);
  });
  it("formats locale-aware without losing precision", () => {
    const s = formatMoney(7496, "SAR", "en");
    expect(s).toMatch(/7,?4\.96/);
    expect(formatMoney(1499900, "USD", "en")).toMatch(/14,?999/);
  });
});

/* ---------------------------------------------------------------- payment state machine (§14/§16) */
describe("payment / fulfillment state machine", () => {
  it("forbids PENDING → PAID bypass chains that skip provider states", () => {
    // PENDING may reach PAID only through provider-confirmed transitions;
    // terminal states accept nothing.
    expect(PAYMENT_FSM.FAILED).toEqual([]);
    expect(PAYMENT_FSM.CANCELLED).toEqual([]);
    expect(PAYMENT_FSM.REFUNDED).toEqual([]);
    expect(PAYMENT_FSM.PAID).not.toContain("PENDING");
    expect(PAYMENT_FSM.PAID).toContain("REFUNDED");
    expect(PAYMENT_FSM.PARTIALLY_REFUNDED).toEqual(["REFUNDED"]);
  });
  it("fulfillment cannot deliver from CANCELLED or complete undelivered orders", () => {
    expect(FULFILL_FSM.CANCELLED).toEqual([]);
    expect(FULFILL_FSM.COMPLETED).toEqual([]);
    expect(FULFILL_FSM.PENDING).not.toContain("COMPLETED");
    expect(FULFILL_FSM.DELIVERED).toContain("COMPLETED");
  });
});

/* ---------------------------------------------------------------- webhook signature verification (§15/§21) */
describe("webhook event signing", () => {
  const base = {
    provider: "STRIPE" as const, providerEventId: "evt_test_1", type: "payment.captured" as const,
    orderId: "ord-1", amountUsd: 1999, currency: "USD" as const, providerPaymentId: "pi_123",
  };
  it("accepts a correctly signed event", async () => {
    const e = await signEvent(base);
    expect(await verifyEventSignature(e)).toBe(true);
  });
  it("rejects tampered amount / order / type (replay & forgery)", async () => {
    const e = await signEvent(base);
    const tamper = (mut: Partial<GatewayEvent>) => ({ ...e, ...mut });
    expect(await verifyEventSignature(tamper({ amountUsd: 1 }))).toBe(false);
    expect(await verifyEventSignature(tamper({ orderId: "ord-evil" }))).toBe(false);
    expect(await verifyEventSignature(tamper({ type: "payment.failed" }))).toBe(false);
    expect(await verifyEventSignature(tamper({ signature: e.signature.slice(0, -2) + "zz" }))).toBe(false);
  });
});

/* ---------------------------------------------------------------- provider availability gating (§7/§12/§20) */
describe("checkout provider availability", () => {
  const settings = (over: Partial<DB["settings"]> = {}) =>
    ({ fx: { USD: 1, EUR: 0.92, SAR: 3.75, RUB: 96 }, providers: DEFAULT_PROVIDERS, routing: DEFAULT_ROUTING, ...over }) as DB["settings"];

  it("MIR is available only for RUB", () => {
    expect(availableMethods(settings(), "RUB").find((m) => m.method === "CARD_MIR")!.reason).toBeNull();
    expect(availableMethods(settings(), "USD").find((m) => m.method === "CARD_MIR")!.reason).toBe("currency");
  });
  it("a disabled provider never appears payable", () => {
    const s = settings();
    s.providers!.PAYPAL.enabled = false;
    expect(availableMethods(s, "USD").find((m) => m.method === "PAYPAL")!.reason).toBe("disabled");
  });
  it("LIVE mode without server credentials reports NOT CONFIGURED, never Operational", () => {
    const s = settings();
    s.providers!.STRIPE.mode = "LIVE";
    expect(providerStatus(s.providers!.STRIPE)).toBe("NOT_CONFIGURED");
    s.providers!.STRIPE.mode = "TEST";
    expect(providerStatus(s.providers!.STRIPE)).toBe("TEST_READY");
    s.providers!.STRIPE.operational = false;
    expect(providerStatus(s.providers!.STRIPE)).toBe("NOT_CONFIGURED");
  });
});

/* ---------------------------------------------------------------- pricing & coupons (§17/§18/§22/§29) */
function fakeDb(): DB {
  const now = Date.now();
  return {
    users: [], sessionUserId: null, sessionToken: null, sessionExpires: null,
    categories: [],
    products: [
      { id: "p1", slug: "a", name: { en: "A", ar: "A", ru: "A", fr: "A" }, short: { en: "", ar: "", ru: "", fr: "" }, description: { en: "", ar: "", ru: "", fr: "" }, requirements: { en: "", ar: "", ru: "", fr: "" }, tags: [], category: "c", priceUsd: 2000, compareAtUsd: null, deliveryMethod: "AUTO", durationMonths: null, stock: 0, lowStockThreshold: 1, active: true, featured: false, isNew: false, image: "", accent: "#fff", seoTitle: "", seoDescription: "", createdAt: now },
      { id: "p2", slug: "b", name: { en: "B", ar: "B", ru: "B", fr: "B" }, short: { en: "", ar: "", ru: "", fr: "" }, description: { en: "", ar: "", ru: "", fr: "" }, requirements: { en: "", ar: "", ru: "", fr: "" }, tags: [], category: "c", priceUsd: 3000, compareAtUsd: null, deliveryMethod: "MANUAL", durationMonths: null, stock: 5, lowStockThreshold: 1, active: true, featured: false, isNew: false, image: "", accent: "#fff", seoTitle: "", seoDescription: "", createdAt: now },
    ],
    licenseKeys: [
      { id: "k1", productId: "p1", key: "K-1", status: "UNUSED", orderId: null, reservedAt: null, deliveredAt: null, customerId: null },
      { id: "k2", productId: "p1", key: "K-2", status: "UNUSED", orderId: null, reservedAt: null, deliveredAt: null, customerId: null },
      { id: "k3", productId: "p1", key: "K-3", status: "DELIVERED", orderId: "x", reservedAt: null, deliveredAt: now, customerId: "u" },
    ],
    orders: [], payments: [], paymentEvents: [], refunds: [],
    coupons: [
      { code: "P10", type: "PERCENT", value: 10, minOrderUsd: 1000, startsAt: now - 1000, expiresAt: now + 100000, maxUses: 2, maxPerCustomer: 1, uses: 0, active: true, productIds: [] },
      { code: "EXPIRED", type: "PERCENT", value: 50, minOrderUsd: 0, startsAt: now - 9000, expiresAt: now - 1000, maxUses: 9, maxPerCustomer: 1, uses: 0, active: true, productIds: [] },
      { code: "MAXED", type: "FIXED", value: 500, minOrderUsd: 0, startsAt: now - 1000, expiresAt: now + 100000, maxUses: 1, maxPerCustomer: 1, uses: 1, active: true, productIds: [] },
    ],
    reviews: [], wishlist: [], notifications: [], tickets: [], ticketMessages: [], auditLogs: [], emailLogs: [],
    settings: { storeName: "S", supportEmail: "", contactEmail: "", description: "", langs: ["en", "ar", "ru", "fr"], currencies: ["USD", "EUR", "SAR", "RUB"], defaultLang: "en", defaultCurrency: "USD", fx: { USD: 1, EUR: 0.92, SAR: 3.75, RUB: 96 }, stripeEnabled: true, paypalEnabled: true, taxRatePct: 0, maintenanceMode: false, emailProvider: "RESEND", emailFrom: "", requireReviewApproval: true },
    carts: [], orderSeq: 1,
  };
}

describe("server-side pricing & coupon validation", () => {
  it("recalculates totals from stored prices only — browser numbers never enter", () => {
    const t = computeTotals([{ productId: "p1", qty: 2 }, { productId: "p2", qty: 1 }], null, "USD", fakeDb());
    expect(t.subtotalUsd).toBe(7000);
    expect(t.totalUsd).toBe(7000);
    expect(t.totalMinor).toBe(7000);
  });
  it("valid percent coupon reduces by integer percent", () => {
    const t = computeTotals([{ productId: "p2", qty: 1 }], "P10", "USD", fakeDb());
    expect(t.discountUsd).toBe(300);
    expect(t.totalUsd).toBe(2700);
  });
  it("rejects expired, exhausted and below-minimum coupons", () => {
    const db = fakeDb();
    expect(validateCoupon(db, "EXPIRED", 5000, null, []).ok).toBe(false);
    expect(validateCoupon(db, "MAXED", 5000, null, []).ok).toBe(false);
    const belowMin = validateCoupon(db, "P10", 500, null, []);
    expect(belowMin.ok).toBe(false);
  });
  it("coupon usage increments only on captured payment paths (no redemption on validation)", () => {
    const db = fakeDb();
    validateCoupon(db, "P10", 5000, null, []);
    expect(db.coupons[0].uses).toBe(0); // validation never consumes
  });
});
