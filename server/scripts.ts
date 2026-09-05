/**
 * SHEROKEY — ops CLI.
 *   npx tsx server/scripts.ts migrate                     apply migrations/0000_init.sql
 *   npx tsx server/scripts.ts owner email@x.com 'Pass…'   create the first OWNER (production: NEVER via UI/seed)
 *   npx tsx server/scripts.ts health                      boot-time provider connection checks (§20)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { hashPassword, sha256 } from "./lib/auth";

const [cmd, a1, a2] = process.argv.slice(2);

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL is required"); process.exit(1); }
  const sql = postgres(url, { max: 1 });

  if (cmd === "migrate") {
    const file = readFileSync(join(process.cwd(), "migrations", "0000_init.sql"), "utf8");
    await sql.unsafe(file);
    console.log("migrations applied ✓");
  } else if (cmd === "owner") {
    if (!a1 || !a2 || a2.length < 10) { console.error("usage: owner <email> <password(10+)>"); process.exit(1); }
    const passwordHash = await hashPassword(a2);
    await sql`INSERT INTO users (email, password_hash, name, role, email_verified)
              VALUES (${a1.toLowerCase()}, ${passwordHash}, ${"Owner"}, 'OWNER', true)
              ON CONFLICT (email) DO NOTHING`;
    console.log(`owner ${a1} created (or already existed) ✓`);
  } else if (cmd === "health") {
    const checks: [string, boolean][] = [
      ["database", true],
      ["redis", !!process.env.REDIS_URL],
      ["stripe", !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET],
      ["paypal", !!process.env.PAYPAL_CLIENT_ID && !!process.env.PAYPAL_CLIENT_SECRET],
      ["mir", !!(process.env.MIR_PROVIDER_API_KEY && process.env.MIR_PROVIDER_SECRET && process.env.MIR_PROVIDER_WEBHOOK_SECRET)],
      ["email", !!process.env.RESEND_API_KEY || !!process.env.SMTP_HOST],
    ];
    for (const [name, ok] of checks) console.log(`${ok ? "✓" : "✗ NOT CONFIGURED"}  ${name}`);
  } else {
    console.error("commands: migrate | owner <email> <password> | health");
    process.exit(1);
  }
  await sql.end();
}

void main().catch((e) => { console.error(e); process.exit(1); });
export { sha256 };
