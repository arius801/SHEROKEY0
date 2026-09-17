# SHEROKEY — Digital Products E-Commerce Platform

## 🚀 Quick Start

### Development Mode (with seed data)

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:5173
```

The application will load with seed data including:
- 8 products (Windows 11, Office, Adobe, Spotify, Netflix, PSN, NordVPN, ChatGPT)
- 5 categories
- 100 license keys
- Demo accounts (see below)

### Production Mode (with backend)

```bash
# Build for production
npm run build

# Set environment variables
export VITE_API_URL=http://localhost:8080

# Start backend server
node --env-file=.env --import=tsx server/entry.ts

# Open http://localhost:8080
```

## 🔑 Demo Accounts (Development Only)

| Role | Email | Password |
|------|-------|----------|
| OWNER | owner@sherokey.com | Owner@2024 |
| ADMIN | admin@sherokey.com | Admin@2024 |
| SUPPORT | support@sherokey.com | Support@2024 |
| CUSTOMER | demo@sherokey.com | Demo@2024 |

**Note:** These accounts exist only in development mode. In production, create the first OWNER via CLI:

```bash
npx tsx server/scripts.ts owner your-email@domain.com 'YourPassword123!'
```

## 🏗️ Architecture

### Frontend (Vite + React)
- `src/pages/` — UI components
- `src/state/store.tsx` — State management
- `src/lib/` — Utilities, types, i18n

### Backend (Node.js + Express-like)
- `server/api.ts` — API endpoints
- `server/services.ts` — Business logic
- `server/payments.ts` — Payment providers (Stripe, PayPal, MIR)
- `server/db.ts` — Database schema (Drizzle ORM)

### Database (PostgreSQL)
- `migrations/0000_init.sql` — Initial schema
- `migrations/0001_broadcast_notifications.sql` — Notifications table

## 📦 Features

### Customer
- Browse products by category
- Add to cart
- Apply coupons
- Checkout with Stripe/PayPal/MIR
- View orders and license keys
- Support tickets
- Multi-language (EN/AR/RU/FR)
- Multi-currency (USD/EUR/SAR/RUB)

### Admin
- Product management (CRUD)
- Category management
- Coupon management
- Order management
- Manual license delivery
- Refunds and cancellations
- Customer management
- Role-based access control (RBAC)
- Audit logs

### Security
- Argon2id password hashing
- HttpOnly session cookies
- CSRF protection
- Rate limiting
- Webhook signature verification
- IDOR protection

## 🔧 Configuration

### Environment Variables

Create `.env` file:

```env
# Database
DATABASE_URL=postgres://user:pass@localhost:5432/sherokey

# Redis (for rate limiting)
REDIS_URL=redis://localhost:6379

# Authentication
AUTH_SECRET=your-secret-key-here

# Email (Resend)
RESEND_API_KEY=re_...
EMAIL_FROM="SHEROKEY <no-reply@sherokey.com>"

# Stripe
STRIPE_SECRET_KEY=sk_...
STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...

# PayPal
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_ENVIRONMENT=sandbox

# MIR (optional)
MIR_PROVIDER_API_KEY=...
MIR_PROVIDER_SECRET=...
MIR_PROVIDER_WEBHOOK_SECRET=...

# Application
APP_URL=http://localhost:8080
VITE_API_URL=http://localhost:8080
```

### Database Setup

```bash
# Create database
createdb sherokey

# Run migrations
psql sherokey -f migrations/0000_init.sql
psql sherokey -f migrations/0001_broadcast_notifications.sql
```

## 🧪 Testing

```bash
# Type check
npm run typecheck

# Run tests
npm test

# Build
npm run build
```

## 📝 API Endpoints

### Authentication
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/verify-email`
- `POST /api/auth/forgot`
- `POST /api/auth/reset`

### Products
- `GET /api/products`
- `POST /api/admin/products` (OWNER/ADMIN)
- `PUT /api/admin/products/:id` (OWNER/ADMIN)
- `DELETE /api/admin/products/:id` (OWNER/ADMIN)

### Categories
- `GET /api/admin/categories` (OWNER/ADMIN)
- `POST /api/admin/categories` (OWNER/ADMIN)
- `PUT /api/admin/categories/:id` (OWNER/ADMIN)
- `DELETE /api/admin/categories/:id` (OWNER/ADMIN)

### Orders
- `GET /api/account/orders`
- `POST /api/checkout`
- `POST /api/admin/orders/:id/deliver` (OWNER/ADMIN/SUPPORT)
- `POST /api/admin/orders/:id/refund` (OWNER/ADMIN)
- `POST /api/admin/orders/:id/cancel` (OWNER/ADMIN)

### Webhooks
- `POST /api/webhooks/stripe`
- `POST /api/webhooks/paypal`
- `POST /api/webhooks/mir`

## 🔒 Security Notes

1. **Never commit `.env` file** — it contains secrets
2. **Use HTTPS in production** — required for secure cookies
3. **Verify webhook signatures** — never trust unverified webhooks
4. **Server-side price calculation** — never trust client prices
5. **License keys are server-side only** — never expose to unauthorized users

## 🌐 Deployment

### Vercel
```bash
vercel deploy
```

### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 8080
CMD ["node", "--env-file=.env", "--import=tsx", "server/entry.ts"]
```

### Manual
```bash
npm run build
node --env-file=.env --import=tsx server/entry.ts
```

## 📄 License

Proprietary — All rights reserved.

## 🆘 Support

- Email: support@sherokey.com
- Telegram: @arius801
