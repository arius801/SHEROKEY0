/**
 * SHEROKEY — production API client.
 *
 * When VITE_API_URL is set (e.g. https://api.sherokey.com or same-origin), the
 * storefront talks to the REAL server (server/api.ts): server-side sessions via
 * HttpOnly cookies, server-recalculated prices, provider-hosted payment pages and
 * webhook-confirmed fulfillment. The browser never decides payment state.
 *
 * When VITE_API_URL is absent, the app runs on the labeled in-browser sandbox
 * adapter (src/state/store.tsx) for local preview only.
 */
export const API_BASE: string | null = (import.meta.env.VITE_API_URL as string | undefined) ?? null;
export const isServerMode = API_BASE !== null;

function csrfToken(): string | null {
  const m = document.cookie.match(/(?:^|; )shk_csrf=([^;]+)/);
  return m ? m[1] : null;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!API_BASE) throw new Error("SANDBOX_MODE — set VITE_API_URL to enable the production API");
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include", // HttpOnly session cookie
    headers: {
      "Content-Type": "application/json",
      ...(method !== "GET" ? { "X-CSRF-Token": csrfToken() ?? "" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; redirect?: string };
  if (!res.ok) {
    const err = new Error(data.error ?? "e.generic") as Error & { status: number; redirect?: string };
    err.status = res.status;
    err.redirect = (data as { redirect?: string }).redirect;
    throw err;
  }
  return data;
}

/** Mirrors the service contract 1:1 — swapping `api` in src/state/store.tsx for this
 *  object is the single seam between the sandbox preview and the production server. */
export const serverApi = {
  me: () => call<unknown>("GET", "/api/me"),
  register: (v: { name: string; email: string; password: string; confirm: string; lang: string; currency: string }) =>
    call<{ userId: string }>("POST", "/api/auth/register", v),
  login: (email: string, password: string) => call<{ user: unknown }>("POST", "/api/auth/login", { email, password }),
  logout: () => call<{ ok: true }>("POST", "/api/auth/logout"),
  resendVerification: () => call<{ ok: true }>("POST", "/api/auth/resend-verification"),
  requestOtp: () => call<{ ok: true }>("POST", "/api/auth/otp/request"),
  verifyOtp: (code: string) => call<{ ok: true } | { ok: false; reason: string }>("POST", "/api/auth/otp/verify", { code }),
  forgot: (email: string) => call<{ ok: true }>("POST", "/api/auth/forgot", { email }),
  reset: (token: string, password: string) => call<{ ok: boolean }>("POST", "/api/auth/reset", { token, password }),
  products: () => call<unknown[]>("GET", "/api/products"),
  addToCart: (productId: string, qty: number) => call<{ ok: true }>("POST", "/api/cart/items", { productId, qty }),
  cartPreview: (coupon: string | null) => call<unknown>("GET", `/api/cart/preview${coupon ? `?coupon=${encodeURIComponent(coupon)}` : ""}`),
  checkout: (couponCode: string | null, method: "CARD_INTL" | "CARD_MIR" | "PAYPAL") =>
    call<{ orderId: string; redirect?: string; paypalOrderId?: string }>("POST", "/api/checkout", { couponCode, method }),
  capturePayPal: (paypalOrderId: string) => call<{ orderId: string | null }>("POST", "/api/paypal/capture", { paypalOrderId }),
  myOrders: () => call<unknown[]>("GET", "/api/account/orders"),
  myLicenses: () => call<unknown[]>("GET", "/api/account/licenses"),
  adminDeliver: (orderId: string, payload: unknown) => call<unknown>("POST", `/api/admin/orders/${orderId}/deliver`, payload),
  adminRefund: (orderId: string, reason: string) => call<unknown>("POST", `/api/admin/orders/${orderId}/refund`, { reason }),
  adminProviderStatus: () => call<Record<string, string>>("GET", "/api/admin/providers"),
};
