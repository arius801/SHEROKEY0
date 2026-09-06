/* SHEROKEY service layer.
 * In production these functions live in Next.js route handlers/server actions backed by
 * Drizzle + PostgreSQL. Here they run against a repository adapter (browser persistence)
 * with the identical contracts: server-side price recalculation, RBAC checks, audit logs,
 * idempotent webhook processing and transactional key reservation. */

import { useSyncExternalStore } from "react";
import type {
  Cart, CartItem, Coupon, Currency, DB, DeliveryPayload, Lang, Order, Product, Role, Theme, User,
} from "../lib/types";
import { vCouponCode, vEmail, vKeyLines, vPassword, vTicketBody, vTicketSubject } from "../lib/validate";
import { ApiError } from "../lib/types";
import { buildSeed } from "../lib/seed";
import { hashPassword, makeSalt, randomToken, uid, verifyPassword } from "../lib/crypto";
import { convertFromUsd, formatMoney, percentOff } from "../lib/money";
import { tr, langDir } from "../lib/i18n";
import {
  PROVIDERS, providerCfg, verifyEventSignature, eventPayloadHash,
  type ProviderId, type ProviderCfg, type PaymentRouting,
} from "../lib/payments";
import { otpCode, sha256Hex, timingSafeEqual } from "../lib/crypto";

const STORAGE_KEY = "sherokey.workspace.v1";
const PREFS_KEY = "sherokey.prefs.v1"; // harmless UI preferences ONLY (theme/lang/currency)
const DAY = 86400000;

/* ------------------------------------------------------------------ */
/* Runtime mode (§1): production builds are server-authoritative.      */
/* The sandbox adapter is development-only and can never take over a   */
/* production build — missing API configuration fails loudly instead.  */
/* ------------------------------------------------------------------ */
export const PROD_BUILD = import.meta.env.PROD;
export const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(/\/+$/, "");
export const SERVER_MODE = PROD_BUILD; // PROD ⇒ server API is mandatory

let csrfToken: string | null = null; // memory-only CSRF double-submit token from /api/bootstrap

async function serverFetch<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    credentials: "include", // HttpOnly session cookie
    headers: {
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    let code = "e.generic";
    try { code = ((await res.json()) as { error?: string }).error ?? code; } catch { /* non-JSON */ }
    throw new ApiError(code, { status: res.status });
  }
  return (await res.json()) as T;
}

function readPrefs(): { lang?: Lang; currency?: Currency; theme?: Theme } {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}"); } catch { return {}; }
}
function writePrefs(ui: { lang: Lang; currency: Currency; theme: Theme }) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ lang: ui.lang, currency: ui.currency, theme: ui.theme })); } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* Store core                                                          */
/* ------------------------------------------------------------------ */

export interface Toast { id: string; msg: string; kind: "ok" | "err" | "info"; }

const ANON_KEY = "sherokey.anon.v1";
/** Anonymous session id for pre-login carts (A15). Harmless UI state only —
 *  production replaces this with a server-issued anonymous session cookie. */
function anonId(): string {
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) { id = uid("anon"); localStorage.setItem(ANON_KEY, id); }
    return id;
  } catch { return "anon-ephemeral"; }
}

/** In-sandbox rate limiter (A21). Production: Redis-backed, keyed by IP + account. */
const rlBuckets = new Map<string, number[]>();
function rateLimit(bucket: string, max: number, windowMs: number) {
  const now = Date.now();
  const hits = (rlBuckets.get(bucket) ?? []).filter((t) => t > now - windowMs);
  if (hits.length >= max) { rlBuckets.set(bucket, hits); throw new ApiError("e.rateLimit"); }
  hits.push(now);
  rlBuckets.set(bucket, hits);
}

/** Shape guard for restored workspaces — corrupted payloads reseed instead of crashing. */
function isShapedDb(x: unknown): x is DB {
  if (!x || typeof x !== "object") return false;
  const d = x as Record<string, unknown>;
  return Array.isArray(d.users) && Array.isArray(d.products) && Array.isArray(d.orders)
    && Array.isArray(d.licenseKeys) && Array.isArray(d.coupons)
    && !!d.settings && typeof d.settings === "object";
}

/** Migrate legacy workspaces (shared `cart`) to user-scoped carts (A15). */
function migrateLegacy(db: DB) {
  const d = db as DB & { cart?: CartItem[] };
  if (!Array.isArray(db.carts)) {
    const legacy = Array.isArray(d.cart) ? d.cart.filter((i) => i && typeof i.productId === "string" && typeof i.qty === "number") : [];
    db.carts = legacy.length ? [{ id: uid("c"), ownerId: null, items: legacy }] : [];
  }
  delete d.cart;
}

class Store {
  private _db: DB | null = null;
  ui: { lang: Lang; currency: Currency; theme: Theme; ready: boolean; initError: string | null } = {
    lang: "en", currency: "USD", theme: "dark", ready: false, initError: null,
  };
  toasts: Toast[] = [];
  v = 0;
  private listeners = new Set<() => void>();
  private initPromise: Promise<void> | null = null;

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  emit = () => { this.v++; this.listeners.forEach((fn) => fn()); };

  /** Throws only if touched before init — pages render exclusively after ready=true (A1). */
  get db(): DB {
    if (!this._db) throw new ApiError("e.notReady");
    return this._db;
  }
  get hasDb(): boolean { return this._db !== null; }

  /** mutate() = a database transaction. All writes go through here. */
  mutate(fn: (db: DB) => void) {
    if (!this._db) throw new ApiError("e.notReady");
    fn(this._db); this.persist(); this.emit();
  }

  persist() {
    if (!this._db) return;
    if (SERVER_MODE) { writePrefs(this.ui); return; } // §1: server is authoritative — localStorage holds UI prefs only
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ db: this._db, ui: { lang: this.ui.lang, currency: this.ui.currency, theme: this.ui.theme } }));
    } catch { /* storage full/blocked — session continues in memory */ }
  }

  /** Hydrate the read-model from the production server (role-scoped, secrets excluded). */
  private async bootstrap(): Promise<DB> {
    const b = await serverFetch<{
      csrfToken: string; settings: DB["settings"]; categories: DB["categories"]; products: DB["products"];
      reviews: DB["reviews"]; user: (User & { emailVerified: boolean }) | null;
      orders: (Order & { __keys?: string[] })[]; licenseKeys: DB["licenseKeys"]; notifications: DB["notifications"];
      wishlist: DB["wishlist"]; tickets: DB["tickets"]; ticketMessages: DB["ticketMessages"];
      coupons: DB["coupons"]; users: unknown[]; user: unknown; auditLogs: DB["auditLogs"]; emailLogs: DB["emailLogs"];
      payments: DB["payments"]; paymentEvents: DB["paymentEvents"]; refunds: DB["refunds"]; carts: DB["carts"];
    }>("/api/bootstrap");
    csrfToken = b.csrfToken;
    const orders: Order[] = b.orders.map(({ __keys, ...o }) => ({
      ...o,
      delivery: o.delivery ?? (__keys && __keys.length ? { keys: __keys, activationCode: null, account: null, downloadLink: null, notes: null } : null),
    }));
    return {
      users: (b.users.length ? b.users : b.user ? [b.user] : []).map((raw): User => {
        const u = raw as Record<string, unknown>;
        const ca = u.createdAt;
        return {
          id: String(u.id), name: String(u.name), email: String(u.email),
          role: (u.role ?? "CUSTOMER") as Role, lang: (u.lang ?? "en") as Lang, currency: (u.currency ?? "USD") as Currency,
          verified: Boolean((u.emailVerified ?? u.verified) === true),
          salt: "", passwordHash: "", verifyToken: null, verifyExpires: null, resetToken: null, resetExpires: null,
          createdAt: ca instanceof Date ? ca.getTime() : Number(ca ?? Date.now()),
          failedLogins: 0, lockedUntil: null,
        };
      }),
      sessionUserId: b.user?.id ?? null, sessionToken: "server-session", sessionExpires: Date.now() + DAY,
      categories: b.categories, products: b.products, licenseKeys: b.licenseKeys, orders,
      payments: b.payments, paymentEvents: b.paymentEvents, refunds: b.refunds, coupons: b.coupons,
      reviews: b.reviews, wishlist: b.wishlist, notifications: b.notifications,
      tickets: b.tickets, ticketMessages: b.ticketMessages, auditLogs: b.auditLogs, emailLogs: b.emailLogs,
      settings: b.settings, carts: b.carts, orderSeq: 0,
    };
  }

  /** Re-sync the read-model after a mutation; the server stays the source of truth. */
  async refresh() {
    if (!SERVER_MODE) return;
    try { this._db = await this.bootstrap(); this.emit(); } catch { /* transient — next action re-syncs */ }
  }

  /** Deterministic startup (A1): restore → validate shape → migrate → session restore → ready.
   *  Idempotent: StrictMode double-effects and duplicate calls share one promise. */
  init(): Promise<void> {
    if (this.ui.ready) return Promise.resolve();
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      /* PRODUCTION: server-authoritative hydration. No localStorage database, no silent
       * sandbox fallback — missing API configuration fails loudly (§1). */
      if (SERVER_MODE) {
        const prefs = readPrefs();
        if (prefs.lang) this.ui.lang = prefs.lang;
        if (prefs.currency) this.ui.currency = prefs.currency;
        if (prefs.theme) this.ui.theme = prefs.theme;
        if (!API_URL) {
          this.ui.ready = false;
          this.ui.initError = "PRODUCTION_API_REQUIRED";
          this.emit();
          return;
        }
        try {
          this._db = await this.bootstrap();
          this.ui.ready = true;
          this.ui.initError = null;
          writePrefs(this.ui);
        } catch {
          this._db = null;
          this.ui.ready = false;
          this.ui.initError = "SERVER_UNREACHABLE";
        }
        this.emit();
        return;
      }
      let restored: DB | null = null;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as { db?: unknown; ui?: { lang?: Lang; currency?: Currency; theme?: Theme } };
          if (isShapedDb(parsed.db)) {
            restored = parsed.db;
            if (parsed.ui) {
              if (parsed.ui.lang) this.ui.lang = parsed.ui.lang;
              if (parsed.ui.currency) this.ui.currency = parsed.ui.currency;
              if (parsed.ui.theme) this.ui.theme = parsed.ui.theme;
            }
          }
          // unshaped payload → fall through and reseed
        }
      } catch { /* corrupted JSON → reseed */ }
      try {
        this._db = restored ?? (await buildSeed());
        migrateLegacy(this._db);
        if (this._db.sessionExpires && this._db.sessionExpires < Date.now()) {
          this._db.sessionUserId = null; this._db.sessionToken = null; this._db.sessionExpires = null;
        }
        this.ui.ready = true;
        this.ui.initError = null;
        this.persist();
      } catch (e) {
        this._db = null;
        this.ui.ready = false;
        this.ui.initError = e instanceof Error ? e.message : "initialization failed";
      }
      this.emit();
    })();
    return this.initPromise;
  }

  retryInit = () => { this.initPromise = null; this.ui.initError = null; this.emit(); return this.init(); };

  resetWorkspace = async () => {
    if (SERVER_MODE) throw new ApiError("e.forbidden"); // §1: production data is reset via ops tooling, never the browser
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    this._db = await buildSeed();
    this.ui.ready = true;
    this.ui.initError = null;
    this.persist(); this.emit();
  };

  toast = (msg: string, kind: Toast["kind"] = "ok") => {
    const t = { id: uid("t"), msg, kind };
    this.toasts = [...this.toasts, t];
    this.emit();
    setTimeout(() => { this.toasts = this.toasts.filter((x) => x.id !== t.id); this.emit(); }, 3800);
  };

  setLang = (lang: Lang) => { this.ui.lang = lang; this.persist(); this.emit(); };
  setCurrency = (currency: Currency) => { this.ui.currency = currency; this.persist(); this.emit(); };
  setTheme = (theme: Theme) => { this.ui.theme = theme; this.persist(); this.emit(); };
}

export const store = new Store();

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

export function useApp() {
  useSyncExternalStore(store.subscribe, () => store.v);
  const lang = store.ui.lang;
  const currency = store.ui.currency;
  const FX_FALLBACK = { USD: 1, EUR: 1, SAR: 1, RUB: 1 } as Record<Currency, number>;
  return {
    // only touched by views rendered after ui.ready — never dereferenced pre-init (A1)
    db: (store.hasDb ? store.db : null) as DB,
    ui: store.ui,
    toasts: store.toasts,
    t: (key: string, vars?: Record<string, string | number>) => tr(lang, key, vars),
    dir: langDir(lang),
    money: (usdMinor: number, cur?: Currency) =>
      formatMoney(convertFromUsd(usdMinor, store.hasDb ? store.db.settings.fx : FX_FALLBACK, cur ?? currency), cur ?? currency, lang),
    fmt: (minor: number, cur: Currency) => formatMoney(minor, cur, lang),
    user: currentUser(),
  };
}

function currentUser(): User | null {
  if (!store.hasDb) return null; // pre-init render — must never crash (A1)
  const db = store.db;
  if (!db.sessionUserId || !db.sessionExpires || db.sessionExpires < Date.now()) return null;
  return db.users.find((u) => u.id === db.sessionUserId) ?? null;
}

export const isStaff = (u: User | null) => !!u && u.role !== "CUSTOMER";
export const PERMS = {
  products: ["OWNER", "ADMIN"], keys: ["OWNER", "ADMIN"], coupons: ["OWNER", "ADMIN"],
  customers: ["OWNER", "ADMIN"], emails: ["OWNER", "ADMIN"], audit: ["OWNER", "ADMIN"],
  settings: ["OWNER", "ADMIN"], roles: ["OWNER"], payments: ["OWNER"],
  refund: ["OWNER", "ADMIN"], cancel: ["OWNER", "ADMIN"],
  deliver: ["OWNER", "ADMIN", "SUPPORT"], tickets: ["OWNER", "ADMIN", "SUPPORT"],
  orders: ["OWNER", "ADMIN", "SUPPORT"],
} as const;
export type Perm = keyof typeof PERMS;
export const can = (u: User | null, perm: Perm) => !!u && (PERMS[perm] as readonly string[]).includes(u.role);

function requireAuth(): User {
  const u = currentUser();
  if (!u) throw new ApiError("e.unauthorized");
  return u;
}
function requirePerm(perm: Perm): User {
  const u = requireAuth();
  if (!can(u, perm)) throw new ApiError("e.forbidden");
  return u;
}
const staff = (u: User) => u.name;

/* ------------------------------------------------------------------ */
/* Internals: audit, email, notifications                              */
/* ------------------------------------------------------------------ */

function audit(db: DB, actor: User, action: string, target: string, meta: string) {
  db.auditLogs.unshift({ id: uid("al"), actorId: actor.id, actorName: actor.name, action, target, meta, at: Date.now() });
  if (db.auditLogs.length > 400) db.auditLogs.length = 400;
}

/** Security events with no human actor (webhooks, system fulfillment) — §28. */
function auditSystem(db: DB, action: string, target: string, meta: string) {
  db.auditLogs.unshift({ id: uid("al"), actorId: "system", actorName: "system", action, target, meta, at: Date.now() });
  if (db.auditLogs.length > 400) db.auditLogs.length = 400;
}

const MAIL_SUBJECTS: Record<string, string> = {
  welcome: "mail.subject.welcome", verify: "mail.subject.verify", reset: "mail.subject.reset",
  order_receipt: "mail.subject.receipt", delivered: "mail.subject.delivered", payment_failed: "mail.subject.failed",
  refund: "mail.subject.refund", cancelled: "mail.subject.cancelled", processing: "mail.subject.processing",
  otp: "mail.subject.otp", test: "mail.subject.welcome",
};

function sendEmail(db: DB, to: { email: string; name: string; lang: Lang }, type: string, orderNumber?: string, sandboxCode?: string) {
  db.emailLogs.unshift({
    id: uid("em"), to: to.email, toName: to.name, type,
    subject: tr(to.lang, MAIL_SUBJECTS[type] ?? "mail.subject.receipt", { n: orderNumber ?? "" }),
    lang: to.lang, status: "SENT", provider: db.settings.emailProvider.toLowerCase(), createdAt: Date.now(),
    sandboxCode: sandboxCode ?? null, // SANDBOX ONLY — never present in a real provider log
  });
}

/* ---------- one-time email verification codes (req. 1) ----------
 * Codes are crypto-random, live 5 minutes, are single-use, rate-limited, and only their
 * salted SHA-256 hash is kept. The plaintext code exists solely inside the outgoing email. */
interface OtpRecord { hash: string; salt: string; expires: number; attempts: number; }
const otpRecords = new Map<string, OtpRecord>();
const OTP_TTL = 5 * 60000;
const OTP_MAX_ATTEMPTS = 5;

function notify(db: DB, userId: string, type: string, vars?: Record<string, string>, link?: string) {
  db.notifications.unshift({ id: uid("nt"), userId, type, vars, link: link ?? null, read: false, createdAt: Date.now() });
}

/* ------------------------------------------------------------------ */
/* Pricing engine — the ONLY place totals are computed.                */
/* Frontend inputs (coupon code, items) are re-validated here.         */
/* ------------------------------------------------------------------ */

export function availableStock(db: DB, p: Product): number {
  return p.deliveryMethod === "AUTO" ? db.licenseKeys.filter((k) => k.productId === p.id && k.status === "UNUSED").length : p.stock;
}

/* ---------- cart helpers (A15): one cart per user or anonymous session ---------- */
function cartOf(db: DB, ownerId: string | null): Cart {
  let c = db.carts.find((x) => x.ownerId === ownerId);
  if (!c) { c = { id: uid("c"), ownerId, items: [] }; db.carts.push(c); }
  return c;
}
const currentOwner = (): string | null => currentUser()?.id ?? anonId();
export function currentCartItems(): CartItem[] {
  if (!store.hasDb) return [];
  return store.db.carts.find((x) => x.ownerId === currentOwner())?.items ?? [];
}
/** On login/register the anonymous cart folds into the account cart. */
function mergeAnonCart(d: DB, userId: string) {
  const anon = d.carts.find((x) => x.ownerId === anonId());
  if (!anon || anon.items.length === 0) return;
  const target = cartOf(d, userId);
  for (const it of anon.items) {
    const line = target.items.find((l) => l.productId === it.productId);
    if (line) line.qty = Math.min(line.qty + it.qty, 5);
    else target.items.push({ productId: it.productId, qty: it.qty });
  }
  anon.items = [];
}

export function validateCoupon(db: DB, code: string, subtotalUsd: number, customerId: string | null, productIds: string[]):
  { ok: true; coupon: Coupon } | { ok: false; code: string; vars?: Record<string, string> } {
  const c = db.coupons.find((x) => x.code.toLowerCase() === code.trim().toLowerCase());
  if (!c || !c.active) return { ok: false, code: "e.couponCode" };
  const now = Date.now();
  if (now < c.startsAt || now > c.expiresAt) return { ok: false, code: "e.couponExp" };
  if (c.uses >= c.maxUses) return { ok: false, code: "e.couponUsed" };
  if (customerId) {
    const perCustomer = db.orders.filter((o) => o.customerId === customerId && o.couponCode === c.code && o.paymentStatus !== "FAILED").length;
    if (perCustomer >= c.maxPerCustomer) return { ok: false, code: "e.couponUsed" };
  }
  if (subtotalUsd < c.minOrderUsd)
    return { ok: false, code: "e.couponMin", vars: { min: formatMoney(c.minOrderUsd, "USD", "en") } };
  if (c.productIds.length > 0 && !productIds.some((id) => c.productIds.includes(id)))
    return { ok: false, code: "e.couponCode" };
  return { ok: true, coupon: c };
}

export interface Totals {
  lines: { product: Product; qty: number; unitUsd: number; lineUsd: number }[];
  subtotalUsd: number; discountUsd: number; taxUsd: number; totalUsd: number;
  coupon: Coupon | null; couponError: string | null; couponErrorVars?: Record<string, string>;
  currency: Currency; fxRate: number; totalMinor: number;
}

export function computeTotals(items: CartItem[], couponCode: string | null, currency: Currency, dbOverride?: DB): Totals {
  const db = dbOverride ?? store.db;
  const lines = items.flatMap((it) => {
    const product = db.products.find((p) => p.id === it.productId);
    return product && product.active ? [{ product, qty: it.qty, unitUsd: product.priceUsd, lineUsd: product.priceUsd * it.qty }] : [];
  });
  const subtotalUsd = lines.reduce((s, l) => s + l.lineUsd, 0);
  const user = currentUser();
  let discountUsd = 0;
  let coupon: Coupon | null = null;
  let couponError: string | null = null;
  if (couponCode) {
    const v = validateCoupon(db, couponCode, subtotalUsd, user?.id ?? null, lines.map((l) => l.product.id));
    if (v.ok) {
      coupon = v.coupon;
      discountUsd = coupon.type === "PERCENT" ? percentOff(subtotalUsd, coupon.value) : Math.min(coupon.value, subtotalUsd);
    } else { couponError = v.code; }
  }
  const couponErrorVars = (() => {
    if (couponError !== "e.couponMin" || !couponCode) return undefined;
    const c = db.coupons.find((x) => x.code.toLowerCase() === couponCode.trim().toLowerCase());
    return c ? { min: formatMoney(c.minOrderUsd, currency, store.ui.lang) } : undefined;
  })();
  const taxUsd = Math.round(((subtotalUsd - discountUsd) * db.settings.taxRatePct) / 100);
  const totalUsd = subtotalUsd - discountUsd + taxUsd;
  const fxRate = db.settings.fx[currency];
  return { lines, subtotalUsd, discountUsd, taxUsd, totalUsd, coupon, couponError, couponErrorVars, currency, fxRate, totalMinor: convertFromUsd(totalUsd, db.settings.fx, currency) };
}

/* ------------------------------------------------------------------ */
/* Key vault — transactional reservation (production: FOR UPDATE SKIP LOCKED) */
/* ------------------------------------------------------------------ */

function reserveKeys(db: DB, productId: string, qty: number, orderId: string): string[] {
  const taken: string[] = [];
  for (const k of db.licenseKeys) {
    if (taken.length >= qty) break;
    if (k.productId === productId && k.status === "UNUSED") {
      k.status = "RESERVED"; k.orderId = orderId; k.reservedAt = Date.now();
      taken.push(k.id);
    }
  }
  if (taken.length < qty) {
    // roll back the partial reservation — keys are never half-sold
    for (const id of taken) { const k = db.licenseKeys.find((x) => x.id === id)!; k.status = "UNUSED"; k.orderId = null; k.reservedAt = null; }
    throw new ApiError("e.outOfStock");
  }
  return taken;
}

function releaseReserved(db: DB, orderId: string) {
  for (const k of db.licenseKeys) if (k.orderId === orderId && k.status === "RESERVED") { k.status = "UNUSED"; k.orderId = null; k.reservedAt = null; }
}

function deliverReserved(db: DB, order: Order): string[] {
  const keys: string[] = [];
  for (const k of db.licenseKeys)
    if (k.orderId === order.id && k.status === "RESERVED") {
      k.status = "DELIVERED"; k.deliveredAt = Date.now(); k.customerId = order.customerId;
      keys.push(k.key);
    }
  return keys;
}

/* ------------------------------------------------------------------ */
/* Order state machine (A14) — payment and fulfillment lifecycles are  */
/* separate, and only whitelisted transitions are legal. Every change  */
/* writes order status history.                                        */
/* ------------------------------------------------------------------ */

type PaymentStatus = Order["paymentStatus"];
type FulfillmentStatus = Order["fulfillmentStatus"];

const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING: ["PAID", "FAILED"],
  PAID: ["REFUNDED"],
  FAILED: [],
  REFUNDED: [],
};
const FULFILL_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  PENDING: ["PROCESSING", "DELIVERED", "CANCELLED"],
  PROCESSING: ["DELIVERED", "CANCELLED"],
  DELIVERED: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

function setPaymentStatus(o: Order, next: PaymentStatus, by: string) {
  if (!PAYMENT_TRANSITIONS[o.paymentStatus].includes(next)) throw new ApiError("e.transition");
  o.paymentStatus = next;
  o.history.push({ at: Date.now(), state: next, by });
}
function setFulfillmentStatus(o: Order, next: FulfillmentStatus, by: string) {
  if (!FULFILL_TRANSITIONS[o.fulfillmentStatus].includes(next)) throw new ApiError("e.transition");
  o.fulfillmentStatus = next;
  if (next === "DELIVERED") o.deliveredAt = Date.now();
  o.history.push({ at: Date.now(), state: next, by });
}

/* ------------------------------------------------------------------ */
/* Fulfillment — independent from the payment UI. Runs only after a    */
/* verified provider event.                                            */
/* ------------------------------------------------------------------ */

function fulfill(db: DB, order: Order) {
  const hasAuto = order.items.some((i) => i.deliveryMethod === "AUTO");
  const hasManual = order.items.some((i) => i.deliveryMethod === "MANUAL");
  if (hasAuto) {
    const keys = deliverReserved(db, order);
    order.delivery = { keys, activationCode: null, account: null, downloadLink: null, notes: null };
    setFulfillmentStatus(order, hasManual ? "PROCESSING" : "DELIVERED", "fulfillment");
  } else {
    setFulfillmentStatus(order, "PROCESSING", "fulfillment"); // manual queue
  }

  const customer = db.users.find((u) => u.id === order.customerId);
  if (customer) {
    sendEmail(db, customer, order.fulfillmentStatus === "DELIVERED" ? "delivered" : "processing", order.number);
    notify(db, customer.id, order.fulfillmentStatus === "DELIVERED" ? "n.delivered" : "n.status", { n: order.number }, `/account/orders/${order.id}`);
  }
  if (order.fulfillmentStatus === "PROCESSING") {
    for (const s of db.users.filter((u) => u.role === "OWNER" || u.role === "ADMIN" || u.role === "SUPPORT"))
      notify(db, s.id, "n.manual", { n: order.number }, `/admin/orders/${order.id}`);
  }
}

/* ------------------------------------------------------------------ */
/* Webhook processing — signature check + event-id idempotency         */
/* ------------------------------------------------------------------ */

function processPaymentEvent(db: DB, event: {
  eventId: string; provider: "STRIPE" | "PAYPAL" | "MIR_ACQUIRER";
  type: "payment.captured" | "payment.failed"; orderId: string;
  signatureValid: boolean; payloadHash: string | null; providerPaymentId?: string | null;
}) {
  if (!event.signatureValid) {
    auditSystem(db, "WEBHOOK_REJECTED", event.orderId, `${event.provider} — invalid signature`);
    throw new ApiError("e.gateway"); // unsigned/invalid events never touch state
  }
  // idempotency (A9): UNIQUE(provider, providerEventId) — replays return safely, nothing duplicates
  const existing = db.paymentEvents.find((e) => e.provider === event.provider && e.eventId === event.eventId);
  if (existing?.processed) return { duplicate: true }; // duplicate webhook — ignored
  const { providerPaymentId: _ppid, ...stored } = event;
  db.paymentEvents.push({ ...stored, processed: true, receivedAt: Date.now() });

  const order = db.orders.find((o) => o.id === event.orderId);
  if (!order || order.paymentStatus === "PAID" || order.paymentStatus === "REFUNDED") return { duplicate: true };
  const payment = db.payments.find((p) => p.orderId === order.id);

  if (event.type === "payment.captured") {
    if (payment) { payment.status = "PAID"; payment.capturedAt = Date.now(); payment.providerRef = event.providerPaymentId ?? payment.providerRef; payment.updatedAt = Date.now(); }
    order.paymentId = payment?.providerRef ?? null;
    setPaymentStatus(order, "PAID", `webhook:${event.provider.toLowerCase()}`);
    order.paidAt = Date.now();
    auditSystem(db, "PAYMENT_CONFIRMED", order.number, `${event.provider} · ${event.eventId.slice(0, 18)}`);
    if (order.couponCode) {
      const c = db.coupons.find((x) => x.code === order.couponCode);
      if (c) c.uses += 1;
    }
    for (const it of order.items) if (it.deliveryMethod === "MANUAL") { const p = db.products.find((x) => x.id === it.productId); if (p) p.stock = Math.max(0, p.stock - it.qty); }
    notify(db, order.customerId, "n.paid", { n: order.number }, `/account/orders/${order.id}`);
    fulfill(db, order);
  } else {
    if (payment) { payment.status = "FAILED"; }
    setPaymentStatus(order, "FAILED", `webhook:${event.provider.toLowerCase()}`);
    auditSystem(db, "PAYMENT_FAILED", order.number, `${event.provider} · ${event.eventId.slice(0, 18)}`);
    setFulfillmentStatus(order, "CANCELLED", `webhook:${event.provider.toLowerCase()}`);
    releaseReserved(db, order.id);
    const customer = db.users.find((u) => u.id === order.customerId);
    if (customer) sendEmail(db, customer, "payment_failed", order.number);
  }
  return { duplicate: false };
}

/* ------------------------------------------------------------------ */
/* Public API — development sandbox implementation (browser repo).     */
/* In SERVER_MODE the `serverApi` facade is exported instead and this  */
/* object is unreachable in production builds (§1).                    */
/* ------------------------------------------------------------------ */

const sandboxApi = {
  /* ---------- auth ---------- */
  async register(name: string, email: string, password: string) {
    const db = store.db;
    email = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new ApiError("au.badEmail");
    if (password.length < 8) throw new ApiError("au.short");
    if (db.users.some((u) => u.email === email)) throw new ApiError("au.taken");
    const salt = makeSalt();
    const user: User = {
      id: uid("u"), name: name.trim() || email.split("@")[0], email, salt,
      passwordHash: await hashPassword(password, salt), role: "CUSTOMER",
      lang: store.ui.lang, currency: store.ui.currency, verified: false,
      verifyToken: randomToken(), verifyExpires: Date.now() + DAY,
      resetToken: null, resetExpires: null, createdAt: Date.now(), failedLogins: 0, lockedUntil: null,
    };
    store.mutate((d) => {
      d.users.push(user);
      d.sessionUserId = user.id; d.sessionToken = randomToken(); d.sessionExpires = Date.now() + 7 * DAY;
      mergeAnonCart(d, user.id);
      sendEmail(d, user, "welcome");
      sendEmail(d, user, "verify");
      notify(d, user.id, "n.welcome", undefined, "/account");
      audit(d, user, "REGISTERED", user.email, "verification email sent");
    });
    return user;
  },

  async login(email: string, password: string) {
    rateLimit("login", 12, 60000); // A21 — per-account lockout below adds a second layer
    const db = store.db;
    const user = db.users.find((u) => u.email === email.trim().toLowerCase());
    if (!user) throw new ApiError("au.wrong");
    if (user.lockedUntil && user.lockedUntil > Date.now()) throw new ApiError("au.locked");
    const ok = await verifyPassword(password, user.salt, user.passwordHash);
    if (!ok) {
      store.mutate((d) => {
        const u = d.users.find((x) => x.id === user.id)!;
        u.failedLogins += 1;
        const locked = u.failedLogins >= 5;
        if (locked) { u.lockedUntil = Date.now() + 5 * 60000; u.failedLogins = 0; }
        audit(d, u, locked ? "LOGIN_LOCKED" : "LOGIN_FAILED", u.email, locked ? "5 failures — 5 min lockout" : "");
      });
      throw new ApiError("au.wrong");
    }
    store.mutate((d) => {
      const u = d.users.find((x) => x.id === user.id)!;
      u.failedLogins = 0; u.lockedUntil = null;
      d.sessionUserId = u.id; d.sessionToken = randomToken(); d.sessionExpires = Date.now() + 7 * DAY;
      mergeAnonCart(d, u.id);
      audit(d, u, "LOGIN_SUCCESS", u.email, "session issued");
    });
    return user;
  },

  logout() {
    const current = currentUser();
    store.mutate((d) => {
      if (current) audit(d, current, "LOGOUT", current.email, "session invalidated");
      d.sessionUserId = null; d.sessionToken = null; d.sessionExpires = null;
    });
  },

  async requestReset(email: string) {
    rateLimit("reset", 3, 10 * 60000); // A21
    const user = store.db.users.find((u) => u.email === email.trim().toLowerCase());
    if (user)
      store.mutate((d) => {
        const u = d.users.find((x) => x.id === user.id)!;
        u.resetToken = randomToken(); u.resetExpires = Date.now() + 30 * 60000;
        audit(d, u, "RESET_REQUESTED", u.email, "token expires in 30 min");
        sendEmail(d, u, "reset");
      });
    // identical response whether or not the account exists — no enumeration
  },

  async resetPassword(token: string, password: string) {
    if (password.length < 8) throw new ApiError("au.short");
    const user = store.db.users.find((u) => u.resetToken === token);
    if (!user || !user.resetExpires || user.resetExpires < Date.now()) throw new ApiError("e.notFound");
    const salt = makeSalt();
    const hash = await hashPassword(password, salt);
    store.mutate((d) => {
      audit(d, user, "RESET_COMPLETED", user.email, "password rotated, token consumed");
      const u = d.users.find((x) => x.id === user.id)!;
      u.salt = salt; u.passwordHash = hash; u.resetToken = null; u.resetExpires = null;
    });
  },

  verifyEmail(token: string) {
    const user = store.db.users.find((u) => u.verifyToken === token);
    if (!user || !user.verifyExpires || user.verifyExpires < Date.now()) throw new ApiError("e.notFound");
    store.mutate((d) => {
      const u = d.users.find((x) => x.id === user.id)!;
      u.verified = true; u.verifyToken = null; u.verifyExpires = null;
      audit(d, u, "EMAIL_VERIFIED", u.email, "link token consumed");
    });
  },

  resendVerification() {
    rateLimit("verify", 3, 10 * 60000); // A21
    const u = requireAuth();
    store.mutate((d) => {
      const user = d.users.find((x) => x.id === u.id)!;
      user.verifyToken = randomToken(); user.verifyExpires = Date.now() + DAY;
      sendEmail(d, user, "verify");
    });
  },

  /** Step 1 of pre-payment email verification: issue a one-time code to the account email.
   *  Invalidates any previous code; the code itself never touches client state or URLs. */
  async requestPaymentOtp() {
    const u = requireAuth();
    rateLimit(`otp-req:${u.id}`, 3, 10 * 60000);
    const code = otpCode();
    const salt = randomToken(8);
    otpRecords.set(u.email, { hash: await sha256Hex(`${salt}::${code}`), salt, expires: Date.now() + OTP_TTL, attempts: 0 });
    store.mutate((d) => {
      const user = d.users.find((x) => x.id === u.id)!;
      sendEmail(d, user, "otp", undefined, code); // delivery is SANDBOX-simulated; code is hashed in state
      audit(d, user, "OTP_ISSUED", user.email, "hashed, 5 min TTL, previous invalidated");
    });
  },

  /** Step 2: verify the code. Single-use, attempt-capped, hash-compared in constant time.
   *  Success proves email ownership only — payment confirmation still comes from the provider. */
  async verifyPaymentOtp(code: string) {
    const u = requireAuth();
    rateLimit(`otp-verify:${u.id}`, 8, 10 * 60000);
    const rec = otpRecords.get(u.email);
    if (!rec || rec.expires < Date.now()) { otpRecords.delete(u.email); throw new ApiError("e.otpExpired"); }
    if (rec.attempts >= OTP_MAX_ATTEMPTS) { otpRecords.delete(u.email); throw new ApiError("e.otpLocked"); }
    const ok = timingSafeEqual(await sha256Hex(`${rec.salt}::${code.trim()}`), rec.hash);
    if (!ok) {
      rec.attempts += 1;
      store.mutate((d) => { audit(d, u, "OTP_FAILED", u.email, `attempt ${rec.attempts}/${OTP_MAX_ATTEMPTS}`); });
      throw new ApiError(rec.attempts >= OTP_MAX_ATTEMPTS ? "e.otpLocked" : "e.otpWrong");
    }
    otpRecords.delete(u.email); // one-time use
    store.mutate((d) => {
      const user = d.users.find((x) => x.id === u.id)!;
      user.verified = true; user.verifyToken = null; user.verifyExpires = null;
      audit(d, user, "OTP_VERIFIED", user.email, "email ownership confirmed — not payment proof");
    });
  },

  updateProfile(patch: { name?: string }) {
    const u = requireAuth();
    store.mutate((d) => { d.users.find((x) => x.id === u.id)!.name = patch.name?.trim() || u.name; });
  },

  async changePassword(current: string, next: string) {
    const u = requireAuth();
    if (!(await verifyPassword(current, u.salt, u.passwordHash))) throw new ApiError("au.wrong");
    if (next.length < 8) throw new ApiError("au.short");
    const salt = makeSalt();
    const hash = await hashPassword(next, salt);
    store.mutate((d) => { const x = d.users.find((y) => y.id === u.id)!; x.salt = salt; x.passwordHash = hash; });
  },

  /* ---------- cart (scoped per user / anonymous session — A15) & wishlist ---------- */
  addToCart(productId: string, qty = 1) {
    const p = store.db.products.find((x) => x.id === productId);
    if (!p || !p.active) throw new ApiError("e.notFound");
    const stock = availableStock(store.db, p);
    if (stock < 1) throw new ApiError("e.outOfStock");
    const owner = currentOwner();
    store.mutate((d) => {
      const cart = cartOf(d, owner);
      const line = cart.items.find((c) => c.productId === productId);
      const next = Math.min((line?.qty ?? 0) + qty, stock, 5);
      if (line) line.qty = next; else cart.items.push({ productId, qty: Math.min(qty, stock, 5) });
    });
  },
  setCartQty(productId: string, qty: number) {
    const p = store.db.products.find((x) => x.id === productId);
    const stock = p ? availableStock(store.db, p) : 0;
    const owner = currentOwner();
    store.mutate((d) => {
      const line = cartOf(d, owner).items.find((c) => c.productId === productId);
      if (!line) return;
      line.qty = Math.max(1, Math.min(qty, stock, 5));
    });
  },
  removeFromCart(productId: string) {
    const owner = currentOwner();
    store.mutate((d) => { const c = d.carts.find((x) => x.ownerId === owner); if (c) c.items = c.items.filter((i) => i.productId !== productId); });
  },
  clearCart() {
    const owner = currentOwner();
    store.mutate((d) => { const c = d.carts.find((x) => x.ownerId === owner); if (c) c.items = []; });
  },

  toggleWishlist(productId: string) {
    const u = requireAuth();
    store.mutate((d) => {
      const i = d.wishlist.findIndex((w) => w.userId === u.id && w.productId === productId);
      if (i >= 0) d.wishlist.splice(i, 1); else d.wishlist.push({ userId: u.id, productId });
    });
  },

  /* ---------- checkout ---------- */
  placeOrder(couponCode: string | null, paymentMethod: "STRIPE" | "PAYPAL" | "MIR"): Order {
    const u = requireAuth();
    rateLimit(`checkout:${u.id}`, 5, 60000); // A21 — repeated checkout attempts
    const db = store.db;
    // email ownership must be proven before any payment is initiated (req. 1) —
    // either at registration (verified) or via the one-time code flow in checkout
    if (!u.verified) throw new ApiError("e.otpRequired");
    if (db.settings.maintenanceMode) throw new ApiError("e.maintenance");
    const items = currentCartItems();
    if (items.length === 0) throw new ApiError("e.notFound");
    for (const it of items) {
      const p = db.products.find((x) => x.id === it.productId);
      if (!p || !p.active || availableStock(db, p) < it.qty) throw new ApiError("e.outOfStock");
    }
    if (couponCode && !vCouponCode(couponCode)) throw new ApiError("e.couponCode");
    const totals = computeTotals(items, couponCode, u.currency); // server-side repricing (A24)
    if (couponCode && totals.couponError) throw new ApiError(totals.couponError);

    const order: Order = {
      id: uid("o"), number: `SK-${new Date().getFullYear()}-${String(db.orderSeq).padStart(4, "0")}`,
      customerId: u.id, customerName: u.name, email: u.email,
      items: totals.lines.map((l) => ({ productId: l.product.id, name: l.product.name.en, image: l.product.image, qty: l.qty, unitUsd: l.unitUsd, lineTotalUsd: l.lineUsd, deliveryMethod: l.product.deliveryMethod })),
      couponCode: totals.coupon?.code ?? null, discountUsd: totals.discountUsd, taxUsd: totals.taxUsd,
      totalUsd: totals.totalUsd, currency: totals.currency, fxRate: totals.fxRate, totalMinor: totals.totalMinor,
      paymentMethod, paymentId: null, paymentStatus: "PENDING", fulfillmentStatus: "PENDING",
      delivery: null, deliveredBy: null,
      history: [{ at: Date.now(), state: "PENDING_PAYMENT", by: "customer" }],
      createdAt: Date.now(), paidAt: null, deliveredAt: null,
    };
    const provId = paymentMethod === "MIR" ? "MIR_ACQUIRER" as const : paymentMethod;
    const pm = paymentMethod === "MIR" ? "CARD_MIR" as const : paymentMethod === "PAYPAL" ? "PAYPAL" as const : "CARD_INTL" as const;
    store.mutate((d) => {
      d.orderSeq += 1;
      d.orders.unshift(order);
      audit(d, u, "PAYMENT_CREATED", order.number, `${provId} · ${order.currency} · server-priced ${order.totalMinor}`);
      d.payments.push({
        id: uid("pay"), orderId: order.id, provider: provId, providerRef: null,
        providerCustomerId: null, paymentMethod: pm,
        amountUsd: order.totalUsd, currency: order.currency, amountMinor: order.totalMinor,
        status: "PENDING", createdAt: Date.now(), capturedAt: null, updatedAt: Date.now(),
      });
      // transactional reservation — keys can never be double-sold
      for (const it of order.items) if (it.deliveryMethod === "AUTO") reserveKeys(d, it.productId, it.qty, order.id);
      cartOf(d, u.id).items = [];
      const anon = d.carts.find((x) => x.ownerId === anonId());
      if (anon) anon.items = [];
      notify(d, u.id, "n.order", { n: order.number }, `/account/orders/${order.id}`);
    });
    return order;
  },

  /** Provider round-trip through the adapter layer. State changes ONLY via a signed,
   *  verified, deduplicated provider event — the browser's view is never trusted (req. 12).
   *  SANDBOX: the gateway is local and signs with HMAC; production adapters call the real
   *  Stripe/PayPal/MIR-acquirer APIs and verification uses each provider's own scheme. */
  async confirmPayment(orderId: string, testInput?: string): Promise<{ duplicate: boolean }> {
    const u = requireAuth();
    rateLimit(`pay:${u.id}`, 6, 60000); // A21 — payment endpoint abuse
    const db = store.db;
    const order = db.orders.find((o) => o.id === orderId);
    if (!order || order.customerId !== u.id) throw new ApiError("e.notFound");
    if (order.paymentStatus === "PAID" || order.paymentStatus === "REFUNDED") throw new ApiError("e.transition"); // duplicate-payment protection
    const pid: ProviderId = order.paymentMethod === "MIR" ? "MIR_ACQUIRER" : order.paymentMethod;
    const cfg = providerCfg(db.settings, pid);
    if (!cfg.enabled || !cfg.operational) throw new ApiError("e.gateway");
    if (!cfg.currencies.includes(order.currency)) throw new ApiError("e.gateway"); // currency support enforced server-side

    const event = await PROVIDERS[pid].settle(order, cfg, testInput);

    // ---- server-side verification (req. 9) ----
    let ok = await verifyEventSignature(event);                       // signature
    ok = ok && event.orderId === orderId;                             // internal order id
    ok = ok && event.amountUsd === order.totalUsd;                    // amount
    ok = ok && event.currency === order.currency;                     // currency
    ok = ok && event.provider === pid;                                // merchant/provider
    if (!ok) throw new ApiError("e.gateway");

    const payment = db.payments.find((p) => p.orderId === orderId);
    if (payment && payment.status === "PENDING" && event.type === "payment.captured") {
      payment.status = "REQUIRES_ACTION"; payment.updatedAt = Date.now(); // 3DS-like intermediate state
    }
    const result = processPaymentEvent(db, {
      eventId: event.providerEventId, provider: pid, type: event.type, orderId,
      signatureValid: true, payloadHash: await eventPayloadHash(event), providerPaymentId: event.providerPaymentId,
    });
    store.persist(); store.emit();
    if (event.type === "payment.failed") throw new ApiError("e.declined");
    return result;
  },

  /* ---------- customer actions ---------- */
  addReview(productId: string, rating: number, text: string) {
    const u = requireAuth();
    const db = store.db;
    if (db.reviews.some((r) => r.productId === productId && r.customerId === u.id)) throw new ApiError("e.already");
    const purchased = db.orders.some((o) => o.customerId === u.id && o.paymentStatus !== "FAILED" && o.items.some((i) => i.productId === productId));
    store.mutate((d) => {
      d.reviews.unshift({
        id: uid("rv"), productId, customerId: u.id, customerName: u.name,
        rating: Math.min(5, Math.max(1, rating)), text: text.trim(), verified: purchased,
        approved: !d.settings.requireReviewApproval, reported: false, createdAt: Date.now(),
      });
    });
  },

  createTicket(subject: string, orderId: string | null, message: string) {
    const u = requireAuth();
    rateLimit(`ticket:${u.id}`, 5, 30 * 60000); // A21 — support abuse
    if (!vTicketSubject(subject) || !vTicketBody(message)) throw new ApiError("e.generic");
    const id = uid("tk");
    store.mutate((d) => {
      d.tickets.unshift({ id, customerId: u.id, orderId, subject: subject.trim(), status: "OPEN", assignee: null, createdAt: Date.now(), updatedAt: Date.now() });
      d.ticketMessages.push({ id: uid("tm"), ticketId: id, authorId: u.id, authorName: u.name, staff: false, text: message.trim(), createdAt: Date.now() });
      for (const s of d.users.filter((x) => x.role !== "CUSTOMER")) notify(d, s.id, "n.reply", undefined, `/admin/tickets`);
    });
    return id;
  },

  replyTicket(ticketId: string, text: string) {
    const u = requireAuth();
    store.mutate((d) => {
      const t = d.tickets.find((x) => x.id === ticketId);
      if (!t) return;
      const isStaffUser = u.role !== "CUSTOMER" && (t.customerId !== u.id);
      if (t.customerId !== u.id && !isStaffUser) throw new ApiError("e.forbidden");
      d.ticketMessages.push({ id: uid("tm"), ticketId, authorId: u.id, authorName: u.name, staff: isStaffUser, text: text.trim(), createdAt: Date.now() });
      t.updatedAt = Date.now();
      if (isStaffUser) {
        t.status = "PENDING";
        notify(d, t.customerId, "n.reply", undefined, `/support/${t.id}`);
      } else t.status = "OPEN";
    });
  },

  closeTicket(ticketId: string) {
    const u = requireAuth();
    store.mutate((d) => {
      const t = d.tickets.find((x) => x.id === ticketId);
      if (!t) return;
      if (t.customerId !== u.id && u.role === "CUSTOMER") throw new ApiError("e.forbidden");
      t.status = "CLOSED"; t.updatedAt = Date.now();
    });
  },

  markAllRead() {
    const u = requireAuth();
    store.mutate((d) => { d.notifications.forEach((n) => { if (n.userId === u.id) n.read = true; }); });
  },
  markRead(id: string) { store.mutate((d) => { const n = d.notifications.find((x) => x.id === id); if (n) n.read = true; }); },

  /* ---------- admin: orders ---------- */
  deliverManual(orderId: string, payload: DeliveryPayload) {
    const actor = requirePerm("deliver");
    store.mutate((d) => {
      const o = d.orders.find((x) => x.id === orderId);
      if (!o) throw new ApiError("e.notFound");
      if (o.paymentStatus !== "PAID") throw new ApiError("e.notPaid"); // never deliver unpaid orders (A13)
      o.delivery = { ...payload, keys: [...(o.delivery?.keys ?? []), ...payload.keys] }; // merge with auto-delivered keys
      o.deliveredBy = actor.id;
      setFulfillmentStatus(o, "DELIVERED", `manual:${actor.name}`); // repeated delivery → e.transition
      const customer = d.users.find((x) => x.id === o.customerId);
      if (customer) { sendEmail(d, customer, "delivered", o.number); notify(d, customer.id, "n.delivered", { n: o.number }, `/account/orders/${o.id}`); }
      audit(d, actor, "MANUAL_DELIVERED", o.number, payload.keys.length ? `${payload.keys.length} key(s)` : payload.account ? "account credentials" : "delivery data");
    });
  },

  completeOrder(orderId: string) {
    const actor = requirePerm("orders");
    store.mutate((d) => {
      const o = d.orders.find((x) => x.id === orderId);
      if (!o) throw new ApiError("e.notFound");
      setFulfillmentStatus(o, "COMPLETED", staff(actor)); // only DELIVERED → COMPLETED
      for (const k of d.licenseKeys) if (k.orderId === o.id && k.status === "DELIVERED") k.status = "USED";
      audit(d, actor, "ORDER_COMPLETED", o.number, "");
    });
  },

  refundOrder(orderId: string, reason: string) {
    const actor = requirePerm("refund");
    store.mutate((d) => {
      const o = d.orders.find((x) => x.id === orderId);
      if (!o || o.paymentStatus !== "PAID") throw new ApiError("e.notPaid");
      const payment = d.payments.find((p) => p.orderId === o.id);
      if (payment) payment.status = "REFUNDED";
      // SANDBOX: refund id generated inline; production calls the acquirer's refund API
      d.refunds.unshift({ id: uid("rf"), orderId: o.id, paymentId: payment?.id ?? "", providerRefundId: `re_${randomToken(8)}`, status: "SUCCEEDED", amountUsd: o.totalUsd, reason, issuedBy: actor.id, createdAt: Date.now() });
      setPaymentStatus(o, "REFUNDED", staff(actor)); // REFUNDED is terminal — double refund throws
      setFulfillmentStatus(o, "CANCELLED", staff(actor));
      for (const k of d.licenseKeys)
        if (k.orderId === o.id) { if (k.status === "DELIVERED" || k.status === "USED") k.status = "REVOKED"; else if (k.status === "RESERVED") { k.status = "UNUSED"; k.orderId = null; } }
      const customer = d.users.find((x) => x.id === o.customerId);
      if (customer) { sendEmail(d, customer, "refund", o.number); notify(d, customer.id, "n.refund", { n: o.number }, `/account/orders/${o.id}`); }
      audit(d, actor, "REFUND_ISSUED", o.number, `$${(o.totalUsd / 100).toFixed(2)} — ${reason}`);
    });
  },

  cancelOrder(orderId: string) {
    const actor = requirePerm("cancel");
    store.mutate((d) => {
      const o = d.orders.find((x) => x.id === orderId);
      if (!o) throw new ApiError("e.notFound");
      releaseReserved(d, o.id);
      if (o.paymentStatus === "PAID") {
        const payment = d.payments.find((p) => p.orderId === o.id);
        if (payment) payment.status = "REFUNDED";
        d.refunds.unshift({ id: uid("rf"), orderId: o.id, paymentId: payment?.id ?? "", providerRefundId: `re_${randomToken(8)}`, status: "SUCCEEDED", amountUsd: o.totalUsd, reason: "Cancelled by staff", issuedBy: actor.id, createdAt: Date.now() });
        setPaymentStatus(o, "REFUNDED", staff(actor));
      } else {
        setPaymentStatus(o, "FAILED", staff(actor)); // PENDING → FAILED; terminal states throw
      }
      setFulfillmentStatus(o, "CANCELLED", staff(actor));
      const customer = d.users.find((x) => x.id === o.customerId);
      if (customer) { sendEmail(d, customer, "cancelled", o.number); notify(d, customer.id, "n.status", { n: o.number }, `/account/orders/${o.id}`); }
      audit(d, actor, "ORDER_CANCELLED", o.number, "");
    });
  },

  resendReceipt(orderId: string) {
    const actor = requirePerm("orders");
    store.mutate((d) => {
      const o = d.orders.find((x) => x.id === orderId);
      if (!o) return;
      const customer = d.users.find((x) => x.id === o.customerId);
      if (customer) sendEmail(d, customer, o.fulfillmentStatus === "DELIVERED" || o.fulfillmentStatus === "COMPLETED" ? "delivered" : "order_receipt", o.number);
      audit(d, actor, "EMAIL_RESENT", o.number, "");
    });
  },

  /* ---------- admin: keys ---------- */
  importKeys(productId: string, raw: string): number {
    const actor = requirePerm("keys");
    const db = store.db;
    const existing = new Set(db.licenseKeys.map((k) => k.key));
    const lines = vKeyLines(raw).filter((s) => !existing.has(s)); // A22 — validated at the boundary
    store.mutate((d) => {
      for (const key of lines) { existing.add(key); d.licenseKeys.push({ id: uid("k"), productId, key, status: "UNUSED", orderId: null, reservedAt: null, deliveredAt: null, customerId: null }); }
      audit(d, actor, "KEYS_IMPORTED", db.products.find((p) => p.id === productId)?.slug ?? productId, `${lines.length} keys`);
    });
    return lines.length;
  },

  revokeKey(keyId: string) {
    const actor = requirePerm("keys");
    store.mutate((d) => {
      const k = d.licenseKeys.find((x) => x.id === keyId);
      if (!k || k.status === "DELIVERED" || k.status === "USED") throw new ApiError("e.forbidden");
      k.status = "REVOKED";
      audit(d, actor, "KEY_REVOKED", k.key.slice(0, 9) + "…", "");
    });
  },

  /* ---------- admin: products ---------- */
  saveProduct(p: Product, isNew: boolean) {
    const actor = requirePerm("products");
    store.mutate((d) => {
      if (isNew) { d.products.unshift({ ...p, createdAt: Date.now() }); audit(d, actor, "PRODUCT_CREATED", p.slug, p.name.en); }
      else {
        const old = d.products.find((x) => x.id === p.id);
        if (old && old.priceUsd !== p.priceUsd) audit(d, actor, "PRICE_CHANGED", p.slug, `$${(old.priceUsd / 100).toFixed(2)} → $${(p.priceUsd / 100).toFixed(2)}`);
        const i = d.products.findIndex((x) => x.id === p.id);
        if (i >= 0) d.products[i] = p;
        audit(d, actor, "PRODUCT_UPDATED", p.slug, "");
      }
    });
  },

  toggleProduct(id: string, flag: "active" | "featured" | "isNew") {
    const actor = requirePerm("products");
    store.mutate((d) => {
      const p = d.products.find((x) => x.id === id);
      if (!p) return;
      p[flag] = !p[flag];
      audit(d, actor, `PRODUCT_${flag.toUpperCase()}_${p[flag] ? "ON" : "OFF"}`, p.slug, "");
    });
  },

  /* ---------- admin: coupons ---------- */
  saveCoupon(c: Coupon, isNew: boolean) {
    const actor = requirePerm("coupons");
    store.mutate((d) => {
      if (isNew) d.coupons.unshift(c);
      else { const i = d.coupons.findIndex((x) => x.code === c.code); if (i >= 0) d.coupons[i] = c; }
      audit(d, actor, isNew ? "COUPON_CREATED" : "COUPON_UPDATED", c.code, `${c.type} ${c.type === "PERCENT" ? c.value + "%" : "$" + c.value / 100}`);
    });
  },
  toggleCoupon(code: string) {
    const actor = requirePerm("coupons");
    store.mutate((d) => {
      const c = d.coupons.find((x) => x.code === code);
      if (c) { c.active = !c.active; audit(d, actor, c.active ? "COUPON_ACTIVATED" : "COUPON_DEACTIVATED", code, ""); }
    });
  },
  deleteCoupon(code: string) {
    const actor = requirePerm("coupons");
    store.mutate((d) => { d.coupons = d.coupons.filter((x) => x.code !== code); audit(d, actor, "COUPON_DELETED", code, ""); });
  },

  /* ---------- admin: customers ---------- */
  setRole(userId: string, role: Role) {
    const actor = requirePerm("roles");
    if (actor.id === userId) throw new ApiError("e.selfRole");
    store.mutate((d) => {
      const u = d.users.find((x) => x.id === userId);
      if (!u) return;
      const old = u.role; u.role = role;
      audit(d, actor, "ROLE_CHANGED", u.email, `${old} → ${role}`);
    });
  },

  /* ---------- admin: tickets / reviews / emails ---------- */
  setTicketStatus(ticketId: string, status: "OPEN" | "PENDING" | "CLOSED") {
    requirePerm("tickets");
    store.mutate((d) => { const t = d.tickets.find((x) => x.id === ticketId); if (t) { t.status = status; t.updatedAt = Date.now(); } });
  },
  assignTicket(ticketId: string) {
    const actor = requirePerm("tickets");
    store.mutate((d) => { const t = d.tickets.find((x) => x.id === ticketId); if (t) { t.assignee = actor.id; if (t.status === "OPEN") t.status = "PENDING"; } });
  },
  moderateReview(id: string, approved: boolean) {
    const actor = requirePerm("products");
    store.mutate((d) => { const r = d.reviews.find((x) => x.id === id); if (r) { r.approved = approved; audit(d, actor, approved ? "REVIEW_APPROVED" : "REVIEW_REJECTED", r.id.slice(0, 10), ""); } });
  },
  deleteReview(id: string) {
    const actor = requirePerm("products");
    store.mutate((d) => { d.reviews = d.reviews.filter((x) => x.id !== id); audit(d, actor, "REVIEW_DELETED", id.slice(0, 10), ""); });
  },
  retryEmail(id: string) {
    requirePerm("emails");
    store.mutate((d) => { const e = d.emailLogs.find((x) => x.id === id); if (e) { e.status = "SENT"; e.createdAt = Date.now(); } });
  },
  sendTestEmail() {
    const actor = requirePerm("emails");
    store.mutate((d) => { sendEmail(d, { email: actor.email, name: actor.name, lang: actor.lang }, "test"); });
  },

  updateSettings(patch: Partial<DB["settings"]>) {
    const actor = requirePerm("settings");
    store.mutate((d) => {
      d.settings = { ...d.settings, ...patch };
      audit(d, actor, "SETTINGS_CHANGED", Object.keys(patch).join(","), "");
    });
  },

  /* ---------- payment provider configuration (req. 6) — OWNER only ----------
   * Only non-secret flags are stored here (enabled/mode/currencies/operational).
   * Real credentials live server-side, encrypted at rest, and are never returned
   * to the client — the UI only ever sees masked merchant labels. */
  updateProviderConfig(id: ProviderId, patch: Partial<ProviderCfg>) {
    const actor = requirePerm("payments");
    if (actor.role !== "OWNER") throw new ApiError("e.forbidden");
    store.mutate((d) => {
      const providers = { ...(d.settings.providers ?? JSON.parse(JSON.stringify({})) as object) } as Record<ProviderId, ProviderCfg>;
      providers[id] = { ...providerCfg(d.settings, id), ...patch, merchantMasked: providerCfg(d.settings, id).merchantMasked }; // credentials never updatable from client
      d.settings = { ...d.settings, providers };
      audit(d, actor, "PROVIDER_CONFIG", id, Object.keys(patch).join(","));
    });
  },

  updatePaymentRouting(patch: Partial<PaymentRouting>) {
    const actor = requirePerm("payments");
    if (actor.role !== "OWNER") throw new ApiError("e.forbidden");
    store.mutate((d) => {
      d.settings = { ...d.settings, routing: { ...(d.settings.routing ?? { CARD_INTL: "STRIPE", CARD_MIR: "MIR_ACQUIRER", PAYPAL: "PAYPAL" }), ...patch } };
      audit(d, actor, "PAYMENT_ROUTING", "routing", Object.entries(patch).map(([k, v]) => `${k}→${v}`).join(","));
    });
  },
};

/* ------------------------------------------------------------------ */
/* Selectors                                                           */
/* ------------------------------------------------------------------ */

export function orderStateKey(o: Order): string {
  if (o.paymentStatus === "FAILED") return "st.FAILED";
  if (o.paymentStatus === "REFUNDED") return "st.REFUNDED";
  if (o.paymentStatus === "PENDING") return "st.PENDING_PAYMENT";
  return `st.${o.fulfillmentStatus}`;
}

export function stats(db: DB) {
  const paidLike = (o: Order) => o.paymentStatus === "PAID" || o.paymentStatus === "REFUNDED";
  const now = Date.now();
  const revenueUsd = db.orders.filter(paidLike).reduce((s, o) => s + o.totalUsd, 0);
  const revenue30 = db.orders.filter((o) => paidLike(o) && o.createdAt > now - 30 * DAY).reduce((s, o) => s + o.totalUsd, 0);
  const days: { label: string; usd: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const start = now - i * DAY;
    const dayStart = new Date(start); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = dayStart.getTime() + DAY;
    const usd = db.orders.filter((o) => paidLike(o) && o.createdAt >= dayStart.getTime() && o.createdAt < dayEnd).reduce((s, o) => s + o.totalUsd, 0);
    days.push({ label: new Date(dayStart).toLocaleDateString("en", { day: "2-digit", month: "2-digit" }), usd });
  }
  return {
    revenueUsd, revenue30, days,
    orders: db.orders.length,
    customers: db.users.filter((u) => u.role === "CUSTOMER").length,
    vaultKeys: db.licenseKeys.filter((k) => k.status === "UNUSED").length,
    deliveredKeys: db.licenseKeys.filter((k) => k.status === "DELIVERED" || k.status === "USED").length,
    pendingManual: db.orders.filter((o) => o.paymentStatus === "PAID" && o.fulfillmentStatus === "PROCESSING").length,
    failedPayments: db.orders.filter((o) => o.paymentStatus === "FAILED").length,
    lowStock: db.products.filter((p) => p.active && availableStock(db, p) <= p.lowStockThreshold),
    productsLive: db.products.filter((p) => p.active).length,
    paymentsToday: db.paymentEvents.filter((e) => e.type === "payment.captured" && e.receivedAt > new Date(new Date().setHours(0, 0, 0, 0)).getTime()).length,
  };
}

export function productSales(db: DB, productId: string): number {
  return db.orders.filter((o) => o.paymentStatus !== "FAILED").reduce((s, o) => s + o.items.filter((i) => i.productId === productId).reduce((x, i) => x + i.qty, 0), 0);
}

export function productRating(db: DB, productId: string): { avg: number; count: number } {
  const rs = db.reviews.filter((r) => r.productId === productId && r.approved);
  if (rs.length === 0) return { avg: 0, count: 0 };
  return { avg: rs.reduce((s, r) => s + r.rating, 0) / rs.length, count: rs.length };
}

/* ------------------------------------------------------------------ */
/* Production facade (§1): every action is a real server call. The     */
/* browser never decides prices, roles, payment state or ownership —   */
/* it renders the server's role-scoped snapshot and forwards intent.   */
/* ------------------------------------------------------------------ */

type SandboxApi = typeof sandboxApi;
const serverPending = () => { throw new ApiError("e.serverPending"); };

const serverRoutes: Record<string, (...args: never[]) => Promise<unknown> | unknown> = {
  /* auth — HttpOnly session cookie set by the server on success */
  register: async (name: string, email: string, password: string) => {
    await serverFetch("/api/auth/register", { body: { name, email, password, confirm: password, lang: store.ui.lang, currency: store.ui.currency } });
    await store.refresh();
  },
  login: async (email: string, password: string) => {
    await serverFetch("/api/auth/login", { body: { email, password } });
    await store.refresh();
  },
  logout: async () => { await serverFetch("/api/auth/logout", { body: {} }); await store.refresh(); },
  requestReset: async (email: string) => { await serverFetch("/api/auth/forgot", { body: { email } }); },
  resetPassword: async (token: string, password: string) => { await serverFetch("/api/auth/reset", { body: { token, password } }); },
  verifyEmail: async (token: string) => {
    const r = await serverFetch<{ ok: boolean }>("/api/auth/verify-email", { body: { token } });
    if (!r.ok) throw new ApiError("e.notFound");
    await store.refresh();
  },
  resendVerification: async () => { await serverFetch("/api/auth/resend-verification", { body: {} }); },
  /* OTP — the code travels email→server only; never through this client (§6/§7) */
  requestPaymentOtp: async () => { await serverFetch("/api/auth/otp/request", { body: {} }); },
  verifyPaymentOtp: async (code: string) => {
    const r = await serverFetch<{ ok: boolean }>("/api/auth/otp/verify", { body: { code } });
    if (!r.ok) throw new ApiError("e.otpWrong");
    await store.refresh();
  },
  updateProfile: async (patch: { name?: string }) => { await serverFetch("/api/account/profile", { body: patch }); await store.refresh(); },

  /* cart — server-scoped to the session (§30) */
  addToCart: async (productId: string, qty: number) => { await serverFetch("/api/cart/items", { body: { productId, qty } }); await store.refresh(); },
  updateQty: async (productId: string, qty: number) => { await serverFetch("/api/cart/items", { body: { productId, qty } }); await store.refresh(); },
  removeFromCart: async (productId: string) => { await serverFetch(`/api/cart/items/${productId}`, { method: "DELETE" }); await store.refresh(); },

  /* checkout — server recalculates everything and returns the provider redirect (§10–§13).
   * The browser NEVER marks anything PAID; that happens only via verified webhook/capture. */
  placeOrder: async (couponCode: string | null, method: "STRIPE" | "PAYPAL" | "MIR") => {
    const m = method === "MIR" ? "CARD_MIR" : method;
    const r = await serverFetch<{ orderId: string; redirect?: string; paypalOrderId?: string }>("/api/checkout", { body: { couponCode, method: m } });
    await store.refresh();
    return r;
  },
  confirmPayment: async (orderId: string) => {
    // No client-side confirmation exists in production. Re-sync and report the server state.
    await store.refresh();
    const o = store.db.orders.find((x) => x.id === orderId);
    return { duplicate: false, status: o?.paymentStatus ?? "PENDING" };
  },

  /* engagement */
  toggleWishlist: async (productId: string) => { await serverFetch(`/api/wishlist/${productId}`, { body: {} }); await store.refresh(); },
  addReview: async (productId: string, rating: number, text: string) => { await serverFetch("/api/reviews", { body: { productId, rating, text } }); await store.refresh(); },
  markRead: async (id: string) => { await serverFetch(`/api/notifications/${id}/read`, { body: {} }); await store.refresh(); },
  markAllRead: async () => { await serverFetch("/api/notifications/read-all", { body: {} }); await store.refresh(); },
  createTicket: async (subject: string, orderId: string | null, message: string) => {
    const r = await serverFetch<{ id: string }>("/api/tickets", { body: { subject, orderId, message } });
    await store.refresh();
    return r.id;
  },
  replyTicket: async (id: string, text: string) => { await serverFetch(`/api/tickets/${id}/messages`, { body: { text } }); await store.refresh(); },
  closeTicket: async (id: string) => { await serverFetch(`/api/tickets/${id}/close`, { body: {} }); await store.refresh(); },

  /* admin — real RBAC-protected endpoints (§19); the server re-checks every call */
  deliverManual: async (orderId: string, payload: DeliveryPayload) => { await serverFetch(`/api/admin/orders/${orderId}/deliver`, { body: payload }); await store.refresh(); },
  refundOrder: async (orderId: string, reason: string) => { await serverFetch(`/api/admin/orders/${orderId}/refund`, { body: { reason } }); await store.refresh(); },
};

const serverApi = new Proxy({} as SandboxApi, {
  get(_target, prop: string) {
    if (prop in serverRoutes) return serverRoutes[prop];
    return serverPending; // honest: action has no production endpoint yet — never a silent sandbox
  },
});

export const api: SandboxApi = SERVER_MODE ? serverApi : sandboxApi;

/* Surface server-side failures from fire-and-forget calls as visible toasts (§31). */
if (SERVER_MODE && typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (e) => {
    const err = e.reason as ApiError | undefined;
    if (err instanceof ApiError) store.toast(tr(store.ui.lang, err.code, err.vars), "err");
  });
}
