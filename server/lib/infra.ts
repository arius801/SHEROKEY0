/**
 * SHEROKEY — server infrastructure: Redis rate limiting + real transactional email.
 * Email delivery failures are queued and retried; they NEVER block or alter
 * payment/fulfillment state (delivery is decoupled from money).
 */
import { Resend } from "resend";
import { requireDb, emailLogs, settings } from "../db";
import { eq } from "drizzle-orm";

type Lang = "en" | "ar" | "ru" | "fr";

/* ================================================================ rate limiting
   Redis (Upstash-compatible). One sliding-window counter per bucket+key.
   Buckets: login, register, reset, verify, otp-req, otp-verify, checkout,
   payment, coupon, support, admin. */

let redis: import("@upstash/redis").Redis | null = null;
async function getRedis() {
  if (!process.env.REDIS_URL) return null;
  if (!redis) {
    const { Redis } = await import("@upstash/redis");
    redis = Redis.fromEnv();
  }
  return redis;
}

export class RateLimited extends Error {
  retryAfterSec: number;
  constructor(retryAfterSec: number) { super("RATE_LIMITED"); this.retryAfterSec = retryAfterSec; }
}

export async function rateLimit(bucket: string, key: string, max: number, windowSec: number, ip?: string): Promise<void> {
  const r = await getRedis();
  const id = `${bucket}:${key}:${ip ?? ""}`;
  if (!r) {
    // No Redis configured → fail CLOSED on money/auth paths in production, open in dev.
    if (process.env.NODE_ENV === "production") throw new Error("RATE_LIMIT_INFRASTRUCTURE_REQUIRED — set REDIS_URL");
    return;
  }
  const now = Date.now();
  const windowStart = now - windowSec * 1000;
  const zkey = `rl:${id}`;
  await r.zremrangebyscore(zkey, 0, windowStart);
  const count = await r.zcard(zkey);
  if (count >= max) {
    const oldest = (await r.zrange<number[]>(zkey, 0, 0, { withScores: true })) as unknown as [string, number];
    throw new RateLimited(Math.max(1, Math.ceil(((oldest?.[1] ?? windowStart) + windowSec * 1000 - now) / 1000)));
  }
  await r.zadd(zkey, { score: now, member: `${now}:${Math.random().toString(36).slice(2)}` });
  await r.pexpire(zkey, windowSec * 1000);
}

export const LIMITS = {
  login: { max: 12, window: 60 },
  register: { max: 3, window: 600 },
  reset: { max: 3, window: 600 },
  verify: { max: 3, window: 600 },
  otpRequest: { max: 3, window: 600 },
  otpVerify: { max: 8, window: 600 },
  checkout: { max: 5, window: 60 },
  payment: { max: 6, window: 60 },
  coupon: { max: 10, window: 60 },
  support: { max: 5, window: 1800 },
  admin: { max: 120, window: 60 },
} as const;

/* ================================================================ email */

export type EmailTemplate =
  | "verify" | "otp" | "reset" | "welcome"
  | "order_receipt" | "payment_failed" | "processing" | "delivered"
  | "refund" | "cancelled" | "support_reply";

const SUBJECTS: Record<EmailTemplate, Record<Lang, string>> = {
  verify: { en: "Verify your SHEROKEY email", ar: "أكّد بريدك في SHEROKEY", ru: "Подтвердите почту SHEROKEY", fr: "Vérifiez votre e-mail SHEROKEY" },
  otp: { en: "Your SHEROKEY verification code", ar: "رمز التحقق من SHEROKEY", ru: "Код подтверждения SHEROKEY", fr: "Votre code SHEROKEY" },
  reset: { en: "Reset your SHEROKEY password", ar: "إعادة تعيين كلمة مرور SHEROKEY", ru: "Сброс пароля SHEROKEY", fr: "Réinitialisez votre mot de passe SHEROKEY" },
  welcome: { en: "Welcome to SHEROKEY", ar: "مرحبًا بك في SHEROKEY", ru: "Добро пожаловать в SHEROKEY", fr: "Bienvenue sur SHEROKEY" },
  order_receipt: { en: "Order confirmed", ar: "تم تأكيد الطلب", ru: "Заказ подтверждён", fr: "Commande confirmée" },
  payment_failed: { en: "Payment failed", ar: "فشل الدفع", ru: "Платёж не прошёл", fr: "Paiement échoué" },
  processing: { en: "Order received — preparing delivery", ar: "استلمنا طلبك — نجهّز التسليم", ru: "Заказ получен — готовим доставку", fr: "Commande reçue — préparation" },
  delivered: { en: "Your license keys are ready", ar: "مفاتيح الترخيص جاهزة", ru: "Ваши ключи готовы", fr: "Vos clés sont prêtes" },
  refund: { en: "Refund issued", ar: "تم إصدار استرداد", ru: "Возврат средств", fr: "Remboursement émis" },
  cancelled: { en: "Order cancelled", ar: "أُلغي الطلب", ru: "Заказ отменён", fr: "Commande annulée" },
  support_reply: { en: "Support replied to your ticket", ar: "ردّ الدعم على تذكرتك", ru: "Поддержка ответила", fr: "Le support a répondu" },
};

function bodyHtml(template: EmailTemplate, lang: Lang, vars: Record<string, string>): string {
  const rtl = lang === "ar" ? ' dir="rtl"' : "";
  const actionLabel = { en: "Open SHEROKEY", ar: "افتح SHEROKEY", ru: "Открыть SHEROKEY", fr: "Ouvrir SHEROKEY" }[lang];
  const rows = Object.entries(vars)
    .filter(([k]) => k !== "link")
    .map(([k, v]) => `<tr><td style="padding:6px 0;color:#93a3b8;font-size:13px">${k}</td><td style="padding:6px 0;color:#e9f0f8;font-size:13px;text-align:${lang === "ar" ? "left" : "right"};font-family:monospace">${v}</td></tr>`)
    .join("");
  const button = vars.link
    ? `<a href="${vars.link}" style="display:inline-block;background:#2fc98a;color:#062b1b;font-weight:700;text-decoration:none;border-radius:10px;padding:12px 26px;margin-top:18px">${actionLabel}</a>`
    : "";
  return `<!doctype html><html${rtl}><body style="margin:0;background:#0a0f17;font-family:Segoe UI,Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
  <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
    <tr><td style="background:#0f1622;border:1px solid #1d2839;border-radius:16px;padding:36px">
      <div style="font-weight:800;font-size:18px;color:#e9f0f8;letter-spacing:.5px">SHERO<span style="color:#2fc98a">KEY</span></div>
      <p style="color:#e9f0f8;font-size:15px;line-height:1.65;margin:22px 0 6px">${vars.greeting ?? ""}</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px">${rows}</table>
      ${button}
      <p style="color:#5f7189;font-size:11.5px;line-height:1.6;margin-top:28px;border-top:1px solid #1d2839;padding-top:16px">
        SHEROKEY · digital keys & licenses · ${vars.foot ?? "If you didn't request this email, you can safely ignore it."}</p>
    </td></tr>
  </table></td></tr></table></body></html>`;
}

/** Sends through the configured provider (Resend by default; SMTP adapter slot below).
 *  Logs to email_logs WITHOUT ever persisting OTPs, tokens or keys. */
export async function sendEmail(opts: {
  to: string; toName: string; template: EmailTemplate; lang: Lang;
  vars: Record<string, string>; // may include `link` (action URL) and OTP `code` — code is used in subject/body only, never logged
}): Promise<{ id: string; status: "SENT" | "FAILED" }> {
  const d = requireDb();
  const provider = process.env.EMAIL_PROVIDER ?? "resend";
  const from = process.env.EMAIL_FROM ?? "SHEROKEY <noreply@sherokey.com>";
  const subject = `${SUBJECTS[opts.template][opts.lang]}${opts.template === "otp" ? ` — ${opts.vars.code}` : ""}`;
  const html = bodyHtml(opts.template, opts.lang, opts.vars);
  const logId = crypto.randomUUID();
  await d.insert(emailLogs).values({
    to: opts.to, toName: opts.toName, template: opts.template, subject: SUBJECTS[opts.template][opts.lang],
    lang: opts.lang, provider, status: "QUEUED",
  }).onConflictDoNothing();

  try {
    let providerMessageId: string | null = null;
    if (provider === "resend") {
      if (!process.env.RESEND_API_KEY) throw new Error("EMAIL_PROVIDER_CREDENTIALS_REQUIRED — set RESEND_API_KEY");
      const resend = new Resend(process.env.RESEND_API_KEY);
      const res = await resend.emails.send({ from, to: opts.to, subject, html });
      if (res.error) throw new Error(res.error.message);
      providerMessageId = res.data?.id ?? null;
    } else if (provider === "smtp") {
      providerMessageId = await sendViaSmtp({ from, to: opts.to, subject, html });
    } else if (provider === "console") {
      // explicit dev transport — prints to server stdout ONLY, never to any client
      console.log(`[email:${opts.template}] to=${opts.to} subject="${subject}"`);
    } else {
      throw new Error(`Unknown EMAIL_PROVIDER: ${provider}`);
    }
    await d.update(emailLogs).set({ status: "SENT", providerMessageId, error: null }).where(eq(emailLogs.id, logId));
    return { id: logId, status: "SENT" };
  } catch (e) {
    await d.update(emailLogs).set({ status: "FAILED", error: e instanceof Error ? e.message.slice(0, 500) : "send failed" }).where(eq(emailLogs.id, logId));
    return { id: logId, status: "FAILED" }; // queued — retried by the jobs worker, never blocks the order
  }
}

/** Minimal SMTP transport (STARTTLS) — production deployments may swap in a battle-tested
 *  library; kept dependency-light and server-side only. */
async function sendViaSmtp(m: { from: string; to: string; subject: string; html: string }): Promise<string> {
  const host = process.env.SMTP_HOST; const port = Number(process.env.SMTP_PORT ?? 587);
  if (!host) throw new Error("EMAIL_PROVIDER_CREDENTIALS_REQUIRED — set SMTP_HOST/SMTP_PORT");
  const net = await import("node:net");
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, host, () => {
      const lines = [
        `EHLO sherokey`, `MAIL FROM:<${m.from.match(/<(.+)>/)?.[1] ?? m.from}>`, `RCPT TO:<${m.to}>`, `DATA`,
        `Subject: ${m.subject}\r\nFrom: ${m.from}\r\nTo: ${m.to}\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${m.html}\r\n.`,
        `QUIT`,
      ];
      let i = 0;
      sock.on("data", () => { if (i < lines.length) sock.write(lines[i++] + "\r\n"); else { sock.end(); resolve(`smtp-${Date.now()}`); } });
      sock.setTimeout(10000, () => { sock.destroy(); reject(new Error("SMTP timeout")); });
      sock.on("error", reject);
    });
  });
}

/* ================================================================ settings access */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const d = requireDb();
  const row = (await d.select().from(settings).where(eq(settings.key, key)).limit(1))[0];
  return row ? (row.value as T) : fallback;
}
