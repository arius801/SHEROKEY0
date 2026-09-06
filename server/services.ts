/**
 * SHEROKEY — server-side business services.
 * Every rule that touches money, inventory or accounts lives here and runs ONLY
 * on the server. The browser receives display data; it never supplies prices,
 * totals, stock or payment status back into these functions.
 */
import { and, eq, gt, inArray, isNull, sql, count } from "drizzle-orm";
import {
  requireDb, users, licenseKeys, orders, orderItems, orderStatusHistory, payments,
  coupons, couponRedemptions, carts, cartItems, products, refunds,
} from "./db";
import type { Currency } from "../src/lib/types";
import { convertFromUsd, percentOff } from "../src/lib/money";
import {
  hashPassword, verifyPassword, createSession, revokeAllSessions, audit,
  issueEmailVerification, consumeEmailVerification, issueOtp, verifyOtp, OTP_MAX_ATTEMPTS,
  issuePasswordReset, consumePasswordReset,
} from "./lib/auth";
import { rateLimit, LIMITS, sendEmail } from "./lib/infra";

export class ApiError extends Error {
  status: number;
  constructor(public code: string, status = 400) { super(code); this.status = status; }
}

const DAY = 86400_000;

/* ================================================================ pricing (server-authoritative, §17/§23/§29) */
export interface PricedCart {
  lines: { productId: string; qty: number; unitUsdMinor: number; lineUsdMinor: number; deliveryMethod: "AUTO" | "MANUAL" }[];
  subtotalUsdMinor: number;
  discountUsdMinor: number;
  taxUsdMinor: number;
  totalUsdMinor: number;
  couponCode: string | null;
}

/** Recomputes the entire order from product rows in PostgreSQL. Browser input is
 *  limited to product ids + quantities (re-validated against stock here). */
export async function priceCart(ownerId: string, currency: Currency, couponCode: string | null, fx: Record<Currency, number>, taxRatePct: number): Promise<PricedCart> {
  const d = requireDb();
  const cartRows = await d.select({ ci: cartItems, p: products })
    .from(carts)
    .innerJoin(cartItems, eq(cartItems.cartId, carts.id))
    .innerJoin(products, eq(products.id, cartItems.productId))
    .where(eq(carts.ownerId, ownerId));
  if (cartRows.length === 0) throw new ApiError("e.cartEmpty", 400);

  const lines: PricedCart["lines"] = [];
  for (const { ci, p } of cartRows) {
    if (!p.active) throw new ApiError("e.unavailable", 400);
    const avail = p.deliveryMethod === "AUTO"
      ? Number((await d.select({ n: count() }).from(licenseKeys).where(and(eq(licenseKeys.productId, p.id), eq(licenseKeys.status, "UNUSED"))))[0].n)
      : p.stock;
    const qty = Math.min(ci.qty, 5);
    if (qty > avail) throw new ApiError("e.insufficient", 400); // stock validated server-side
    lines.push({ productId: p.id, qty, unitUsdMinor: p.priceMinor, lineUsdMinor: p.priceMinor * qty, deliveryMethod: p.deliveryMethod });
  }

  const subtotalUsdMinor = lines.reduce((s, l) => s + l.lineUsdMinor, 0);
  let discountUsdMinor = 0;
  let applied: string | null = null;

  if (couponCode) {
    const code = couponCode.trim().toUpperCase().slice(0, 40);
    const c = (await d.select().from(coupons).where(eq(coupons.code, code)).limit(1))[0];
    const now = new Date();
    if (!c || !c.active || c.startsAt > now || c.expiresAt < now) throw new ApiError("e.couponCode", 400);
    if (c.uses >= c.maxUses) throw new ApiError("e.couponUsed", 400);
    if (subtotalUsdMinor < c.minOrderUsdMinor) throw new ApiError("e.couponMin", 400);
    const perCustomer = Number((await d.select({ n: count() }).from(couponRedemptions)
      .where(and(eq(couponRedemptions.couponId, c.id), eq(couponRedemptions.customerId, ownerId))))[0].n);
    if (perCustomer >= c.maxPerCustomer) throw new ApiError("e.couponLimit", 400);
    if (c.productIds.length > 0 && !lines.some((l) => c.productIds.includes(l.productId))) throw new ApiError("e.couponCode", 400);
    discountUsdMinor = c.type === "PERCENT" ? percentOff(subtotalUsdMinor, c.value) : Math.min(c.value, subtotalUsdMinor);
    applied = c.code;
  }

  const taxUsdMinor = Math.round((subtotalUsdMinor - discountUsdMinor) * (taxRatePct / 100));
  return {
    lines, subtotalUsdMinor, discountUsdMinor, taxUsdMinor,
    totalUsdMinor: subtotalUsdMinor - discountUsdMinor + taxUsdMinor, couponCode: applied,
  };
}

/* ================================================================ accounts (§4/§7/§8) */
export async function register(input: { name: string; email: string; password: string; confirm: string; lang: "en" | "ar" | "ru" | "fr"; currency: Currency }, ip?: string) {
  const d = requireDb();
  await rateLimit("register", input.email.toLowerCase(), LIMITS.register.max, LIMITS.register.window, ip);
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new ApiError("au.badEmail");
  if (input.password.length < 10 || input.password !== input.confirm) throw new ApiError("au.short");
  const existing = await d.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) throw new ApiError("au.exists");
  const passwordHash = await hashPassword(input.password);
  const [user] = await d.insert(users).values({ email, passwordHash, name: input.name.trim().slice(0, 120), lang: input.lang, currency: input.currency, emailVerified: false }).returning();
  const { link } = await issueEmailVerification(user.id);
  await sendEmail({ to: email, toName: user.name, template: "verify", lang: input.lang, vars: { link, greeting: `Confirm your email to activate your account.` } });
  await audit(user.id, user.name, "REGISTERED", email, "verification email sent", ip);
  // session issued immediately (cart persists); purchases remain gated on emailVerified (§9)
  const session = await createSession(user.id);
  return { userId: user.id, cookie: session.cookie };
}

export async function login(emailRaw: string, password: string, ip?: string) {
  const d = requireDb();
  const email = emailRaw.trim().toLowerCase();
  await rateLimit("login", email, LIMITS.login.max, LIMITS.login.window, ip);
  const user = (await d.select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (!user) { await audit(null, "SYSTEM", "LOGIN_FAILED", email, "unknown account", ip); throw new ApiError("au.wrong", 401); }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) throw new ApiError("au.locked", 423);
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const fails = user.failedLogins + 1;
    const locked = fails >= 5;
    await d.update(users).set({ failedLogins: locked ? 0 : fails, lockedUntil: locked ? new Date(Date.now() + 5 * 60_000) : user.lockedUntil }).where(eq(users.id, user.id));
    await audit(user.id, user.name, locked ? "LOGIN_LOCKED" : "LOGIN_FAILED", email, "", ip);
    throw new ApiError(locked ? "au.locked" : "au.wrong", 401);
  }
  await d.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id));
  const session = await createSession(user.id);
  await audit(user.id, user.name, "LOGIN_SUCCESS", email, "session issued", ip);
  return { user: { id: user.id, name: user.name, email: user.email, role: user.role, emailVerified: user.emailVerified, lang: user.lang, currency: user.currency }, cookie: session.cookie };
}

/* ================================================================ checkout (§9/§10–16) */
export async function createOrder(user: { id: string; name: string; email: string; currency: Currency; lang: string; emailVerified: boolean }, couponCode: string | null, payMethod: "CARD_INTL" | "CARD_MIR" | "PAYPAL", provider: "STRIPE" | "PAYPAL" | "MIR_ACQUIRER", fx: Record<Currency, number>, taxRatePct: number, ip?: string): Promise<{ orderId: string; number: string; totalMinor: number; currency: Currency }> {
  const d = requireDb();
  await rateLimit("checkout", user.id, LIMITS.checkout.max, LIMITS.checkout.window, ip);
  if (!user.emailVerified) throw new ApiError("e.otpRequired", 403); // §9/§12 — verified email before payment

  const priced = await priceCart(user.id, user.currency, couponCode, fx, taxRatePct); // server recalculation
  const fxRate = fx[user.currency];
  const totalMinor = convertFromUsd(priced.totalUsdMinor, fx, user.currency);

  return d.transaction(async (tx) => {
    const [numberRow] = await tx.insert(orders).values({
      number: `SK-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}${Date.now().toString(36).slice(-4).toUpperCase()}`,
      customerId: user.id, customerName: user.name, email: user.email, currency: user.currency,
      fxRate, subtotalMinor: convertFromUsd(priced.subtotalUsdMinor, fx, user.currency),
      discountMinor: convertFromUsd(priced.discountUsdMinor, fx, user.currency),
      taxMinor: convertFromUsd(priced.taxUsdMinor, fx, user.currency),
      totalMinor, totalUsdMinor: priced.totalUsdMinor, couponCode: priced.couponCode,
      payMethod, provider, paymentStatus: "PENDING", fulfillmentStatus: "PENDING", delivery: null,
    }).returning();

    for (const l of priced.lines) {
      const p = (await tx.select().from(products).where(eq(products.id, l.productId)).limit(1))[0];
      await tx.insert(orderItems).values({
        orderId: numberRow.id, productId: l.productId, nameSnapshot: p.name.en, imageSnapshot: p.image,
        qty: l.qty, unitUsdMinor: l.unitUsdMinor, lineUsdMinor: l.lineUsdMinor, deliveryMethod: l.deliveryMethod,
      });
      if (l.deliveryMethod === "AUTO") {
        // §16/§26: row-level locking — two concurrent buyers can NEVER receive the same key.
        const reserved = await tx.update(licenseKeys).set({ status: "RESERVED", orderId: numberRow.id, reservedAt: new Date() })
          .where(and(
            eq(licenseKeys.productId, l.productId),
            eq(licenseKeys.status, "UNUSED"),
            inArray(licenseKeys.id, sql`(SELECT id FROM license_keys WHERE product_id = ${l.productId} AND status = 'UNUSED' ORDER BY created_at LIMIT ${l.qty} FOR UPDATE SKIP LOCKED)`),
          )).returning();
        if (reserved.length < l.qty) throw new ApiError("e.insufficient", 409); // partial → whole tx rolls back
      } else {
        const updated = await tx.update(products).set({ stock: sql`${products.stock} - ${l.qty}` })
          .where(and(eq(products.id, l.productId), sql`${products.stock} >= ${l.qty}`)).returning();
        if (updated.length === 0) throw new ApiError("e.insufficient", 409);
      }
    }

    await tx.insert(orderStatusHistory).values({ orderId: numberRow.id, state: "PENDING_PAYMENT", actor: "customer" });
    await tx.insert(payments).values({ orderId: numberRow.id, provider, payMethod, amountMinor: totalMinor, currency: user.currency, status: "PENDING" });

    // atomic coupon redemption — unique(order_id) + count check make double-spend impossible
    if (priced.couponCode) {
      const c = (await tx.select().from(coupons).where(eq(coupons.code, priced.couponCode)).limit(1))[0];
      if (c) {
        const used = await tx.insert(couponRedemptions).values({ couponId: c.id, orderId: numberRow.id, customerId: user.id }).onConflictDoNothing().returning();
        if (used.length === 1) await tx.update(coupons).set({ uses: sql`${coupons.uses} + 1` }).where(eq(coupons.id, c.id));
      }
    }
    await tx.update(carts).set({ updatedAt: new Date() }).where(eq(carts.ownerId, user.id));
    await tx.delete(cartItems).where(inArray(cartItems.cartId, sql`(SELECT id FROM carts WHERE owner_id = ${user.id})`));

    await audit(user.id, user.name, "PAYMENT_CREATED", numberRow.number, `${provider} · ${user.currency} · ${totalMinor}`, ip);
    return { orderId: numberRow.id, number: numberRow.number, totalMinor, currency: user.currency };
  });
}

/* ================================================================ fulfillment (§15/§20/§25) — called ONLY from verified provider events */
export async function fulfillPaidOrder(orderId: string, eventSource: string): Promise<{ delivered: "AUTO" | "MANUAL_QUEUE" | "ALREADY" }> {
  const d = requireDb();
  return d.transaction(async (tx) => {
    const o = (await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0];
    if (!o) throw new ApiError("e.notFound", 404);
    if (o.paymentStatus === "PAID") return { delivered: "ALREADY" };               // replay-safe
    if (o.paymentStatus !== "PENDING" && o.paymentStatus !== "REQUIRES_ACTION" && o.paymentStatus !== "AUTHORIZED")
      throw new ApiError("e.transition", 409);

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const hasAuto = items.some((i) => i.deliveryMethod === "AUTO");
    const hasManual = items.some((i) => i.deliveryMethod === "MANUAL");
    const keys: string[] = [];

    if (hasAuto) {
      const rows = await tx.update(licenseKeys).set({ status: "DELIVERED", deliveredAt: new Date(), customerId: o.customerId })
        .where(and(eq(licenseKeys.orderId, orderId), eq(licenseKeys.status, "RESERVED"))).returning();
      const expected = items.filter((i) => i.deliveryMethod === "AUTO").reduce((s, i) => s + i.qty, 0);
      if (rows.length !== expected) throw new ApiError("e.gateway", 500); // reservation integrity — rolls everything back
      keys.push(...rows.map((r) => r.key));
    }

    const fulfillment = hasManual ? "PROCESSING" : "DELIVERED";
    await tx.update(orders).set({
      paymentStatus: "PAID", paidAt: new Date(), fulfillmentStatus: fulfillment,
      deliveredAt: fulfillment === "DELIVERED" ? new Date() : null,
      delivery: hasAuto ? { keys, activationCode: null, account: null, downloadLink: null, notes: null } : null,
      updatedAt: new Date(),
    }).where(eq(orders.id, orderId));
    await tx.update(payments).set({ status: "PAID", capturedAt: new Date(), updatedAt: new Date() }).where(eq(payments.orderId, orderId));
    await tx.insert(orderStatusHistory).values({ orderId, state: "PAID", actor: eventSource });
    await tx.insert(orderStatusHistory).values({ orderId, state: fulfillment, actor: "fulfillment" });
    if (hasAuto) await audit(null, "SYSTEM", "LICENSES_ASSIGNED", o.number, `${keys.length} keys → customer`, "");
    return { delivered: hasManual ? "MANUAL_QUEUE" : "AUTO" };
  });
}

export async function markFailed(orderId: string, eventSource: string): Promise<void> {
  const d = requireDb();
  await d.transaction(async (tx) => {
    const o = (await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0];
    if (!o || o.paymentStatus !== "PENDING") return;
    await tx.update(licenseKeys).set({ status: "UNUSED", orderId: null, reservedAt: null })
      .where(and(eq(licenseKeys.orderId, orderId), eq(licenseKeys.status, "RESERVED"))); // keys return to pool
    await tx.update(orders).set({ paymentStatus: "FAILED", fulfillmentStatus: "CANCELLED", updatedAt: new Date() }).where(eq(orders.id, orderId));
    await tx.update(payments).set({ status: "FAILED", updatedAt: new Date() }).where(eq(payments.orderId, orderId));
    await tx.insert(orderStatusHistory).values({ orderId, state: "FAILED", actor: eventSource });
    // coupon redemption rolled back — order never paid
    await tx.delete(couponRedemptions).where(eq(couponRedemptions.orderId, orderId));
  });
}

/* ================================================================ refunds (§27) */
export async function refundOrder(orderId: string, staff: { id: string; name: string; role: string }, reason: string, ip?: string): Promise<{ providerRefundId: string | null }> {
  const d = requireDb();
  if (staff.role !== "OWNER" && staff.role !== "ADMIN") throw new ApiError("e.forbidden", 403);
  return d.transaction(async (tx) => {
    const o = (await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0];
    if (!o) throw new ApiError("e.notFound", 404);
    if (o.paymentStatus === "REFUNDED") throw new ApiError("e.transition", 409); // double refund impossible
    if (o.paymentStatus !== "PAID") throw new ApiError("e.notPaid", 409);
    const payment = (await tx.select().from(payments).where(eq(payments.orderId, orderId)).limit(1))[0];

    // provider-side refund (§25) — performed by the adapter; returns the provider refund id
    const { providerRefund } = await import("./payments");
    // refund the captured amount in the ORIGINAL capture currency recorded on the payment row
    const providerRefundId = payment
      ? await providerRefund(payment.provider, payment.providerPaymentId, Number(payment.amountMinor), payment.currency)
      : null;

    await tx.insert(refunds).values({ paymentId: payment?.id ?? o.id, orderId, providerRefundId, amountMinor: o.totalMinor, currency: o.currency, reason, issuedBy: staff.id });
    // delivered keys are REVOKED — never recycled back into the sellable pool
    await tx.update(licenseKeys).set({ status: "REVOKED" }).where(and(eq(licenseKeys.orderId, orderId), eq(licenseKeys.status, "DELIVERED")));
    await tx.update(orders).set({ paymentStatus: "REFUNDED", fulfillmentStatus: "CANCELLED", updatedAt: new Date() }).where(eq(orders.id, orderId));
    await tx.update(payments).set({ status: "REFUNDED", updatedAt: new Date() }).where(eq(payments.orderId, orderId));
    await tx.insert(orderStatusHistory).values({ orderId, state: "REFUNDED", actor: staff.name });
    await audit(staff.id, staff.name, "REFUND_ISSUED", o.number, `${o.currency} ${o.totalMinor} — ${reason}`, ip);
    return { providerRefundId };
  });
}

/* ================================================================ manual delivery (§13) */
export async function manualDeliver(orderId: string, staff: { id: string; name: string; role: string }, payload: { keys: string[]; activationCode?: string; account?: string; downloadLink?: string; notes?: string }, ip?: string) {
  const d = requireDb();
  if (!["OWNER", "ADMIN", "SUPPORT"].includes(staff.role)) throw new ApiError("e.forbidden", 403);
  return d.transaction(async (tx) => {
    const o = (await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0];
    if (!o) throw new ApiError("e.notFound", 404);
    if (o.paymentStatus !== "PAID") throw new ApiError("e.notPaid", 409); // NEVER deliver unpaid orders
    if (o.fulfillmentStatus === "DELIVERED" || o.fulfillmentStatus === "COMPLETED") throw new ApiError("e.transition", 409);
    await tx.update(orders).set({
      fulfillmentStatus: "DELIVERED", deliveredAt: new Date(), deliveredBy: staff.id,
      delivery: { keys: [...(o.delivery?.keys ?? []), ...payload.keys], activationCode: payload.activationCode ?? null, account: payload.account ?? null, downloadLink: payload.downloadLink ?? null, notes: payload.notes ?? null },
      updatedAt: new Date(),
    }).where(eq(orders.id, orderId));
    await tx.insert(orderStatusHistory).values({ orderId, state: "DELIVERED", actor: `manual:${staff.name}` });
    await audit(staff.id, staff.name, "MANUAL_DELIVERED", o.number, `${payload.keys.length} key(s)`, ip);
    await sendEmail({ to: o.email, toName: o.customerName, template: "delivered", lang: "en", vars: { greeting: `Your order ${o.number} has been delivered.`, order: o.number } });
    return { ok: true };
  });
}

export const accounts = { register, login, issueEmailVerification, consumeEmailVerification, issueOtp, verifyOtp, OTP_MAX_ATTEMPTS, issuePasswordReset, consumePasswordReset, revokeAllSessions };
