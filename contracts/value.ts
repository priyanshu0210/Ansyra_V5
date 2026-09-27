// Parse a deal-value display string ("$85M", "€1.2B", "₹500K", "$3,400M")
// into a numeric amount IN MILLIONS plus an ISO currency code. Mirrors the
// Phase 11.1 SQL backfill exactly — keep the two in sync. Unparseable input
// returns null; the display string is always kept as the source of truth.

const SYMBOL_TO_CODE: Record<string, string> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "₹": "INR",
  "¥": "JPY",
};

const SCALE: Record<string, number> = { B: 1000, K: 0.001, M: 1 };

export interface ParsedDealValue {
  amount: number; // in millions
  currency: string; // ISO 4217
}

export function parseDealValue(value: string | null | undefined): ParsedDealValue | null {
  if (!value) return null;
  const m = value.trim().match(/^([€£₹¥$])?\s*([\d.,]+)\s*([MBKmbk])?$/);
  if (!m) return null;
  const [, symbol, num, suffix] = m;
  const amount = parseFloat(num.replace(/,/g, ""));
  if (!Number.isFinite(amount)) return null;
  const scale = SCALE[(suffix ?? "M").toUpperCase()] ?? 1;
  return {
    amount: amount * scale,
    currency: symbol ? SYMBOL_TO_CODE[symbol] : "USD",
  };
}
