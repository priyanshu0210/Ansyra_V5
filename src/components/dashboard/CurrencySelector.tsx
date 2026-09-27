import { CURRENCIES, FX_DATE, FX_SOURCE, setDisplayCurrency, useCurrency } from "./currency";
const flags = { INR: "🇮🇳", USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧" };
export function CurrencySelector({ compact = false }: { compact?: boolean }) {
  const { currency } = useCurrency();
  return <div className={compact ? "w-28 shrink-0 sm:w-36" : "w-36 shrink-0"} style={{ color: "var(--fg)" }}>
    <div className="relative">
    <select
      aria-label="Display currency"
      value={currency}
      onChange={(event) => setDisplayCurrency(event.target.value as typeof currency)}
      className="min-h-11 w-full appearance-none rounded-full border pl-4 pr-10 font-sans text-sm"
      style={{ borderColor: "var(--sev-grounded)", background: "var(--fg-surface)", color: "var(--fg)", colorScheme: "light" }}
    >
      {CURRENCIES.map(code => <option key={code} value={code}>{flags[code]} {code}</option>)}
    </select>
    <svg aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m6 9 6 6 6-6" /></svg>
    </div>
    <p className="mt-0.5 text-center font-sans text-[10px]" style={{ color: "var(--fg-2)" }}><a href={FX_SOURCE} target="_blank" rel="noreferrer" title="Dated reference rates, not live market quotes. Stored amounts and source documents keep their original currency."><span className={compact ? "sm:hidden" : "hidden"}>FX · {FX_DATE}</span><span className={compact ? "hidden sm:inline" : undefined}>Reference FX · {FX_DATE}</span></a></p>
  </div>;
}
