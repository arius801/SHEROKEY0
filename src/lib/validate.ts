/** Boundary validation used at every service entry point (A22).
 *  In the production backend these checks become Zod schemas shared between
 *  client and server — the contracts below are written to map 1:1 to Zod. */

export const vEmail = (s: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim()) && s.trim().length <= 254;

export const vPassword = (s: string): boolean => s.length >= 8 && s.length <= 128;

export const vName = (s: string): boolean => s.trim().length >= 1 && s.trim().length <= 80;

export const vCouponCode = (s: string): boolean => /^[A-Za-z0-9_-]{3,32}$/.test(s.trim());

export const vTicketSubject = (s: string): boolean => s.trim().length >= 4 && s.trim().length <= 120;
export const vTicketBody = (s: string): boolean => s.trim().length >= 2 && s.trim().length <= 5000;

/** One license key per line: 5–120 chars, alphanumeric/dash. Invalid lines are dropped. */
export const vKeyLines = (raw: string): string[] =>
  raw.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length >= 5 && s.length <= 120 && /^[A-Za-z0-9-]+$/.test(s));

/** Manual-delivery payloads: every field bounded, nothing executable. */
export const vDeliveryField = (s: string | null | undefined): string | null => {
  if (!s) return null;
  const t = s.trim().slice(0, 500);
  return t.length ? t : null;
};
