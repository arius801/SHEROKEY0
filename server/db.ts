/**
 * SHEROKEY — PostgreSQL schema (Drizzle ORM).
 *
 * This is the AUTHORITATIVE data model. The browser build contains a sandbox
 * adapter with the same shapes for local preview only; in production every
 * service in server/services.ts reads and writes exclusively through this schema.
 *
 * Connection: DATABASE_URL from the environment. Never hardcoded.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  pgTable, uuid, text, varchar, boolean, integer, bigint, timestamp,
  index, uniqueIndex, pgEnum, jsonb, serial,
} from "drizzle-orm/pg-core";

/* ---------------------------------------------------------------- enums */
export const roleEnum = pgEnum("role", ["CUSTOMER", "SUPPORT", "ADMIN", "OWNER"]);
export const langEnum = pgEnum("lang", ["en", "ar", "ru", "fr"]);
export const currencyEnum = pgEnum("currency", ["USD", "EUR", "SAR", "RUB"]);
export const deliveryEnum = pgEnum("delivery_method", ["AUTO", "MANUAL"]);
export const keyStatusEnum = pgEnum("key_status", ["UNUSED", "RESERVED", "DELIVERED", "USED", "REVOKED"]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "PENDING", "REQUIRES_ACTION", "AUTHORIZED", "PAID", "FAILED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED",
]);
export const fulfillmentEnum = pgEnum("fulfillment_status", ["PENDING", "PROCESSING", "DELIVERED", "COMPLETED", "CANCELLED"]);
export const providerEnum = pgEnum("provider", ["STRIPE", "PAYPAL", "MIR_ACQUIRER"]);
export const payMethodEnum = pgEnum("pay_method", ["CARD_INTL", "CARD_MIR", "PAYPAL"]);
export const couponTypeEnum = pgEnum("coupon_type", ["PERCENT", "FIXED"]);
export const ticketStatusEnum = pgEnum("ticket_status", ["OPEN", "PENDING", "CLOSED"]);
export const emailStatusEnum = pgEnum("email_status", ["QUEUED", "SENT", "FAILED"]);

/* ---------------------------------------------------------------- auth */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 320 }).notNull(),
  passwordHash: text("password_hash").notNull(),            // argon2id output — never plaintext
  name: varchar("name", { length: 120 }).notNull(),
  role: roleEnum("role").notNull().default("CUSTOMER"),
  lang: langEnum("lang").notNull().default("en"),
  currency: currencyEnum("currency").notNull().default("USD"),
  emailVerified: boolean("email_verified").notNull().default(false),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("users_email_uq").on(t.email)]);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),                  // sha256(session cookie) — cookie value never stored
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  replacedBy: uuid("replaced_by"),                          // rotation chain
}, (t) => [uniqueIndex("sessions_token_uq").on(t.tokenHash), index("sessions_user_idx").on(t.userId)]);

export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),                  // sha256(token) only — raw token exists only in the email
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),     // single-use
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("evt_hash_uq").on(t.tokenHash), index("evt_user_idx").on(t.userId)]);

export const otpCodes = pgTable("otp_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  salt: varchar("salt", { length: 32 }).notNull(),
  codeHash: text("code_hash").notNull(),                    // sha256(salt::code) — plaintext never stored
  purpose: varchar("purpose", { length: 24 }).notNull().default("checkout"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("otp_user_idx").on(t.userId)]);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("prt_hash_uq").on(t.tokenHash)]);

/* ---------------------------------------------------------------- catalog */
export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 80 }).notNull(),
  icon: varchar("icon", { length: 40 }).notNull().default("software"),
  name: jsonb("name").$type<{ en: string; ar: string; ru: string; fr: string }>().notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("cat_slug_uq").on(t.slug)]);

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 120 }).notNull(),
  categoryId: uuid("category_id").references(() => categories.id),
  name: jsonb("name").$type<{ en: string; ar: string; ru: string; fr: string }>().notNull(),
  short: jsonb("short").$type<{ en: string; ar: string; ru: string; fr: string }>().notNull(),
  description: jsonb("description").$type<{ en: string; ar: string; ru: string; fr: string }>().notNull(),
  requirements: jsonb("requirements").$type<{ en: string; ar: string; ru: string; fr: string }>().notNull(),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  priceMinor: bigint("price_minor", { mode: "number" }).notNull(),        // USD minor units — integer math only
  compareAtMinor: bigint("compare_at_minor", { mode: "number" }),
  deliveryMethod: deliveryEnum("delivery_method").notNull(),
  durationMonths: integer("duration_months"),
  stock: integer("stock").notNull().default(0),                           // MANUAL delivery pool; AUTO stock = UNUSED keys
  lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
  active: boolean("active").notNull().default(true),
  featured: boolean("featured").notNull().default(false),
  isNew: boolean("is_new").notNull().default(false),
  image: text("image").notNull(),
  accent: varchar("accent", { length: 9 }).notNull().default("#2fc98a"),
  seoTitle: text("seo_title").notNull(),
  seoDescription: text("seo_description").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("prod_slug_uq").on(t.slug), index("prod_cat_idx").on(t.categoryId)]);

export const licenseKeys = pgTable("license_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  status: keyStatusEnum("status").notNull().default("UNUSED"),
  orderId: uuid("order_id"),
  customerId: uuid("customer_id"),
  reservedAt: timestamp("reserved_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("license_key_uq").on(t.key),
  index("license_pool_idx").on(t.productId, t.status),                    // the reservation hot path
]);

/* ---------------------------------------------------------------- commerce */
export const carts = pgTable("carts", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id"),                                              // null → anonymous (session-scoped)
  anonymousId: varchar("anonymous_id", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("carts_owner_idx").on(t.ownerId), index("carts_anon_idx").on(t.anonymousId)]);

export const cartItems = pgTable("cart_items", {
  id: serial("id").primaryKey(),
  cartId: uuid("cart_id").notNull().references(() => carts.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  qty: integer("qty").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("cart_item_uq").on(t.cartId, t.productId)]);

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: varchar("number", { length: 24 }).notNull(),
  customerId: uuid("customer_id").notNull().references(() => users.id),
  customerName: varchar("customer_name", { length: 120 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  currency: currencyEnum("currency").notNull(),
  fxRate: jsonb("fx_rate").notNull(),                                     // frozen server-side rate snapshot
  subtotalMinor: bigint("subtotal_minor", { mode: "number" }).notNull(),  // in order currency
  discountMinor: bigint("discount_minor", { mode: "number" }).notNull().default(0),
  taxMinor: bigint("tax_minor", { mode: "number" }).notNull().default(0),
  totalMinor: bigint("total_minor", { mode: "number" }).notNull(),
  totalUsdMinor: bigint("total_usd_minor", { mode: "number" }).notNull(), // settlement reference
  couponCode: varchar("coupon_code", { length: 40 }),
  payMethod: payMethodEnum("pay_method").notNull(),
  provider: providerEnum("provider").notNull(),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("PENDING"),
  fulfillmentStatus: fulfillmentEnum("fulfillment_status").notNull().default("PENDING"),
  delivery: jsonb("delivery").$type<{
    keys: string[]; activationCode: string | null; account: string | null;
    downloadLink: string | null; notes: string | null;
  } | null>(),
  deliveredBy: uuid("delivered_by"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("orders_number_uq").on(t.number), index("orders_customer_idx").on(t.customerId), index("orders_status_idx").on(t.paymentStatus, t.fulfillmentStatus)]);

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id),
  nameSnapshot: text("name_snapshot").notNull(),
  imageSnapshot: text("image_snapshot").notNull(),
  qty: integer("qty").notNull(),
  unitUsdMinor: bigint("unit_usd_minor", { mode: "number" }).notNull(),   // price snapshot at purchase
  lineUsdMinor: bigint("line_usd_minor", { mode: "number" }).notNull(),
  deliveryMethod: deliveryEnum("delivery_method").notNull(),
}, (t) => [index("order_items_order_idx").on(t.orderId)]);

export const orderStatusHistory = pgTable("order_status_history", {
  id: serial("id").primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  state: varchar("state", { length: 32 }).notNull(),
  actor: varchar("actor", { length: 120 }).notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("osh_order_idx").on(t.orderId)]);

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  provider: providerEnum("provider").notNull(),
  payMethod: payMethodEnum("pay_method").notNull(),
  providerPaymentId: varchar("provider_payment_id", { length: 120 }),
  providerCustomerId: varchar("provider_customer_id", { length: 120 }),
  amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  currency: currencyEnum("currency").notNull(),
  status: paymentStatusEnum("status").notNull().default("PENDING"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  capturedAt: timestamp("captured_at", { withTimezone: true }),
}, (t) => [index("payments_order_idx").on(t.orderId), index("payments_provider_ref_idx").on(t.provider, t.providerPaymentId)]);

/** Webhook events — UNIQUE(provider, event_id) is the idempotency guarantee. */
export const paymentEvents = pgTable("payment_events", {
  id: serial("id").primaryKey(),
  provider: providerEnum("provider").notNull(),
  eventId: varchar("event_id", { length: 160 }).notNull(),
  eventType: varchar("event_type", { length: 60 }).notNull(),
  payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
  orderId: uuid("order_id"),
  processed: boolean("processed").notNull().default(false),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("payment_events_uq").on(t.provider, t.eventId)]);

export const refunds = pgTable("refunds", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentId: uuid("payment_id").notNull().references(() => payments.id),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  providerRefundId: varchar("provider_refund_id", { length: 120 }),
  amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  currency: currencyEnum("currency").notNull(),
  reason: text("reason").notNull(),
  issuedBy: uuid("issued_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("refunds_order_idx").on(t.orderId)]);

export const coupons = pgTable("coupons", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 40 }).notNull(),
  type: couponTypeEnum("type").notNull(),
  value: integer("value").notNull(),                                      // percent 1–90 or fixed USD minor units
  minOrderUsdMinor: bigint("min_order_usd_minor", { mode: "number" }).notNull().default(0),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  maxUses: integer("max_uses").notNull(),
  maxPerCustomer: integer("max_per_customer").notNull().default(1),
  uses: integer("uses").notNull().default(0),
  active: boolean("active").notNull().default(true),
  productIds: jsonb("product_ids").$type<string[]>().notNull().default([]),
}, (t) => [uniqueIndex("coupons_code_uq").on(t.code)]);

export const couponRedemptions = pgTable("coupon_redemptions", {
  id: serial("id").primaryKey(),
  couponId: uuid("coupon_id").notNull().references(() => coupons.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").notNull().references(() => users.id),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("redemption_order_uq").on(t.orderId), index("redemption_customer_idx").on(t.couponId, t.customerId)]);

/* ---------------------------------------------------------------- engagement */
export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  text: text("text").notNull(),
  verifiedPurchase: boolean("verified_purchase").notNull().default(false),
  approved: boolean("approved").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("reviews_one_per_user").on(t.productId, t.customerId)]);

export const wishlistItems = pgTable("wishlist_items", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("wishlist_uq").on(t.userId, t.productId)]);

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 40 }).notNull(),
  vars: jsonb("vars").$type<Record<string, string>>(),
  link: text("link"),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("notif_user_idx").on(t.userId, t.read)]);

export const supportTickets = pgTable("support_tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => users.id),
  orderId: uuid("order_id"),
  subject: varchar("subject", { length: 160 }).notNull(),
  status: ticketStatusEnum("status").notNull().default("OPEN"),
  assigneeId: uuid("assignee_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("tickets_customer_idx").on(t.customerId)]);

export const supportTicketMessages = pgTable("support_ticket_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticketId: uuid("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => users.id),
  staff: boolean("staff").notNull().default(false),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("stm_ticket_idx").on(t.ticketId)]);

/* ---------------------------------------------------------------- ops */
export const emailLogs = pgTable("email_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  to: varchar("to", { length: 320 }).notNull(),
  toName: varchar("to_name", { length: 120 }).notNull(),
  template: varchar("template", { length: 40 }).notNull(),
  subject: text("subject").notNull(),
  lang: langEnum("lang").notNull(),
  provider: varchar("provider", { length: 20 }).notNull(),
  providerMessageId: varchar("provider_message_id", { length: 160 }),
  status: emailStatusEnum("status").notNull().default("QUEUED"),
  error: text("error"),
  // NOTE: plaintext OTPs/keys are NEVER persisted here — only template id + vars-free subject
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("email_logs_status_idx").on(t.status)]);

export const auditLogs = pgTable("audit_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  actorId: uuid("actor_id"),
  actorName: varchar("actor_name", { length: 120 }).notNull(),
  action: varchar("action", { length: 40 }).notNull(),
  target: varchar("target", { length: 160 }).notNull(),
  meta: text("meta").notNull().default(""),
  ip: varchar("ip", { length: 45 }),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("audit_action_idx").on(t.action), index("audit_actor_idx").on(t.actorId)]);

export const settings = pgTable("settings", {
  key: varchar("key", { length: 60 }).primaryKey(),
  value: jsonb("value").notNull(),
  encrypted: boolean("encrypted").notNull().default(false),               // provider secrets → pgp-encrypted at rest
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------------------------------------------------------------- connection */
const url = process.env.DATABASE_URL;
export const client = url ? postgres(url, { max: 10, prepare: false }) : null;
export const db = client ? drizzle(client) : null;

export function requireDb() {
  if (!db) throw new Error("DATABASE_CONNECTION_REQUIRED — set DATABASE_URL and run migrations/0000_init.sql");
  return db;
}
