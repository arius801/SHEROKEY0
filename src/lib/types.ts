/** Domain model — mirrors the production PostgreSQL schema 1:1 (see ARCHITECTURE). */

export type Lang = "en" | "ar" | "ru" | "fr";
export type Currency = "USD" | "EUR" | "SAR" | "RUB";
export type Theme = "dark" | "light";

export type Role = "OWNER" | "ADMIN" | "SUPPORT" | "CUSTOMER";

export interface User {
  id: string;
  name: string;
  email: string;
  /** salt + argon2id-style digest (production: argon2id server-side) */
  salt: string;
  passwordHash: string;
  role: Role;
  lang: Lang;
  currency: Currency;
  verified: boolean;
  verifyToken: string | null;
  verifyExpires: number | null;
  resetToken: string | null;
  resetExpires: number | null;
  createdAt: number;
  failedLogins: number;
  lockedUntil: number | null;
}

export interface L10n { en: string; ar: string; ru: string; fr: string; }

export type DeliveryMethod = "AUTO" | "MANUAL";

export interface Category {
  id: string;
  slug: string;
  name: L10n;
  icon: "software" | "entertainment" | "gaming" | "security" | "ai";
}

export interface Product {
  id: string;
  slug: string;
  name: L10n;
  short: L10n;
  description: L10n;
  requirements: L10n;
  category: string; // category id
  tags: string[];
  /** base price in USD minor units — single source of truth for money */
  priceUsd: number;
  compareAtUsd: number | null;
  deliveryMethod: DeliveryMethod;
  /** months of validity for subscriptions; null = lifetime */
  durationMonths: number | null;
  /** numeric stock for MANUAL products; AUTO stock = unused key count */
  stock: number;
  lowStockThreshold: number;
  active: boolean;
  featured: boolean;
  isNew: boolean;
  image: string;
  accent: string; // css color used for cover glow / badges
  seoTitle: string;
  seoDescription: string;
  createdAt: number;
}

export type KeyStatus = "UNUSED" | "RESERVED" | "DELIVERED" | "USED" | "REVOKED";

export interface LicenseKey {
  id: string;
  productId: string;
  key: string;
  status: KeyStatus;
  orderId: string | null;
  reservedAt: number | null;
  deliveredAt: number | null;
  customerId: string | null;
}

export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED";
export type FulfillmentStatus = "PENDING" | "PROCESSING" | "DELIVERED" | "COMPLETED" | "CANCELLED";

export interface OrderItem {
  productId: string;
  name: string; // snapshot (EN fallback chain)
  image: string;
  qty: number;
  /** unit price in USD minor units (snapshot at purchase) */
  unitUsd: number;
  lineTotalUsd: number;
  deliveryMethod: DeliveryMethod;
}

export interface DeliveryPayload {
  keys: string[];
  activationCode: string | null;
  account: string | null;
  downloadLink: string | null;
  notes: string | null;
}

export interface Order {
  id: string;
  number: string; // SK-2024-0001
  customerId: string;
  customerName: string;
  email: string;
  items: OrderItem[];
  couponCode: string | null;
  discountUsd: number;
  taxUsd: number;
  totalUsd: number; // authoritative USD minor units
  /** display snapshot in the customer's currency */
  currency: Currency;
  fxRate: number;
  totalMinor: number; // total in `currency` minor units
  paymentMethod: "STRIPE" | "PAYPAL";
  paymentId: string | null;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  delivery: DeliveryPayload | null;
  deliveredBy: string | null; // admin id for manual delivery
  history: { at: number; state: string; by: string }[];
  createdAt: number;
  paidAt: number | null;
  deliveredAt: number | null;
}

export interface Payment {
  id: string;
  orderId: string;
  provider: "STRIPE" | "PAYPAL";
  providerRef: string | null;
  amountUsd: number;
  currency: Currency;
  amountMinor: number;
  status: PaymentStatus;
  createdAt: number;
  capturedAt: number | null;
}

/** Webhook events — event_id is UNIQUE in production (idempotency). */
export interface PaymentEvent {
  eventId: string;
  provider: "STRIPE" | "PAYPAL";
  type: "payment.captured" | "payment.failed";
  orderId: string;
  signatureValid: boolean;
  processed: boolean;
  receivedAt: number;
}

export interface Refund {
  id: string;
  orderId: string;
  paymentId: string;
  amountUsd: number;
  reason: string;
  issuedBy: string;
  createdAt: number;
}

export type CouponType = "PERCENT" | "FIXED";
export interface Coupon {
  code: string;
  type: CouponType;
  value: number; // percent (1-90) or USD minor units
  minOrderUsd: number;
  startsAt: number;
  expiresAt: number;
  maxUses: number;
  maxPerCustomer: number;
  uses: number;
  active: boolean;
  productIds: string[]; // empty = all
}

export interface Review {
  id: string;
  productId: string;
  customerId: string;
  customerName: string;
  rating: number; // 1..5
  text: string;
  verified: boolean; // purchased the product
  approved: boolean;
  reported: boolean;
  createdAt: number;
}

export interface Notification {
  id: string;
  userId: string;
  type: string; // i18n key
  vars?: Record<string, string>;
  link: string | null;
  read: boolean;
  createdAt: number;
}

export type TicketStatus = "OPEN" | "PENDING" | "CLOSED";
export interface Ticket {
  id: string;
  customerId: string;
  orderId: string | null;
  subject: string;
  status: TicketStatus;
  assignee: string | null;
  createdAt: number;
  updatedAt: number;
}
export interface TicketMessage {
  id: string;
  ticketId: string;
  authorId: string;
  authorName: string;
  staff: boolean;
  text: string;
  createdAt: number;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  target: string;
  meta: string;
  at: number;
}

export interface EmailLog {
  id: string;
  to: string;
  toName: string;
  type: string;
  subject: string;
  lang: Lang;
  status: "SENT" | "FAILED" | "QUEUED";
  provider: string;
  createdAt: number;
}

export interface Settings {
  storeName: string;
  supportEmail: string;
  contactEmail: string;
  description: string;
  langs: Lang[];
  currencies: Currency[];
  defaultLang: Lang;
  defaultCurrency: Currency;
  /** FX rates from USD (configurable provider in production) */
  fx: Record<Currency, number>;
  stripeEnabled: boolean;
  paypalEnabled: boolean;
  taxRatePct: number;
  maintenanceMode: boolean;
  emailProvider: "RESEND" | "SES" | "SMTP";
  emailFrom: string;
  requireReviewApproval: boolean;
}

export interface CartItem { productId: string; qty: number; }
/** Cart is scoped to a user — or to an anonymous session id pre-login (A15). */
export interface Cart { id: string; ownerId: string | null; items: CartItem[]; }

export interface DB {
  users: User[];
  sessionUserId: string | null;
  sessionToken: string | null;
  sessionExpires: number | null;
  categories: Category[];
  products: Product[];
  licenseKeys: LicenseKey[];
  orders: Order[];
  payments: Payment[];
  paymentEvents: PaymentEvent[];
  refunds: Refund[];
  coupons: Coupon[];
  reviews: Review[];
  wishlist: { userId: string; productId: string }[];
  notifications: Notification[];
  tickets: Ticket[];
  ticketMessages: TicketMessage[];
  auditLogs: AuditLog[];
  emailLogs: EmailLog[];
  settings: Settings;
  carts: Cart[];
  orderSeq: number;
}

export class ApiError extends Error {
  code: string;
  vars?: Record<string, string>;
  constructor(code: string, vars?: Record<string, string>) {
    super(code);
    this.code = code;
    this.vars = vars;
  }
}
