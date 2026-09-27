import { MoneyInput } from "./MoneyInput";
import { useCurrency } from "./currency";
import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { INDUSTRY_OPTIONS } from "@/lib/form-options";
import { fmtMultiple } from "@contracts/economics";
import { Card } from "./parchment/Card";
import { SkeletonRows, LoadingAnnounce } from "./parchment/Skeleton";
import { Field, SelectInput } from "./DealPipeline";

// Comps Engine (Phase 15.4) — precedent transactions from the firm's OWN deals.
// Every figure is deterministic SQL aggregation (percentile_cont in Postgres),
// never AI. Source-currency cohorts stay separate; displayed money uses the
// global reference FX preference without changing dimensionless multiples.

const numOrUndef = (s: string): number | undefined => {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
};

const ALL = "All sectors";

export function CompsTable() {
  const [sector, setSector] = useState<string>(ALL);
  const [evMin, setEvMin] = useState("");
  const [evMax, setEvMax] = useState("");
  const [closedOnly, setClosedOnly] = useState(false);
  const fx = useCurrency();
  const [currency, setCurrency] = useState<string | null>(null);

  const q = trpc.comps.query.useQuery({
    ...(sector !== ALL ? { sector } : {}),
    ...(numOrUndef(evMin) != null ? { evMin: numOrUndef(evMin) } : {}),
    ...(numOrUndef(evMax) != null ? { evMax: numOrUndef(evMax) } : {}),
    closedOnly,
  });

  const stats = q.data?.stats ?? [];
  // Default to the currency with the most precedents; the switcher overrides.
  const active = currency ? stats.find((s) => s.currency === currency) : stats[0];
  const sourceCurrency = currency ?? active?.currency ?? "USD";
  const rows = (q.data?.rows ?? []).filter((r) => r.currency === sourceCurrency);

  const tiles = active
    ? [
        { label: "Median EV/EBITDA", value: fmtMultiple(active.evEbitda.median), sub: `${active.evEbitda.n} with EBITDA` },
        {
          label: "EV/EBITDA range (Q1–Q3)",
          value:
            active.evEbitda.q1 != null && active.evEbitda.q3 != null
              ? `${active.evEbitda.q1}–${active.evEbitda.q3}×`
              : "n.m.",
          sub: "interquartile",
        },
        { label: "Median EV/Revenue", value: fmtMultiple(active.evRevenue.median), sub: `${active.evRevenue.n} with revenue` },
      ]
    : [];

  return (
    <div className="space-y-6" data-testid="comps">
      <Card className="p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl font-light" style={{ color: "var(--fg)" }}>
              Precedent comps
            </h2>
            <p className="mt-1 font-sans text-[13px]" style={{ color: "var(--fg-2)" }}>
              Recorded deal valuations — median and quartile multiples across your own deals. Select “Closed deals only” to exclude active and cancelled transactions.
            </p>
          </div>
          {stats.length > 1 && (
            <div className="flex gap-2">
              {stats.map((s) => (
                <button
                  key={s.currency}
                  type="button"
                  onClick={() => setCurrency(s.currency)}
                  data-testid={`comps-currency-${s.currency}`}
                  className="rounded-full border px-3 py-1.5 font-mono text-[length:var(--step-xs)]"
                  style={{
                    borderColor: s.currency === active?.currency ? "var(--fg)" : "var(--fg-rule)",
                    color: s.currency === active?.currency ? "var(--fg)" : "var(--fg-2)",
                    background: "var(--fg-surface)",
                  }}
                >
                  {s.currency} · {s.n}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Sector">
            <SelectInput value={sector} onChange={setSector} options={[ALL, ...INDUSTRY_OPTIONS]} />
          </Field>
          <Field label={`EV min (${fx.currency}M)`}>
            <MoneyInput source={sourceCurrency} className="w-full rounded-sm border bg-transparent px-3 py-2 font-sans text-sm" style={{ color: "var(--fg)", borderColor: "var(--fg-rule)" }} value={evMin} onValueChange={setEvMin} placeholder="50" />
          </Field>
          <Field label={`EV max (${fx.currency}M)`}>
            <MoneyInput source={sourceCurrency} className="w-full rounded-sm border bg-transparent px-3 py-2 font-sans text-sm" style={{ color: "var(--fg)", borderColor: "var(--fg-rule)" }} value={evMax} onValueChange={setEvMax} placeholder="200" />
          </Field>
          <Field label="Scope">
            <label className="flex items-center gap-2 font-sans text-[13px]" style={{ color: "var(--fg-2)" }}>
              <input
                type="checkbox"
                checked={closedOnly}
                onChange={(e) => setClosedOnly(e.target.checked)}
                data-testid="comps-closed-only"
                className="h-4 w-4"
                style={{ accentColor: "var(--sev-grounded)" }}
              />
              Closed deals only
            </label>
          </Field>
        </div>
      </Card>

      {q.isLoading ? (
        <Card className="p-6">
          <LoadingAnnounce what="precedent comps" />
          <SkeletonRows rows={4} />
        </Card>
      ) : q.isError ? (
        <Card><p role="alert">Precedent comps could not load.</p><button onClick={() => q.refetch()}>Try again</button></Card>
      ) : !active || rows.length === 0 ? (
        <Card className="p-6" data-testid="comps-empty">
          <p className="font-serif text-lg" style={{ color: "var(--fg)" }}>No precedents yet.</p>
          <p className="mt-1 font-sans text-[13px]" style={{ color: "var(--fg-2)", maxWidth: "62ch" }}>
            Comps build as you record economics on your deals. Open a deal → Economics, enter the
            enterprise value and EBITDA, and it becomes a precedent here. Sample-portfolio deals are
            excluded on purpose.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {tiles.map((t) => (
              <Card key={t.label} className="p-6">
                <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>
                  {t.label}
                </p>
                <p
                  className="mt-2 font-serif font-light leading-none"
                  style={{ color: "var(--fg)", fontSize: "clamp(1.9rem, 3vw, 2.5rem)" }}
                >
                  {t.value}
                </p>
                <p className="mt-1 font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>{t.sub}</p>
              </Card>
            ))}
          </div>

          {active.lowSample && (
            <p className="font-mono text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>
              Low sample — {active.n} precedent{active.n === 1 ? "" : "s"} in {active.currency}. Treat these
              figures as indicative only.
            </p>
          )}

          <Card className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--fg-rule)" }}>
                    {["Deal", "Sector", "Status", "EV", "EV/EBITDA", "EV/Revenue", "Realized"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left ansyra-label"
                        style={{ color: "var(--fg-2)" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.dealId} style={{ borderBottom: "1px solid var(--fg-rule)" }} data-testid={`comp-${r.dealId}`}>
                      <td className="px-4 py-3">
                        <Link
                          to={`/dashboard/deals/${r.dealId}`}
                          className="font-serif text-[15px] underline-offset-4 hover:underline"
                          style={{ color: "var(--fg)" }}
                        >
                          {r.name}
                        </Link>
                        <span className="block font-sans text-[11.5px]" style={{ color: "var(--fg-2)" }}>
                          {r.targetCompany}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-sans text-[12.5px]" style={{ color: "var(--fg-2)" }}>
                        {r.industry ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-sans text-[12.5px] capitalize" style={{ color: "var(--fg-2)" }}>
                        {r.status}
                      </td>
                      <td className="px-4 py-3 font-mono text-[12.5px] tabular-nums" style={{ color: "var(--fg-2)" }}>
                        {fx.money(r.enterpriseValue, r.currency)}
                      </td>
                      <td className="px-4 py-3 font-mono text-[13px] tabular-nums" style={{ color: "var(--fg)" }}>
                        {fmtMultiple(r.evEbitda)}
                      </td>
                      <td className="px-4 py-3 font-mono text-[12.5px] tabular-nums" style={{ color: "var(--fg-2)" }}>
                        {fmtMultiple(r.evRevenue)}
                      </td>
                      <td className="px-4 py-3 font-mono text-[12.5px] tabular-nums" style={{ color: "var(--fg-2)" }}>
                        {r.realizedMoic != null
                          ? `${r.realizedMoic}× MOIC`
                          : r.realizedIrr != null
                            ? `${(r.realizedIrr * 100).toFixed(1)}% IRR`
                            : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
