import type { Currency, Lang } from "./types";

/** All money in the system is stored as integer minor units (USD cents at rest). */

export const CURRENCIES: Record<Currency, { code: Currency; label: string; symbol: string }> = {
  USD: { code: "USD", label: "US Dollar", symbol: "$" },
  EUR: { code: "EUR", label: "Euro", symbol: "€" },
  SAR: { code: "SAR", label: "Saudi Riyal", symbol: "ر.س" },
  RUB: { code: "RUB", label: "Russian Ruble", symbol: "₽" },
};

export const LOCALE: Record<Lang, string> = { en: "en-US", ar: "ar-SA", ru: "ru-RU", fr: "fr-FR" };

/** Convert USD minor units -> target currency minor units. Integer-safe (all 4 currencies use 100 minors). */
export function convertFromUsd(usdMinor: number, fx: Record<Currency, number>, currency: Currency): number {
  const rate = fx[currency] ?? 1;
  // rate is expressed with 4-decimal precision; keep integer arithmetic
  const scaled = Math.round(rate * 10000);
  return Math.round((usdMinor * scaled) / 10000);
}

/** Percent discount on minor units — integer arithmetic, floor. */
export function percentOff(amountMinor: number, pct: number): number {
  return Math.floor((amountMinor * Math.min(Math.max(pct, 0), 100)) / 100);
}

export function formatMoney(minor: number, currency: Currency, lang: Lang): string {
  try {
    return new Intl.NumberFormat(LOCALE[lang], {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

export function formatDate(ts: number, lang: Lang, withTime = true): string {
  try {
    return new Intl.DateTimeFormat(LOCALE[lang], {
      dateStyle: "medium",
      ...(withTime ? { timeStyle: "short" } : {}),
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
}

export function formatNumber(n: number, lang: Lang): string {
  try {
    return new Intl.NumberFormat(LOCALE[lang]).format(n);
  } catch {
    return String(n);
  }
}

/** Mask a license key: show only last 4 chars until the user reveals it. */
export function maskKey(key: string): string {
  const tail = key.slice(-4);
  return key.replace(/[^-]/g, "•").slice(0, -4) + tail;
}
