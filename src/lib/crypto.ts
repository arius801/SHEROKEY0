/** Secure token + hashing helpers.
 *  Production: passwords are hashed with argon2id (server-side, OWASP params).
 *  This sandbox mirrors the contract with salted SHA-256 digests. */

export function uid(prefix = "id"): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 8; i++) bytes[i] = Math.floor(Math.random() * 256);
  return `${prefix}_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function randomToken(bytes = 24): string {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(arr);
  else for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const makeSalt = () => randomToken(12);

export async function hashPassword(password: string, salt: string): Promise<string> {
  try {
    const data = new TextEncoder().encode(`${salt}::${password}`);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    // insecure-context fallback (never used for real security)
    let h = 0x811c9dc5;
    const s = `${salt}::${password}`;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return `fb_${(h >>> 0).toString(16)}`;
  }
}

export async function verifyPassword(password: string, salt: string, hash: string): Promise<boolean> {
  return (await hashPassword(password, salt)) === hash;
}

/** SHA-256 hex digest (used to store OTP codes as hashes, and for event payload hashes). */
export async function sha256Hex(input: string): Promise<string> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < input.length; i++) {
      const ch = input.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    return `fb_${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`;
  }
}

/** HMAC-SHA256 (hex) — real webhook signature verification in the sandbox gateway.
 *  Production: provider SDKs verify with the platform secret (stripe-sig / PayPal cert / acquirer key). */
export async function hmacHex(secret: string, payload: string): Promise<string> {
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return sha256Hex(`${secret}::${payload}`);
  }
}

/** Constant-time string comparison for signature/code checks. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Cryptographically random 6-digit one-time code. */
export function otpCode(): string {
  const arr = new Uint32Array(1);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(arr);
  else arr[0] = Math.floor(Math.random() * 0xffffffff);
  return String(100000 + (arr[0] % 900000));
}

/** Deterministic PRNG for seed data (mulberry32). */
export function seededRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
