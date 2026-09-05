-- SHEROKEY — initial PostgreSQL schema (authoritative). Apply with:
--   psql "$DATABASE_URL" -f migrations/0000_init.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE role AS ENUM ('CUSTOMER','SUPPORT','ADMIN','OWNER');
CREATE TYPE lang AS ENUM ('en','ar','ru','fr');
CREATE TYPE currency AS ENUM ('USD','EUR','SAR','RUB');
CREATE TYPE delivery_method AS ENUM ('AUTO','MANUAL');
CREATE TYPE key_status AS ENUM ('UNUSED','RESERVED','DELIVERED','USED','REVOKED');
CREATE TYPE payment_status AS ENUM ('PENDING','REQUIRES_ACTION','AUTHORIZED','PAID','FAILED','CANCELLED','REFUNDED','PARTIALLY_REFUNDED');
CREATE TYPE fulfillment_status AS ENUM ('PENDING','PROCESSING','DELIVERED','COMPLETED','CANCELLED');
CREATE TYPE provider AS ENUM ('STRIPE','PAYPAL','MIR_ACQUIRER');
CREATE TYPE pay_method AS ENUM ('CARD_INTL','CARD_MIR','PAYPAL');
CREATE TYPE coupon_type AS ENUM ('PERCENT','FIXED');
CREATE TYPE ticket_status AS ENUM ('OPEN','PENDING','CLOSED');
CREATE TYPE email_status AS ENUM ('QUEUED','SENT','FAILED');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(320) NOT NULL,
  password_hash text NOT NULL,
  name varchar(120) NOT NULL,
  role role NOT NULL DEFAULT 'CUSTOMER',
  lang lang NOT NULL DEFAULT 'en',
  currency currency NOT NULL DEFAULT 'USD',
  email_verified boolean NOT NULL DEFAULT false,
  failed_logins integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_uq ON users (email);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  idle_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  replaced_by uuid
);
CREATE UNIQUE INDEX sessions_token_uq ON sessions (token_hash);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX evt_hash_uq ON email_verification_tokens (token_hash);
CREATE INDEX evt_user_idx ON email_verification_tokens (user_id);

CREATE TABLE otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  salt varchar(32) NOT NULL,
  code_hash text NOT NULL,
  purpose varchar(24) NOT NULL DEFAULT 'checkout',
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_user_idx ON otp_codes (user_id);

CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX prt_hash_uq ON password_reset_tokens (token_hash);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(80) NOT NULL,
  icon varchar(40) NOT NULL DEFAULT 'software',
  name jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cat_slug_uq ON categories (slug);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(120) NOT NULL,
  category_id uuid REFERENCES categories(id),
  name jsonb NOT NULL, short jsonb NOT NULL, description jsonb NOT NULL, requirements jsonb NOT NULL,
  tags jsonb NOT NULL DEFAULT '[]',
  price_minor bigint NOT NULL,
  compare_at_minor bigint,
  delivery_method delivery_method NOT NULL,
  duration_months integer,
  stock integer NOT NULL DEFAULT 0,
  low_stock_threshold integer NOT NULL DEFAULT 5,
  active boolean NOT NULL DEFAULT true,
  featured boolean NOT NULL DEFAULT false,
  is_new boolean NOT NULL DEFAULT false,
  image text NOT NULL,
  accent varchar(9) NOT NULL DEFAULT '#2fc98a',
  seo_title text NOT NULL, seo_description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_price_positive CHECK (price_minor >= 0)
);
CREATE UNIQUE INDEX prod_slug_uq ON products (slug);
CREATE INDEX prod_cat_idx ON products (category_id);

CREATE TABLE carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid,
  anonymous_id varchar(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX carts_owner_idx ON carts (owner_id);
CREATE INDEX carts_anon_idx ON carts (anonymous_id);

CREATE TABLE cart_items (
  id serial PRIMARY KEY,
  cart_id uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty integer NOT NULL DEFAULT 1 CHECK (qty BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cart_item_uq ON cart_items (cart_id, product_id);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number varchar(24) NOT NULL,
  customer_id uuid NOT NULL REFERENCES users(id),
  customer_name varchar(120) NOT NULL,
  email varchar(320) NOT NULL,
  currency currency NOT NULL,
  fx_rate jsonb NOT NULL,
  subtotal_minor bigint NOT NULL,
  discount_minor bigint NOT NULL DEFAULT 0,
  tax_minor bigint NOT NULL DEFAULT 0,
  total_minor bigint NOT NULL,
  total_usd_minor bigint NOT NULL,
  coupon_code varchar(40),
  pay_method pay_method NOT NULL,
  provider provider NOT NULL,
  payment_status payment_status NOT NULL DEFAULT 'PENDING',
  fulfillment_status fulfillment_status NOT NULL DEFAULT 'PENDING',
  delivery jsonb,
  delivered_by uuid,
  paid_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_total_positive CHECK (total_minor >= 0)
);
CREATE UNIQUE INDEX orders_number_uq ON orders (number);
CREATE INDEX orders_customer_idx ON orders (customer_id);
CREATE INDEX orders_status_idx ON orders (payment_status, fulfillment_status);

CREATE TABLE order_items (
  id serial PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  name_snapshot text NOT NULL,
  image_snapshot text NOT NULL,
  qty integer NOT NULL CHECK (qty >= 1),
  unit_usd_minor bigint NOT NULL,
  line_usd_minor bigint NOT NULL,
  delivery_method delivery_method NOT NULL
);
CREATE INDEX order_items_order_idx ON order_items (order_id);

CREATE TABLE order_status_history (
  id serial PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  state varchar(32) NOT NULL,
  actor varchar(120) NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX osh_order_idx ON order_status_history (order_id);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider provider NOT NULL,
  pay_method pay_method NOT NULL,
  provider_payment_id varchar(120),
  provider_customer_id varchar(120),
  amount_minor bigint NOT NULL,
  currency currency NOT NULL,
  status payment_status NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  captured_at timestamptz
);
CREATE INDEX payments_order_idx ON payments (order_id);
CREATE INDEX payments_provider_ref_idx ON payments (provider, provider_payment_id);

-- Idempotency wall: the same provider event can never be processed twice.
CREATE TABLE payment_events (
  id serial PRIMARY KEY,
  provider provider NOT NULL,
  event_id varchar(160) NOT NULL,
  event_type varchar(60) NOT NULL,
  payload_hash varchar(64) NOT NULL,
  order_id uuid,
  processed boolean NOT NULL DEFAULT false,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payment_events_uq ON payment_events (provider, event_id);

CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id),
  order_id uuid NOT NULL REFERENCES orders(id),
  provider_refund_id varchar(120),
  amount_minor bigint NOT NULL,
  currency currency NOT NULL,
  reason text NOT NULL,
  issued_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refunds_order_idx ON refunds (order_id);

-- License inventory: lives ONLY in PostgreSQL; reservation hot path is indexed.
CREATE TABLE license_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  key text NOT NULL,
  status key_status NOT NULL DEFAULT 'UNUSED',
  order_id uuid,
  customer_id uuid,
  reserved_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX license_key_uq ON license_keys (key);
CREATE INDEX license_pool_idx ON license_keys (product_id, status);

CREATE TABLE coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(40) NOT NULL,
  type coupon_type NOT NULL,
  value integer NOT NULL CHECK (value > 0),
  min_order_usd_minor bigint NOT NULL DEFAULT 0,
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  max_uses integer NOT NULL,
  max_per_customer integer NOT NULL DEFAULT 1,
  uses integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  product_ids jsonb NOT NULL DEFAULT '[]'
);
CREATE UNIQUE INDEX coupons_code_uq ON coupons (code);

CREATE TABLE coupon_redemptions (
  id serial PRIMARY KEY,
  coupon_id uuid NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES users(id),
  redeemed_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX redemption_order_uq ON coupon_redemptions (order_id);
CREATE INDEX redemption_customer_idx ON coupon_redemptions (coupon_id, customer_id);

CREATE TABLE reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text text NOT NULL,
  verified_purchase boolean NOT NULL DEFAULT false,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX reviews_one_per_user ON reviews (product_id, customer_id);

CREATE TABLE wishlist_items (
  id serial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX wishlist_uq ON wishlist_items (user_id, product_id);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type varchar(40) NOT NULL,
  vars jsonb,
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notif_user_idx ON notifications (user_id, read);

CREATE TABLE support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES users(id),
  order_id uuid,
  subject varchar(160) NOT NULL,
  status ticket_status NOT NULL DEFAULT 'OPEN',
  assignee_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tickets_customer_idx ON support_tickets (customer_id);

CREATE TABLE support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id),
  staff boolean NOT NULL DEFAULT false,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stm_ticket_idx ON support_ticket_messages (ticket_id);

CREATE TABLE email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "to" varchar(320) NOT NULL,
  to_name varchar(120) NOT NULL,
  template varchar(40) NOT NULL,
  subject text NOT NULL,
  lang lang NOT NULL,
  provider varchar(20) NOT NULL,
  provider_message_id varchar(160),
  status email_status NOT NULL DEFAULT 'QUEUED',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_logs_status_idx ON email_logs (status);

CREATE TABLE audit_logs (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  actor_id uuid,
  actor_name varchar(120) NOT NULL,
  action varchar(40) NOT NULL,
  target varchar(160) NOT NULL,
  meta text NOT NULL DEFAULT '',
  ip varchar(45),
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_action_idx ON audit_logs (action);
CREATE INDEX audit_actor_idx ON audit_logs (actor_id);

CREATE TABLE settings (
  key varchar(60) PRIMARY KEY,
  value jsonb NOT NULL,
  encrypted boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
