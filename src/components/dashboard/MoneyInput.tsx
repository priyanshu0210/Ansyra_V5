import { useState, type InputHTMLAttributes } from "react";
import { convertAmount, useCurrency } from "./currency";

/** Edits a display-currency amount, reporting the original currency back to the caller. */
export function MoneyInput({ value, onValueChange, source = "USD", ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & { value: string | number; onValueChange: (value: string) => void; source?: string }) {
  const { currency } = useCurrency();
  const [draft, setDraft] = useState<{ stored: string; shown: string; currency: string; source: string } | null>(null);
  const original = String(value);
  const converted = original.trim() === "" ? null : convertAmount(Number(original), source, currency);
  const shown = draft?.stored === original && draft.currency === currency && draft.source === source ? draft.shown : converted == null ? original : String(Number(converted.toFixed(6)));
  return <input {...props} type="number" step="any" value={shown} onChange={event => {
    const text = event.target.value;
    const convertedBack = text === "" ? "" : String(convertAmount(Number(text), currency, source) ?? Number(text));
    setDraft({ stored: convertedBack, shown: text, currency, source });
    onValueChange(convertedBack);
  }} />;
}
