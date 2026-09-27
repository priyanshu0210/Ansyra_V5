// Shared dropdown options for deal/target forms.

export const INDUSTRY_OPTIONS = [
  "Technology & Software",
  "Healthcare & Life Sciences",
  "Financial Services",
  "Industrials & Manufacturing",
  "Consumer & Retail",
  "Energy & Utilities",
  "Clean Energy",
  "Supply Chain & Logistics",
  "Media & Telecom",
  "Business Services",
  "Real Estate",
  "Cybersecurity",
  "Other",
] as const;

export const CURRENCY_OPTIONS = [
  { code: "USD", symbol: "$" },
  { code: "EUR", symbol: "€" },
  { code: "GBP", symbol: "£" },
  { code: "INR", symbol: "₹" },
  { code: "JPY", symbol: "¥" },
] as const;

// Deal/target `value` fields are stored as display strings (e.g. "$85M").
// splitValue/joinValue convert between the stored string and the
// currency-select + amount-input pair on the forms.
export function splitValue(value: string | null): { symbol: string; amount: string } {
  if (!value) return { symbol: "$", amount: "" };
  const match = CURRENCY_OPTIONS.find((c) => value.startsWith(c.symbol));
  if (match) return { symbol: match.symbol, amount: value.slice(match.symbol.length) };
  return { symbol: "$", amount: value };
}

export function joinValue(symbol: string, amount: string): string {
  const trimmed = amount.trim();
  return trimmed ? `${symbol}${trimmed}` : "";
}

export const FIT_SCORE_EXPLANATION =
  "Fit Score is your team's 0–100 rating of how well this target matches your acquisition thesis — strategy, financials, culture, and timing. You set it when screening; it is not computed automatically.";
