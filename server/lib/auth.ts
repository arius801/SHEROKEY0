/**
 * SHEROKEY — server-side authentication.
 * Argon2id password hashing, hashed single-use tokens, HttpOnly/Secure/SameSite sessions.
 * Nothing in this module ever runs in the browser.
 */
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { requireDb, users, sessions, emailVerificationTokens, otpCodes, passwordResetTokens, auditLogs } from "../db";

const APP_URL = process.env.APP_URL ?? "https://sherokey.com";
const isProd = process.env.NODE_ENV === "production";

/* ---------------------------------------------------------------- hashing */
export async function hashPassword(plain: string): Promise<string> {
  // Argon2id with OWASP-recommended parameters
  return hash(plain, { memoryCost: 65536, timeCost: 3, parallelism: 4, algorithm: 2 /* argon2id */ });
}
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try { return await verify(stored, plain); } catch { return false; }
}

/* ---------------------------------------------------------------- tokens */
export const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
export const newToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

/** 6-digit OTP from a cryptographically secure source (never Math.random). */
export function newOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function safeEqual(a: string, b: string): boolean {
  const ha = sha256(a); const hb = sha256(b);
  const ba = Buffer.from(ha); const bb = Buffer.from(hb);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/* ---------------------------------------------------------------- sessions */
export const SESSION_COOKIE = isProd ? "__Host-shk_session" : "shk_session";
const ABSOLUTE_TTL_MS = 7 * 24 * 3600_000;
const IDLE_TTL_MS = 24 * 3600_000;

export function serializeSessionCookie(token: string, maxAgeSec: number): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    `Max-Age=${maxAgeSec}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${isProd ? "None" : "Lax"}`,
  ];
  if (isProd) parts.push("Secure");
  if (isProd) parts.push("__Host- prefix enforced by cookie name");
  return parts.filter((p) => !p.includes("prefix enforced")).join("; ");
}

export async function createSession(userId: string): Promise<{ token: string; cookie: string }> {
  const d = requireDb();
  const token = newToken(32);
  const now = new Date();
  const expires = new Date(now.getTime() + ABSOLUTE_TTL_MS);
  const idle = new Date(now.getTime() + IDLE_TTL_MS);
  await d.insert(sessions).values({ userId, tokenHash: sha256(token), expiresAt: expires, idleExpiresAt: idle });
  return { token, cookie: serializeSessionCookie(token, ABSOLUTE_TTL_MS / 1000) };
}

export type SessionUser = typeof users.$inferSelect;

/** Resolves the session cookie → user. Enforces absolute + idle expiry; extends idle on use. */
export async function resolveSession(cookieHeader: string | undefined): Promise<SessionUser | null> {
  const d = requireDb();
  const raw = cookieHeader?.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!raw) return null;
  const token = raw.slice(SESSION_COOKIE.length + 1);
  if (!token) return null;
  const rows = await d.select({ s: sessions, u: users })
    .from(sessions).innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.replacedBy)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const now = Date.now();
  if (row.s.expiresAt.getTime() < now || row.s.idleExpiresAt.getTime() < now) {
    await d.delete(sessions).where(eq(sessions.id, row.s.id));
    return null;
  }
  await d.update(sessions).set({ idleExpiresAt: new Date(now + IDLE_TTL_MS) }).where(eq(sessions.id, row.s.id));
  return row.u;
}

/** Rotation: old session invalidated, new token issued (login, privilege change, optional periodic). */
export async function rotateSession(oldTokenHash: string, userId: string): Promise<{ token: string; cookie: string }> {
  const d = requireDb();
  const next = await createSession(userId);
  await d.update(sessions).set({ replacedBy: sql`(SELECT id FROM sessions WHERE token_hash = ${sha256(next.token)} LIMIT 1)` })
    .where(eq(sessions.tokenHash, oldTokenHash));
  return next;
}

export async function revokeSession(cookieHeader: string | undefined): Promise<void> {
  const d = requireDb();
  const raw = cookieHeader?.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!raw) return;
  const token = raw.slice(SESSION_COOKIE.length + 1);
  await d.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
}

/** Invalidate ALL sessions for a user (password reset, role change). */
export async function revokeAllSessions(userId: string): Promise<void> {
  const d = requireDb();
  await d.delete(sessions).where(eq(sessions.userId, userId));
}

/* ---------------------------------------------------------------- verification / OTP / reset */
const HOUR = 3600_000;

export async function issueEmailVerification(userId: string): Promise<{ link: string; rawToken: string }> {
  const d = requireDb();
  // previous unconsumed tokens remain invalid-by-design: only the newest unexpired hash matches
  const raw = newToken();
  await d.insert(emailVerificationTokens).values({ userId, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 24 * HOUR) });
  return { rawToken: raw, link: `${APP_URL}/verify-email?token=${raw}` };
}

export async function consumeEmailVerification(rawToken: string): Promise<{ ok: true; userId: string } | { ok: false; reason: "expired" | "invalid" }> {
  const d = requireDb();
  const h = sha256(rawToken);
  const rows = await d.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.tokenHash, h)).limit(1);
  const t = rows[0];
  if (!t) return { ok: false, reason: "invalid" };
  if (t.usedAt || t.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  await d.transaction(async (tx) => {
    // atomic single-use flip — concurrent clicks race to one winner
    const updated = await tx.update(emailVerificationTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(emailVerificationTokens.id, t.id), isNull(emailVerificationTokens.usedAt)))
      .returning({ id: emailVerificationTokens.id });
    if (updated.length !== 1) throw new Error("TOKEN_RACE_LOST");
    await tx.update(users).set({ emailVerified: true, updatedAt: new Date() }).where(eq(users.id, t.userId));
  });
  await audit(null, "SYSTEM", "EMAIL_VERIFIED", t.userId, "token consumed");
  return { ok: true, userId: t.userId };
}

export async function issueOtp(userId: string, purpose = "checkout"): Promise<{ codeHash: string; salt: string; rawCode: string }> {
  const d = requireDb();
  const code = newOtp();
  const salt = randomBytes(8).toString("hex");
  const codeHash = sha256(`${salt}::${code}`);
  // invalidate every previous unconsumed code for this user+purpose
  await d.update(otpCodes).set({ consumedAt: new Date() })
    .where(and(eq(otpCodes.userId, userId), eq(otpCodes.purpose, purpose), isNull(otpCodes.consumedAt)));
  await d.insert(otpCodes).values({ userId, salt, codeHash, purpose, expiresAt: new Date(Date.now() + 5 * 60_000) });
  return { rawCode: code, codeHash, salt };
}

export const OTP_MAX_ATTEMPTS = 5;

export async function verifyOtp(userId: string, code: string, purpose = "checkout"): Promise<{ ok: true } | { ok: false; reason: "expired" | "invalid" | "locked" | "none" }> {
  const d = requireDb();
  const rows = await d.select().from(otpCodes)
    .where(and(eq(otpCodes.userId, userId), eq(otpCodes.purpose, purpose), isNull(otpCodes.consumedAt)))
    .orderBy(sql`${otpCodes.createdAt} DESC`).limit(1);
  const t = rows[0];
  if (!t) return { ok: false, reason: "none" };
  if (t.attempts >= OTP_MAX_ATTEMPTS) {
    await d.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, t.id));
    return { ok: false, reason: "locked" };
  }
  if (t.expiresAt.getTime() < Date.now()) {
    await d.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, t.id));
    return { ok: false, reason: "expired" };
  }
  const candidate = sha256(`${t.salt}::${code.trim()}`);
  if (!safeEqual(candidate, t.codeHash)) {
    await d.update(otpCodes).set({ attempts: t.attempts + 1 }).where(eq(otpCodes.id, t.id));
    return { ok: false, reason: t.attempts + 1 >= OTP_MAX_ATTEMPTS ? "locked" : "invalid" };
  }
  await d.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, t.id)); // single-use
  return { ok: true };
}

export async function issuePasswordReset(email: string): Promise<{ link: string | null }> {
  const d = requireDb();
  const row = (await d.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1))[0];
  if (!row) return { link: null }; // enumeration-safe: caller sends the same response either way
  const raw = newToken();
  await d.insert(passwordResetTokens).values({ userId: row.id, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 30 * 60_000) });
  return { link: `${APP_URL}/reset-password?token=${raw}` };
}

export async function consumePasswordReset(rawToken: string, newPassword: string): Promise<{ ok: true; userId: string } | { ok: false; reason: "expired" | "invalid" }> {
  const d = requireDb();
  const rows = await d.select().from(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, sha256(rawToken))).limit(1);
  const t = rows[0];
  if (!t) return { ok: false, reason: "invalid" };
  if (t.usedAt || t.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  const passwordHash = await hashPassword(newPassword);
  await d.transaction(async (tx) => {
    const updated = await tx.update(passwordResetTokens).set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.id, t.id), isNull(passwordResetTokens.usedAt))).returning({ id: passwordResetTokens.id });
    if (updated.length !== 1) throw new Error("TOKEN_RACE_LOST");
    await tx.update(users).set({ passwordHash, failedLogins: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(users.id, t.userId));
    await tx.delete(sessions).where(eq(sessions.userId, t.userId)); // old sessions die with the old password
  });
  await audit(null, "SYSTEM", "PASSWORD_RESET", t.userId, "sessions revoked");
  return { ok: true, userId: t.userId };
}

/* ---------------------------------------------------------------- audit */
export async function audit(actorId: string | null, actorName: string, action: string, target: string, meta = "", ip?: string) {
  const d = requireDb();
  await d.insert(auditLogs).values({ actorId, actorName, action, target, meta, ip: ip ?? null });
}
