/**
 * SHEROKEY — production server entry.
 * Serves the API (/api/*) and the built storefront (dist/) over one process.
 * Run:  npx tsx server/entry.ts        (PORT defaults to 8080)
 * Behind a reverse proxy (Caddy/nginx) that terminates HTTPS — HSTS headers are
 * already emitted by the API layer; static responses get them via the proxy or .htaccess.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
import { handle, SECURITY_HEADERS, type Ctx } from "./api";

const PORT = Number(process.env.PORT ?? 8080);
const DIST = join(process.cwd(), "dist");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json",
  ".xml": "application/xml", ".txt": "text/plain", ".woff2": "font/woff2",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.socket.remoteAddress;

  if (url.pathname.startsWith("/api/")) {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const ctx: Ctx = {
      method: req.method ?? "GET",
      path: url.pathname,
      query: url.searchParams,
      headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v ?? ""])),
      body: Buffer.concat(chunks).toString("utf8"),
      ip,
    };
    const out = await handle(ctx);
    res.writeHead(out.status, { "Content-Type": "application/json", ...out.headers });
    res.end(JSON.stringify(out.body));
    return;
  }

  // static storefront with SPA fallback
  let file = join(DIST, url.pathname === "/" ? "index.html" : url.pathname);
  if (!existsSync(file) || !extname(file)) file = join(DIST, "index.html");
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream", ...SECURITY_HEADERS });
    res.end(data);
  } catch {
    res.writeHead(404, SECURITY_HEADERS);
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`SHEROKEY server listening on :${PORT} (${process.env.NODE_ENV ?? "development"})`);
  if (!process.env.DATABASE_URL) console.warn("[boot] DATABASE_URL missing — API calls will report DATABASE_CONNECTION_REQUIRED");
  if (!process.env.STRIPE_SECRET_KEY) console.warn("[boot] Stripe NOT CONFIGURED — provider reports honestly as such");
  if (!process.env.PAYPAL_CLIENT_ID) console.warn("[boot] PayPal NOT CONFIGURED");
  if (!process.env.MIR_PROVIDER_API_KEY) console.warn("[boot] MIR acquirer NOT CONFIGURED");
  if (!process.env.RESEND_API_KEY) console.warn("[boot] Email provider NOT CONFIGURED — set RESEND_API_KEY or EMAIL_PROVIDER=console for dev");
});
