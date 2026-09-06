/**
 * SHEROKEY — server HTTP layer.
 * Framework-agnostic handlers (work behind Next.js route handlers, Hono or the
 * bundled node entry). Every route: security headers → CSRF → session → RBAC →
 * Zod validation → service call → JSON. Webhook routes verify provider signatures
 * BEFORE anything else.
 */
import { z } from "zod";
import type { ServerResponse } from "node:http";
import { resolveSession, revokeSession, SESSION_COOKIE, serializeSessionCookie, audit, type SessionUser } from "./lib/auth";
import { RateLimited } from "./lib/infra";
import { ApiError, accounts, createOrder, manualDeliver, refundOrder, priceCart } from "./services";
import { createStripeCheckout, handleStripeWebhook, createPayPalOrder, capturePayPalOrder, handlePayPalWebhook, handleMirWebhook, mirAdapter, stripeHealth, paypalHealth, mirHealth } from "./payments";
import { requireDb, users, products, licenseKeys, orders, coupons } from "./db";
import { eq } from "drizzle-orm";
import { getSetting } from "./lib/infra";
import type { Currency } from "../src/lib/types";

export interface Ctx {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  body: string;
  ip?: string;
}
export interface ApiResult { status: number; body: unknown; headers?: Record<string, string> }

/* ================================================================ middleware */
export const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' https://js.stripe.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' https: blob:; connect-src 'self' https://api.stripe.com; frame-src https://js.stripe.com https://hooks.stripe.com https://www.paypal.com; object-src 'none'; base-uri 'self'; form-action 'self'",
};

/** Double-submit CSRF for state-changing routes: cookie-bound token must match header. */
export function csrfOk(ctx: Ctx): boolean {
  const cookieToken = ctx.headers.cookie?.split(";").map((c) => c.trim()).find((c) => c.startsWith("shk_csrf="))?.slice(9);
  const headerToken = ctx.headers["x-csrf-token"];
  return !!cookieToken && !!headerToken && cookieToken === headerToken;
}

const PERMS: Record<string, string[]> = {
  adminOrders: ["OWNER", "ADMIN", "SUPPORT"],
  deliver: ["OWNER", "ADMIN", "SUPPORT"],
  refund: ["OWNER", "ADMIN"],
  cancel: ["OWNER", "ADMIN"],
  products: ["OWNER", "ADMIN"],
  keys: ["OWNER", "ADMIN"],
  coupons: ["OWNER", "ADMIN"],
  customers: ["OWNER", "ADMIN"],
  roles: ["OWNER"],
  payments: ["OWNER"],
  settings: ["OWNER", "ADMIN"],
  emails: ["OWNER", "ADMIN"],
  auditRead: ["OWNER", "ADMIN"],
  tickets: ["OWNER", "ADMIN", "SUPPORT"],
};

function requirePerm(user: SessionUser | null, perm: string): SessionUser {
  if (!user) throw new ApiError("e.session", 401);
  if (!PERMS[perm]?.includes(user.role)) throw new ApiError("e.forbidden", 403); // server-side RBAC (§19/§23)
  return user;
}

function ownResource(user: SessionUser | null, ownerId: string): SessionUser {
  if (!user) throw new ApiError("e.session", 401);
  if (user.id !== ownerId && !["OWNER", "ADMIN", "SUPPORT"].includes(user.role)) throw new ApiError("e.forbidden", 403); // IDOR wall (§D)
  return user;
}

/* ================================================================ Zod schemas (§22) */
const S = {
  register: z.object({ name: z.string().min(2).max(120), email: z.string().email().max(320), password: z.string().min(10).max(128), confirm: z.string(), lang: z.enum(["en", "ar", "ru", "fr"]), currency: z.enum(["USD", "EUR", "SAR", "RUB"]) }).refine((v) => v.password === v.confirm, "mismatch"),
  login: z.object({ email: z.string().email(), password: z.string().min(1).max(128) }),
  otpVerify: z.object({ code: z.string().regex(/^\d{6}$/) }),
  reset: z.object({ token: z.string().min(20), password: z.string().min(10).max(128) }),
  checkout: z.object({ couponCode: z.string().max(40).nullable(), method: z.enum(["CARD_INTL", "CARD_MIR", "PAYPAL"]) }),
  cartLine: z.object({ productId: z.string().uuid(), qty: z.number().int().min(1).max(5) }),
  deliver: z.object({ keys: z.array(z.string().min(5).max(120)).max(50), activationCode: z.string().max(120).optional(), account: z.string().max(200).optional(), downloadLink: z.string().url().optional(), notes: z.string().max(500).optional() }),
  refund: z.object({ reason: z.string().min(3).max(300) }),
  ticket: z.object({ subject: z.string().min(4).max(160), orderId: z.string().uuid().nullable(), message: z.string().min(10).max(4000) }),
};
function parse<T>(schema: z.ZodType<T>, raw: string): T {
  const res = schema.safeParse(JSON.parse(raw || "{}"));
  if (!res.success) throw new ApiError(`e.validation:${res.error.issues[0]?.path.join(".") ?? "body"}`, 422);
  return res.data;
}

/* ================================================================ route table */
const ROUTING: Record<string, "STRIPE" | "PAYPAL" | "MIR_ACQUIRER"> = { CARD_INTL: "STRIPE", CARD_MIR: "MIR_ACQUIRER", PAYPAL: "PAYPAL" };

type Handler = (ctx: Ctx, user: SessionUser | null) => Promise<ApiResult>;
const routes: Record<string, Handler> = {
  /* ---- auth ---- */
  "POST /api/auth/register": async (ctx) => {
    const input = parse(S.register, ctx.body);
    const r = await accounts.register(input, ctx.ip);
    return { status: 201, body: { userId: r.userId }, headers: { "Set-Cookie": r.cookie } };
  },
  "POST /api/auth/login": async (ctx) => {
    const input = parse(S.login, ctx.body);
    const r = await accounts.login(input.email, input.password, ctx.ip);
    return { status: 200, body: { user: r.user }, headers: { "Set-Cookie": r.cookie } };
  },
  "POST /api/auth/logout": async (ctx, user) => {
    await revokeSession(ctx.headers.cookie);
    if (user) await audit(user.id, user.name, "LOGOUT", user.email, "", ctx.ip);
    return { status: 200, body: { ok: true }, headers: { "Set-Cookie": serializeSessionCookie("", 0) } };
  },
  "GET /api/me": async (_ctx, user) => user
    ? { status: 200, body: { id: user.id, name: user.name, email: user.email, role: user.role, emailVerified: user.emailVerified, lang: user.lang, currency: user.currency } }
    : { status: 200, body: null },

  /* ---- verification / OTP / reset ---- */
  "POST /api/auth/verify-email": async (ctx) => {
    const { token } = z.object({ token: z.string().min(20) }).parse(JSON.parse(ctx.body));
    const r = await accounts.consumeEmailVerification(token);
    return { status: r.ok ? 200 : 400, body: r };
  },
  "POST /api/auth/resend-verification": async (ctx, user) => {
    if (!user) throw new ApiError("e.session", 401);
    const { rateLimit, LIMITS } = await import("./lib/infra");
    await rateLimit("verify", user.id, LIMITS.verify.max, LIMITS.verify.window, ctx.ip);
    const { link } = await accounts.issueEmailVerification(user.id);
    const { sendEmail } = await import("./lib/infra");
    await sendEmail({ to: user.email, toName: user.name, template: "verify", lang: user.lang as "en", vars: { link, greeting: "Confirm your email address." } });
    return { status: 200, body: { ok: true } };
  },
  "POST /api/auth/otp/request": async (ctx, user) => {
    if (!user) throw new ApiError("e.session", 401);
    const { rateLimit, LIMITS, sendEmail } = await import("./lib/infra");
    await rateLimit("otp-req", user.id, LIMITS.otpRequest.max, LIMITS.otpRequest.window, ctx.ip);
    const { rawCode } = await accounts.issueOtp(user.id, "checkout");
    await sendEmail({ to: user.email, toName: user.name, template: "otp", lang: user.lang as "en", vars: { code: rawCode, greeting: `Your verification code is ${rawCode}. It expires in 5 minutes.` } }); // code → email ONLY (§6)
    return { status: 200, body: { ok: true } }; // code NEVER in the response
  },
  "POST /api/auth/otp/verify": async (ctx, user) => {
    if (!user) throw new ApiError("e.session", 401);
    const { rateLimit, LIMITS } = await import("./lib/infra");
    await rateLimit("otp-verify", user.id, LIMITS.otpVerify.max, LIMITS.otpVerify.window, ctx.ip);
    const { code } = parse(S.otpVerify, ctx.body);
    const r = await accounts.verifyOtp(user.id, code, "checkout");
    if (r.ok && !user.emailVerified) {
      const d = requireDb();
      await d.update(users).set({ emailVerified: true }).where(eq(users.id, user.id));
    }
    return { status: r.ok ? 200 : 400, body: r };
  },
  "POST /api/auth/forgot": async (ctx) => {
    const { email } = z.object({ email: z.string().email() }).parse(JSON.parse(ctx.body));
    const { rateLimit, LIMITS, sendEmail } = await import("./lib/infra");
    await rateLimit("reset", email, LIMITS.reset.max, LIMITS.reset.window, ctx.ip);
    const { link } = await accounts.issuePasswordReset(email);
    if (link) {
      const d = requireDb();
      const u = (await d.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1))[0];
      if (u) await sendEmail({ to: u.email, toName: u.name, template: "reset", lang: u.lang as "en", vars: { link, greeting: "Reset your password using the button below. The link expires in 30 minutes." } });
    }
    return { status: 200, body: { ok: true } }; // enumeration-safe: identical response either way
  },
  "POST /api/auth/reset": async (ctx) => {
    const input = parse(S.reset, ctx.body);
    const r = await accounts.consumePasswordReset(input.token, input.password);
    return { status: r.ok ? 200 : 400, body: r };
  },

  /* ---- catalog (public read) ---- */
  "GET /api/products": async () => {
    const d = requireDb();
    const all = await d.select().from(products);
    return { status: 200, body: all.filter((p) => p.active) }; // inactive never leak
  },

  /* ---- cart ---- */
  "POST /api/cart/items": async (ctx, user) => {
    if (!user) throw new ApiError("e.session", 401);
    const line = parse(S.cartLine, ctx.body);
    const d = requireDb();
    const { carts, cartItems } = await import("./db");
    const cart = (await d.select().from(carts).where(eq(carts.ownerId, user.id)).limit(1))[0]
      ?? (await d.insert(carts).values({ ownerId: user.id }).returning())[0];
    await d.insert(cartItems).values({ cartId: cart.id, productId: line.productId, qty: line.qty })
      .onConflictDoUpdate({ target: [cartItems.cartId, cartItems.productId], set: { qty: line.qty } });
    return { status: 200, body: { ok: true } };
  },
  "GET /api/cart/preview": async (ctx, user) => {
    if (!user) throw new ApiError("e.session", 401);
    const fx = await getSetting("fx", { USD: 1, EUR: 0.92, SAR: 3.75, RUB: 96 });
    const tax = await getSetting("taxRatePct", 0);
    const priced = await priceCart(user.id, user.currency, ctx.query.get("coupon"), fx as Record<Currency, number>, tax as number);
    return { status: 200, body: priced };
  },

  /* ---- checkout (§9–§17) ---- */
  "POST /api/checkout": async (ctx, user) => {
    if (!user) throw new ApiError("e.session", 401);
    const input = parse(S.checkout, ctx.body);
    const provider = ROUTING[input.method];
    const health = provider === "STRIPE" ? stripeHealth() : provider === "PAYPAL" ? paypalHealth() : mirHealth();
    if (health === "NOT_CONFIGURED" || health === "CONFIG_ERROR") throw new ApiError("PROVIDER_NOT_CONFIGURED", 503); // §20 — never fake availability
    const fx = await getSetting("fx", { USD: 1, EUR: 0.92, SAR: 3.75, RUB: 96 });
    const tax = await getSetting("taxRatePct", 0);
    const order = await createOrder(user, input.couponCode, input.method, provider, fx as Record<Currency, number>, tax as number, ctx.ip);
    // provider session created with the SERVER amount (§10/§11/§12)
    if (provider === "STRIPE") {
      const s = await createStripeCheckout(order.orderId, order.totalMinor, order.currency, order.number);
      return { status: 200, body: { orderId: order.orderId, redirect: s.url } };
    }
    if (provider === "PAYPAL") {
      const p = await createPayPalOrder(order.orderId, order.totalMinor, order.currency, order.number);
      return { status: 200, body: { orderId: order.orderId, paypalOrderId: p.paypalOrderId, redirect: p.approveUrl } };
    }
    const mir = await mirAdapter();
    if (!mir) throw new ApiError("PROVIDER_NOT_CONFIGURED", 503);
    const m = await mir.createPayment(order.orderId, order.totalMinor, order.number);
    return { status: 200, body: { orderId: order.orderId, redirect: m.redirectUrl } };
  },
  "POST /api/paypal/capture": async (ctx, user) => {
    if (!user) throw new ApiError("e.session", 401);
    const { paypalOrderId } = z.object({ paypalOrderId: z.string().min(5) }).parse(JSON.parse(ctx.body));
    const r = await capturePayPalOrder(paypalOrderId); // server capture + verification; PAID only from here/webhook
    return { status: 200, body: r };
  },

  /* ---- account data (IDOR-protected) ---- */
  "GET /api/account/orders": async (_ctx, user) => {
    if (!user) throw new ApiError("e.session", 401);
    const d = requireDb();
    const rows = await d.select().from(orders).where(eq(orders.customerId, user.id));
    return { status: 200, body: rows };
  },
  "GET /api/account/licenses": async (_ctx, user) => {
    if (!user) throw new ApiError("e.session", 401);
    const d = requireDb();
    // ONLY keys belonging to this customer's PAID/DELIVERED orders — inventory never leaks (§16/§21)
    const rows = await d.select({ key: licenseKeys.key, productId: licenseKeys.productId, deliveredAt: licenseKeys.deliveredAt, orderId: licenseKeys.orderId })
      .from(licenseKeys)
      .innerJoin(orders, eq(orders.id, licenseKeys.orderId))
      .where(eq(licenseKeys.customerId, user.id));
    return { status: 200, body: rows.filter((_, i) => true).map((r) => r) };
  },

  /* ---- admin (§19/§23 — server-side RBAC on every route) ---- */
  "POST /api/admin/orders/:id/deliver": async (ctx, user) => {
    const actor = requirePerm(user, "deliver");
    const id = ctx.path.split("/")[4];
    const payload = parse(S.deliver, ctx.body);
    const r = await manualDeliver(id, actor, payload, ctx.ip);
    return { status: 200, body: r };
  },
  "POST /api/admin/orders/:id/refund": async (ctx, user) => {
    const actor = requirePerm(user, "refund");
    const id = ctx.path.split("/")[4];
    const { reason } = parse(S.refund, ctx.body);
    const r = await refundOrder(id, actor, reason, ctx.ip);
    return { status: 200, body: r };
  },
  "GET /api/admin/providers": async (_ctx, user) => {
    requirePerm(user, "payments");
    // status only — secrets NEVER leave the server (§20/§24)
    return { status: 200, body: { STRIPE: stripeHealth(), PAYPAL: paypalHealth(), MIR_ACQUIRER: mirHealth() } };
  },

  /* ---- webhooks (§15/§21 — signature FIRST, idempotent, raw body) ---- */
  "POST /api/webhooks/stripe": async (ctx) => ({ status: 200, body: await handleStripeWebhook(ctx.body, ctx.headers["stripe-signature"] ?? "") }),
  "POST /api/webhooks/paypal": async (ctx) => ({ status: 200, body: await handlePayPalWebhook(ctx.headers, ctx.body) }),
  "POST /api/webhooks/mir": async (ctx) => ({ status: 200, body: await handleMirWebhook(ctx.body, ctx.headers["x-mir-signature"] ?? "") }),

  /* ---- bootstrap: role-scoped snapshot that hydrates the storefront (§1 frontend→API).
     Secrets (password hashes, keys of other customers, provider credentials) NEVER leave
     the server; provider status is computed from real configuration, never faked. ---- */
  "GET /api/bootstrap": async (ctx, user) => {
    const d = requireDb();
    const { categories, orderItems, orderStatusHistory, notifications, wishlistItems, supportTickets, supportTicketMessages, emailLogs, auditLogs, reviews } = await import("./db");
    const { randomBytes } = await import("node:crypto");
    const csrfToken = randomBytes(24).toString("hex"); // double-submit pair (readable cookie + header)

    const [cats, prods, apprReviews] = await Promise.all([
      d.select().from(categories),
      d.select().from(products),
      d.select().from(reviews).where(eq(reviews.approved, true)),
    ]);
    const active = prods.filter((p) => p.active);
    const unusedCounts = new Map<string, number>();
    if (active.some((p) => p.deliveryMethod === "AUTO")) {
      const { sql } = await import("drizzle-orm");
      const rows = await d.select({ pid: licenseKeys.productId, n: sql<number>`count(*)::int` })
        .from(licenseKeys).where(sql`${licenseKeys.status} = 'UNUSED'`).groupBy(licenseKeys.productId);
      for (const r of rows) unusedCounts.set(r.pid, Number(r.n));
    }
    const productsOut = active.map((p) => ({
      ...p, priceUsd: Number(p.priceMinor), compareAtUsd: p.compareAtMinor != null ? Number(p.compareAtMinor) : null,
      stock: p.deliveryMethod === "AUTO" ? (unusedCounts.get(p.id) ?? 0) : p.stock,
    }));

    const settingsOut = {
      storeName: await getSetting("storeName", "SHEROKEY"),
      description: await getSetting("description", ""),
      supportEmail: await getSetting("supportEmail", "support@sherokey.com"),
      contactEmail: await getSetting("contactEmail", "hello@sherokey.com"),
      langs: ["en", "ar", "ru", "fr"], currencies: ["USD", "EUR", "SAR", "RUB"],
      defaultLang: "en", defaultCurrency: "USD",
      fx: await getSetting("fx", { USD: 1, EUR: 0.92, SAR: 3.75, RUB: 96 }),
      taxRatePct: await getSetting("taxRatePct", 0),
      maintenanceMode: await getSetting("maintenanceMode", false),
      emailProvider: await getSetting("emailProvider", "RESEND"),
      emailFrom: await getSetting("emailFrom", "SHEROKEY <no-reply@sherokey.com>"),
      requireReviewApproval: true,
      stripeEnabled: stripeHealth() !== "NOT_CONFIGURED",
      paypalEnabled: paypalHealth() !== "NOT_CONFIGURED",
      // honest status (§20): computed from real server-side configuration, secrets excluded
      providerHealth: { STRIPE: stripeHealth(), PAYPAL: paypalHealth(), MIR_ACQUIRER: mirHealth() },
    };

    const body: Record<string, unknown> = {
      csrfToken, settings: settingsOut, categories: cats, products: productsOut,
      reviews: apprReviews.map((r) => ({ ...r, customerName: "Customer", text: r.text, approved: true })),
      user: user ? { id: user.id, name: user.name, email: user.email, role: user.role, emailVerified: user.emailVerified, lang: user.lang, currency: user.currency } : null,
      orders: [], licenseKeys: [], notifications: [], wishlist: [], tickets: [], ticketMessages: [],
      coupons: [], users: [], auditLogs: [], emailLogs: [], payments: [], paymentEvents: [], refunds: [], carts: [],
    };

    if (user) {
      const [myOrders, myItems, myHistory, myKeys, myNotifs, myWish, myTickets, myMsgs, myCarts] = await Promise.all([
        d.select().from(orders).where(eq(orders.customerId, user.id)),
        d.select().from(orderItems),
        d.select().from(orderStatusHistory),
        d.select().from(licenseKeys).where(eq(licenseKeys.customerId, user.id)),
        d.select().from(notifications).where(eq(notifications.userId, user.id)),
        d.select().from(wishlistItems).where(eq(wishlistItems.userId, user.id)),
        d.select().from(supportTickets).where(eq(supportTickets.customerId, user.id)),
        d.select().from(supportTicketMessages),
        d.select().from((await import("./db")).carts).where(eq((await import("./db")).carts.ownerId, user.id)),
      ]);
      const mine = new Set(myOrders.map((o) => o.id));
      body.orders = myOrders.map((o) => ({
        id: o.id, number: o.number, customerId: o.customerId, customerName: o.customerName, email: o.email,
        items: myItems.filter((i) => i.orderId === o.id).map((i) => ({
          productId: i.productId, name: i.nameSnapshot, image: i.imageSnapshot, qty: i.qty,
          unitUsd: Number(i.unitUsdMinor), lineTotalUsd: Number(i.lineUsdMinor), deliveryMethod: i.deliveryMethod,
        })),
        couponCode: o.couponCode, discountUsd: Math.round(Number(o.discountMinor) / Number(o.fxRate)), taxUsd: Math.round(Number(o.taxMinor) / Number(o.fxRate)),
        totalUsd: Number(o.totalUsdMinor), currency: o.currency, fxRate: o.fxRate, totalMinor: Number(o.totalMinor),
        paymentMethod: o.payMethod === "PAYPAL" ? "PAYPAL" : o.payMethod === "CARD_MIR" ? "MIR" : "STRIPE",
        paymentId: null, paymentStatus: o.paymentStatus, fulfillmentStatus: o.fulfillmentStatus,
        delivery: o.delivery, deliveredBy: o.deliveredBy,
        history: myHistory.filter((h) => h.orderId === o.id).map((h) => ({ at: h.at.getTime(), state: h.state, by: h.actor })),
        createdAt: o.createdAt.getTime(), paidAt: o.paidAt?.getTime() ?? null, deliveredAt: o.deliveredAt?.getTime() ?? null,
        // keys ONLY for this customer's paid orders — never inventory-wide (§16/§21)
        __keys: (o.paymentStatus === "PAID" || o.paymentStatus === "REFUNDED")
          ? myKeys.filter((k) => k.orderId === o.id && (k.status === "DELIVERED" || k.status === "USED")).map((k) => k.key) : [],
      }));
      body.notifications = myNotifs; body.wishlist = myWish.map((w) => ({ userId: w.userId, productId: w.productId }));
      body.tickets = myTickets; body.ticketMessages = myMsgs.filter((m) => mine.has(m.ticketId) || myTickets.some((t) => t.id === m.ticketId));
      body.carts = myCarts.map((c) => ({ id: c.id, ownerId: c.ownerId, items: [] }));
      const { cartItems } = await import("./db");
      const lines = myCarts.length ? await d.select().from(cartItems).where(sql_in(cartItems.cartId, myCarts.map((c) => c.id))) : [];
      (body.carts as { id: string; ownerId: string | null; items: { productId: string; qty: number }[] }[]).forEach((c) => {
        c.items = lines.filter((l) => l.cartId === c.id).map((l) => ({ productId: l.productId, qty: l.qty }));
      });
    }

    if (user && ["OWNER", "ADMIN", "SUPPORT"].includes(user.role)) {
      const { payments, paymentEvents, refunds } = await import("./db");
      const [allOrders, allKeys, allCoupons, allUsers, allAudit, allEmails, allPayments, allEvents, allRefunds, allTickets, allMsgs] = await Promise.all([
        d.select().from(orders), d.select().from(licenseKeys), d.select().from(coupons),
        d.select({ id: users.id, name: users.name, email: users.email, role: users.role, lang: users.lang, currency: users.currency, emailVerified: users.emailVerified, createdAt: users.createdAt }).from(users), // passwordHash excluded
        d.select().from(auditLogs), d.select().from(emailLogs), d.select().from(payments), d.select().from(paymentEvents), d.select().from(refunds),
        d.select().from(supportTickets), d.select().from(supportTicketMessages),
      ]);
      body.orders = allOrders.map((o) => ({
        id: o.id, number: o.number, customerId: o.customerId, customerName: o.customerName, email: o.email,
        items: [], couponCode: o.couponCode, discountUsd: 0, taxUsd: 0, totalUsd: Number(o.totalUsdMinor),
        currency: o.currency, fxRate: o.fxRate, totalMinor: Number(o.totalMinor),
        paymentMethod: o.payMethod === "PAYPAL" ? "PAYPAL" : o.payMethod === "CARD_MIR" ? "MIR" : "STRIPE",
        paymentId: null, paymentStatus: o.paymentStatus, fulfillmentStatus: o.fulfillmentStatus,
        delivery: o.delivery, deliveredBy: o.deliveredBy,
        history: [], createdAt: o.createdAt.getTime(), paidAt: o.paidAt?.getTime() ?? null, deliveredAt: o.deliveredAt?.getTime() ?? null, __keys: [],
      }));
      body.licenseKeys = allKeys; body.coupons = allCoupons; body.users = allUsers;
      body.auditLogs = allAudit.map((a) => ({ id: String(a.id), actorId: a.actorId ?? "system", actorName: a.actorName, action: a.action, target: a.target, meta: a.meta, at: a.at.getTime() }));
      body.emailLogs = allEmails; body.payments = allPayments; body.paymentEvents = allEvents.map((e) => ({ eventId: e.eventId, provider: e.provider, type: e.eventType, orderId: e.orderId, signatureValid: true, payloadHash: e.payloadHash, processed: e.processed, receivedAt: e.receivedAt.getTime() }));
      body.refunds = allRefunds; body.tickets = allTickets; body.ticketMessages = allMsgs;
    }

    return {
      status: 200, body,
      headers: { "Set-Cookie": `shk_csrf=${csrfToken}; Path=/; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}` },
    };
  },
};

import { inArray as sql_in } from "drizzle-orm";

/* ================================================================ dispatcher */
export async function handle(ctx: Ctx): Promise<ApiResult> {
  const isWebhook = ctx.path.startsWith("/api/webhooks/");
  try {
    if (!isWebhook && ["POST", "PUT", "PATCH", "DELETE"].includes(ctx.method) && !csrfOk(ctx))
      return { status: 403, body: { error: "CSRF" }, headers: SECURITY_HEADERS };
    const user = isWebhook ? null : await resolveSession(ctx.headers.cookie);
    const key = `${ctx.method} ${ctx.path.replace(/\/[0-9a-f-]{36}(?=\/)/g, "/:id")}`;
    const handler = routes[key] ?? routes[`${ctx.method} ${ctx.path}`];
    if (!handler) return { status: 404, body: { error: "not_found" }, headers: SECURITY_HEADERS };
    const res = await handler(ctx, user);
    return { ...res, headers: { ...SECURITY_HEADERS, ...res.headers } };
  } catch (e) {
    if (e instanceof RateLimited) return { status: 429, body: { error: "RATE_LIMITED", retryAfterSec: e.retryAfterSec }, headers: { ...SECURITY_HEADERS, "Retry-After": String(e.retryAfterSec) } };
    if (e instanceof ApiError) return { status: e.status, body: { error: e.code }, headers: SECURITY_HEADERS };
    if (e instanceof z.ZodError) return { status: 422, body: { error: "validation" }, headers: SECURITY_HEADERS };
    console.error(e); // technical detail → server logs only
    return { status: 500, body: { error: "e.generic" }, headers: SECURITY_HEADERS }; // never a stack trace (§31)
  }
}

export { SESSION_COOKIE };
