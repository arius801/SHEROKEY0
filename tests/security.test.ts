/**
 * SHEROKEY — server-side security tests (Vitest, run: npx vitest run).
 * Exercises the real executable security primitives: Argon2id password hashing,
 * secure token/OTP generation, session-cookie hardening and honest provider-status
 * reporting (a provider is NEVER reported OPERATIONAL without real credentials).
 */
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, sha256, newToken, newOtp, serializeSessionCookie, SESSION_COOKIE, OTP_MAX_ATTEMPTS } from "../server/lib/auth";
import { stripeHealth, paypalHealth, mirHealth } from "../server/payments";

/* ---------------------------------------------------------------- Argon2id password hashing (§8) */
describe("password hashing (Argon2id)", () => {
  it("round-trips a correct password", async () => {
    const hash = await hashPassword("Correct-Horse-9!");
    expect(await verifyPassword("Correct-Horse-9!", hash)).toBe(true);
  });
  it("rejects a wrong password", async () => {
    const hash = await hashPassword("Correct-Horse-9!");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });
  it("produces an argon2id PHC string, never plaintext", async () => {
    const hash = await hashPassword("S3cret-Passw0rd!");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).not.toContain("S3cret-Passw0rd!");
  });
  it("salts uniquely — same password yields different hashes", async () => {
    const a = await hashPassword("Same-Password-1!");
    const b = await hashPassword("Same-Password-1!");
    expect(a).not.toBe(b);
  });
});

/* ---------------------------------------------------------------- secure tokens & OTP (§7/§8) */
describe("secure token & OTP generation", () => {
  it("generates high-entropy unique tokens", () => {
    const seen = new Set(Array.from({ length: 200 }, () => newToken()));
    expect(seen.size).toBe(200);
    expect(newToken().length).toBeGreaterThanOrEqual(40);
  });
  it("OTP is exactly 6 digits", () => {
    for (let i = 0; i < 50; i++) expect(newOtp()).toMatch(/^\d{6}$/);
  });
  it("limits OTP attempts to a small maximum", () => {
    expect(OTP_MAX_ATTEMPTS).toBeLessThanOrEqual(5);
    expect(OTP_MAX_ATTEMPTS).toBeGreaterThanOrEqual(3);
  });
  it("sha256 is deterministic and hex", () => {
    expect(sha256("abc")).toBe(sha256("abc"));
    expect(sha256("abc")).toMatch(/^[0-9a-f]{64}$/);
  });
});

/* ---------------------------------------------------------------- session cookie hardening (§7/§8) */
describe("session cookie attributes", () => {
  it("is HttpOnly, SameSite=Lax, Path=/", () => {
    const c = serializeSessionCookie("tok", 3600);
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Lax");
    expect(c).toContain("Path=/");
  });
  it("uses a __Host- prefix (implies Secure + Path=/) in production", () => {
    if (process.env.NODE_ENV === "production") expect(SESSION_COOKIE.startsWith("__Host-")).toBe(true);
    else expect(SESSION_COOKIE.length).toBeGreaterThan(0);
  });
});

/* ---------------------------------------------------------------- honest provider status (§14/§20) */
describe("provider status honesty", () => {
  it("Stripe is NOT CONFIGURED without secret key + webhook secret", () => {
    delete process.env.STRIPE_SECRET_KEY; delete process.env.STRIPE_WEBHOOK_SECRET;
    expect(stripeHealth()).toBe("NOT_CONFIGURED");
  });
  it("PayPal is NOT CONFIGURED without client id + secret", () => {
    delete process.env.PAYPAL_CLIENT_ID; delete process.env.PAYPAL_CLIENT_SECRET;
    expect(paypalHealth()).toBe("NOT_CONFIGURED");
  });
  it("MIR is NOT CONFIGURED without a real acquirer's credentials — never faked OPERATIONAL", () => {
    delete process.env.MIR_PROVIDER_API_KEY; delete process.env.MIR_PROVIDER_SECRET; delete process.env.MIR_PROVIDER_WEBHOOK_SECRET;
    expect(mirHealth()).toBe("NOT_CONFIGURED");
  });
});

/* ---------------------------------------------------------------- PayPal IDOR protection (§3) */
describe("PayPal IDOR protection — ownership check BEFORE capture", () => {
  it("capturePayPalOrder verifies ownership BEFORE calling PayPal /capture endpoint", async () => {
    // This test verifies the code structure, not runtime behavior
    // The actual fix ensures: GET order details → extract reference_id → fetch from DB → 
    // verify ownership → verify status/amount/currency → ONLY THEN execute capture
    
    // Read the source code to verify the order of operations
    const fs = await import("fs");
    const path = await import("path");
    const paymentsPath = path.join(process.cwd(), "server/payments.ts");
    const sourceCode = fs.readFileSync(paymentsPath, "utf-8");
    
    // Find the capturePayPalOrder function
    const captureFnMatch = sourceCode.match(/export async function capturePayPalOrder[\s\S]*?^}/m);
    expect(captureFnMatch).toBeTruthy();
    
    const captureFn = captureFnMatch![0];
    
    // Verify that ownership check appears BEFORE the capture POST request
    const ownershipCheckPos = captureFn.indexOf("o.customerId !== userId");
    const capturePostPos = captureFn.indexOf("/capture");
    
    // The ownership check must appear BEFORE any /capture endpoint call
    expect(ownershipCheckPos).toBeGreaterThan(-1);
    expect(capturePostPos).toBeGreaterThan(-1);
    expect(ownershipCheckPos).toBeLessThan(capturePostPos);
    
    // Verify that GET order details appears BEFORE capture
    const getOrderPos = captureFn.indexOf("method: \"GET\"");
    expect(getOrderPos).toBeGreaterThan(-1);
    expect(getOrderPos).toBeLessThan(capturePostPos);
    
    // Verify that reference_id extraction appears BEFORE capture
    const referenceIdPos = captureFn.indexOf("reference_id");
    expect(referenceIdPos).toBeGreaterThan(-1);
    expect(referenceIdPos).toBeLessThan(capturePostPos);
  });
});
