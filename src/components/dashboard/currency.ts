import { useSyncExternalStore } from "react";

export const CURRENCIES = ["INR", "USD", "EUR", "GBP"] as const;
export type DisplayCurrency = typeof CURRENCIES[number];
// ECB reference rates retrieved from Frankfurter on the stated date. Display
// conversions only: never change saved valuations or claim these are live quotes.
export const FX_DATE = "2026-09-24";
export const FX_SOURCE = "https://api.frankfurter.dev/v1/2026-09-24?base=USD";
export const FX: Record<string, number> = { USD: 1, INR: 95.96, EUR: 0.87974, GBP: 0.75645, JPY: 158.85 };
const symbols: Record<string, string> = { USD: "$", INR: "₹", EUR: "€", GBP: "£", JPY: "¥" };
const key = "ansyra.display-currency";
const eventName = "ansyra:currency";
function snapshot(): DisplayCurrency {
  try { const value = localStorage.getItem(key); return CURRENCIES.includes(value as DisplayCurrency) ? value as DisplayCurrency : "INR"; }
  catch { return "INR"; }
}
let fallback: DisplayCurrency | null = null;
function subscribe(listener: () => void) {
  window.addEventListener(eventName, listener); window.addEventListener("storage", listener);
  return () => { window.removeEventListener(eventName, listener); window.removeEventListener("storage", listener); };
}
export function setDisplayCurrency(value: DisplayCurrency) {
  if (!CURRENCIES.includes(value)) return;
  try { localStorage.setItem(key, value); fallback = null; } catch { fallback = value; }
  window.dispatchEvent(new Event(eventName));
}
export function convertAmount(amount: number, from: string, to: string): number | null {
  if (!Number.isFinite(amount)) return null;
  if (from === to) return amount;
  return FX[from] && FX[to] ? amount / FX[from] * FX[to] : null;
}
export function formatMoney(amount: number | null | undefined, from: string, to: string, millions = true): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  const converted = convertAmount(amount, from, to);
  if (converted == null) return `${from} ${amount.toLocaleString("en-US")}${millions ? "M" : ""} (no FX rate)`;
  const absolute = millions ? converted * 1e6 : converted;
  const size = Math.abs(absolute);
  const divisor = size >= 1e9 ? 1e9 : size >= 1e6 ? 1e6 : size >= 1e3 ? 1e3 : 1;
  const suffix = divisor === 1e9 ? "B" : divisor === 1e6 ? "M" : divisor === 1e3 ? "K" : "";
  return `${symbols[to] ?? `${to} `}${(absolute / divisor).toLocaleString("en-US", { maximumFractionDigits: 2 })}${suffix}`;
}
// Parse only explicit, unambiguous monetary values. Unknown prose, ranges,
// and source evidence remain verbatim rather than silently guessing units.
export function convertMoneyText(value: string | null | undefined, to: string): string {
  if (!value) return "—";
  const match = value.trim().match(/^(USD|EUR|GBP|INR|JPY|[$€£₹¥])\s*(-?[\d,]+(?:\.\d+)?)\s*(K|M|B|million|billion|thousand)?$/i);
  if (!match) return value;
  const from = Object.keys(symbols).find(code => symbols[code] === match[1]) ?? match[1].toUpperCase();
  const unit = match[3]?.toLowerCase();
  const amount = Number(match[2].replaceAll(",", "")) * (unit === "b" || unit === "billion" ? 1e9 : unit === "m" || unit === "million" ? 1e6 : unit === "k" || unit === "thousand" ? 1e3 : 1);
  return formatMoney(amount, from, to, false);
}
export function useCurrency() {
  const currency = useSyncExternalStore(subscribe, () => fallback ?? snapshot(), () => "INR" as DisplayCurrency);
  return {
    currency,
    money: (amount: number | null | undefined, from = "USD", millions = true) => formatMoney(amount, from, currency, millions),
    text: (value: string | null | undefined) => convertMoneyText(value, currency),
    totals: (totals: [string, number][]) => {
      if (!totals.length) return "—";
      const known = totals.filter(([from]) => FX[from]);
      const total = known.reduce((sum, [from, value]) => sum + (convertAmount(value, from, currency) ?? 0), 0);
      return [known.length ? formatMoney(total, currency, currency) : "", ...totals.filter(([from]) => !FX[from]).map(([from, value]) => formatMoney(value, from, currency))].filter(Boolean).join(" + ");
    },
  };
}
