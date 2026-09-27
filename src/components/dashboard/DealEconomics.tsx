import { MoneyInput } from "./MoneyInput";
import { useCurrency } from "./currency";
import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { withToast } from "./parchment/notify";
import { CURRENCY_OPTIONS } from "@/lib/form-options";
import {
  computeMultiples,
  deriveEv,
  fmtMultiple,
  quickIrrMoic,
  sourcesUsesBalance,
  type SourcesUsesRow,
} from "@contracts/economics";
import { Card } from "./parchment/Card";
import { Field, SelectInput, TextInput } from "./DealPipeline";

// Deal Economics (Phase 15.2) — the analyst's first question: "what multiple are
// we paying?". Every number shown here comes from contracts/economics.ts, the
// SAME pure functions the server recomputes on save — so the live preview and
// the persisted values can never disagree. No AI anywhere near this math.
// Amounts are in MILLIONS of the selected currency.

const numOrNull = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const str = (n: number | null | undefined) => (n == null ? "" : String(n));

export function DealEconomics({ dealId }: { dealId: number }) {
  const fx = useCurrency();
  const utils = trpc.useUtils();
  const saved = trpc.economics.get.useQuery({ dealId });
  // "vs. precedents" (Phase 15.4) — this deal's entry multiple against the firm's
  // own comps. Silently absent when the member lacks the comps feature.
  const bench = trpc.comps.benchmark.useQuery({ dealId }, { retry: false });

  const [currency, setCurrency] = useState("USD");
  const [ev, setEv] = useState("");
  const [equity, setEquity] = useState("");
  const [netDebt, setNetDebt] = useState("");
  const [ebitda, setEbitda] = useState("");
  const [revenue, setRevenue] = useState("");
  const [equityPct, setEquityPct] = useState("");
  const [holdYears, setHoldYears] = useState("");
  const [exitMultiple, setExitMultiple] = useState("");
  const [showPe, setShowPe] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Hydrate the form once the saved record arrives (and after a save).
  useEffect(() => {
    const r = saved.data;
    if (!r) return;
    // form hydration: these inputs are user-editable after load, so they are
    // local state seeded from the query, not derived from it. The idiomatic fix
    // is a `key` reset on the subtree, which changes focus and dirty-tracking
    // behaviour on save.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrency(r.currency ?? "USD");
    setEv(str(r.enterpriseValue));
    setEquity(str(r.equityValue));
    setNetDebt(str(r.netDebt));
    setEbitda(str(r.targetEbitda));
    setRevenue(str(r.targetRevenue));
    setEquityPct(str(r.peInputs?.equityPct ?? null));
    setHoldYears(str(r.peInputs?.holdYears ?? null));
    setExitMultiple(str(r.peInputs?.exitMultiple ?? null));
    if (r.peInputs?.equityPct != null) setShowPe(true);
    setDirty(false);
  }, [saved.data]);

  const save = trpc.economics.save.useMutation(withToast({ done: "Economics saved", failed: "Could not save the economics" }, {
    onSuccess: () => {
      utils.economics.get.invalidate({ dealId });
      utils.activity.list.invalidate();
      setDirty(false);
    },
  }));

  const touch = (fn: (v: string) => void) => (v: string) => {
    fn(v);
    setDirty(true);
  };

  // Live preview — identical logic to the server's recompute on save.
  const preview = useMemo(() => {
    const evNum = numOrNull(ev) ?? deriveEv({ equityValue: numOrNull(equity), netDebt: numOrNull(netDebt) });
    const ebitdaNum = numOrNull(ebitda);
    const m = computeMultiples({ ev: evNum, ebitda: ebitdaNum, revenue: numOrNull(revenue) });
    const r = quickIrrMoic({
      ev: evNum,
      ebitda: ebitdaNum,
      equityPct: numOrNull(equityPct),
      holdYears: numOrNull(holdYears),
      exitMultiple: numOrNull(exitMultiple),
    });
    const su = sourcesUsesBalance(
      (saved.data?.sourcesUses ?? []) as SourcesUsesRow[],
    );
    return { evNum, ...m, ...r, su };
  }, [ev, equity, netDebt, ebitda, revenue, equityPct, holdYears, exitMultiple, saved.data?.sourcesUses]);

  const hasAnything = !!(ev || equity || ebitda || revenue);

  function onSave() {
    save.mutate({
      dealId,
      currency,
      // Send EV only when typed; otherwise the server derives it from equity+debt.
      enterpriseValue: numOrNull(ev),
      equityValue: numOrNull(equity),
      netDebt: numOrNull(netDebt),
      targetEbitda: numOrNull(ebitda),
      targetRevenue: numOrNull(revenue),
      peInputs: {
        ...(numOrNull(equityPct) != null ? { equityPct: numOrNull(equityPct)! } : {}),
        ...(numOrNull(holdYears) != null ? { holdYears: numOrNull(holdYears)! } : {}),
        ...(numOrNull(exitMultiple) != null ? { exitMultiple: numOrNull(exitMultiple)! } : {}),
      },
    });
  }

  return (
    <Card className="p-6" data-testid="deal-economics">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-serif text-xl font-light" style={{ color: "var(--fg)" }}>
          Economics
        </h3>
        <span className="ansyra-label" style={{ color: "var(--fg-2)" }}>
          Inputs in {fx.currency} millions · saved in {currency}
        </span>
      </div>

      <details className="mt-4 border-y py-3 font-sans text-sm leading-relaxed" style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)" }}>
        <summary className="cursor-pointer" style={{ color: "var(--fg)" }}>What these numbers mean</summary>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><dt className="font-medium">Enterprise value (EV)</dt><dd>The value of the operating business. Here, it is equity value plus net debt.</dd></div>
          <div><dt className="font-medium">EBITDA</dt><dd>Earnings before interest, tax, depreciation and amortisation. It helps compare operating performance, but is not cash flow.</dd></div>
          <div><dt className="font-medium">EV / EBITDA</dt><dd>The price relative to annual earnings. An EV of 80 and EBITDA of 10 gives 8×. If earnings fall to 8 at the same price, you pay 10×.</dd></div>
          <div><dt className="font-medium">MOIC and IRR</dt><dd>MOIC compares money received with money invested; IRR expresses the return per year. This quick estimate holds earnings and debt flat and excludes fees and interim cash flows.</dd></div>
        </dl>
        <p className="mt-3">“n.m.” means the multiple cannot be meaningfully calculated. Figures are calculated from your inputs; they are not a valuation opinion.</p>
      </details>

      {/* Headline multiples — the numbers an analyst looks for first. */}
      <div className="mt-5 flex flex-wrap gap-8">
        <div>
          <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>
            EV / EBITDA
          </p>
          <p
            data-testid="ev-ebitda"
            className="font-serif font-light leading-none"
            style={{ color: "var(--fg)", fontSize: "clamp(2rem, 3.4vw, 2.75rem)" }}
          >
            {fmtMultiple(preview.evEbitda)}
          </p>
        </div>
        <div>
          <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>
            EV / Revenue
          </p>
          <p
            data-testid="ev-revenue"
            className="font-serif font-light leading-none"
            style={{ color: "var(--fg)", fontSize: "clamp(2rem, 3.4vw, 2.75rem)" }}
          >
            {fmtMultiple(preview.evRevenue)}
          </p>
        </div>
        {preview.evNum != null && (
          <div>
            <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>
              Enterprise value
            </p>
            <p className="font-mono text-[22px] leading-none" style={{ color: "var(--fg-2)", paddingTop: 6 }}>
              {fx.money(preview.evNum, currency)}
            </p>
          </div>
        )}
      </div>

      {!hasAnything && !saved.isLoading && (
        <p className="mt-4 font-sans text-[13px]" style={{ color: "var(--fg-2)" }}>
          Add economics — 30 seconds. Enter EV (or equity + net debt) and EBITDA to get your entry multiple.
        </p>
      )}

      {/* vs. precedents — only meaningful once this deal AND some peers have multiples. */}
      {bench.data?.evEbitda != null && bench.data.peers.median != null && (
        <p className="mt-3 font-sans text-[12.5px]" data-testid="comps-benchmark" style={{ color: "var(--fg-2)" }}>
          {fmtMultiple(bench.data.evEbitda)} vs. firm median {fmtMultiple(bench.data.peers.median)}
          {bench.data.deltaPct != null && (
            <strong
              style={{ color: bench.data.deltaPct > 0 ? "var(--sev-flag)" : "var(--sev-grounded)" }}
            >
              {" "}
              ({bench.data.deltaPct > 0 ? "+" : ""}
              {bench.data.deltaPct}%)
            </strong>
          )}{" "}
          across {bench.data.peers.n} precedent{bench.data.peers.n === 1 ? "" : "s"}
          {bench.data.basis === "sector" && bench.data.sector ? ` in ${bench.data.sector}` : " (all sectors)"}
          {bench.data.lowSample && " (low sample)"}
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Currency">
          <SelectInput
            value={currency}
            onChange={touch(setCurrency)}
            options={CURRENCY_OPTIONS.map((c) => c.code)}
          />
        </Field>
        <Field label={`Enterprise value (${fx.currency}M)`}>
          <MoneyInput source={currency} className="w-full rounded-sm border bg-transparent px-3 py-2 font-sans text-sm" style={{ color: "var(--fg)", borderColor: "var(--fg-rule)" }} value={ev} onValueChange={touch(setEv)} placeholder="850" />
        </Field>
        <Field label={`EBITDA (${fx.currency}M)`}>
          <MoneyInput source={currency} className="w-full rounded-sm border bg-transparent px-3 py-2 font-sans text-sm" style={{ color: "var(--fg)", borderColor: "var(--fg-rule)" }} value={ebitda} onValueChange={touch(setEbitda)} placeholder="100" />
        </Field>
        <Field label={`Equity value (${fx.currency}M)`}>
          <MoneyInput source={currency} className="w-full rounded-sm border bg-transparent px-3 py-2 font-sans text-sm" style={{ color: "var(--fg)", borderColor: "var(--fg-rule)" }} value={equity} onValueChange={touch(setEquity)} placeholder="600" />
        </Field>
        <Field label={`Net debt (${fx.currency}M)`}>
          <MoneyInput source={currency} className="w-full rounded-sm border bg-transparent px-3 py-2 font-sans text-sm" style={{ color: "var(--fg)", borderColor: "var(--fg-rule)" }} value={netDebt} onValueChange={touch(setNetDebt)} placeholder="250" />
        </Field>
        <Field label={`Revenue (${fx.currency}M)`}>
          <MoneyInput source={currency} className="w-full rounded-sm border bg-transparent px-3 py-2 font-sans text-sm" style={{ color: "var(--fg)", borderColor: "var(--fg-rule)" }} value={revenue} onValueChange={touch(setRevenue)} placeholder="500" />
        </Field>
      </div>

      {!ev && (equity || netDebt) && (
        <p className="mt-3 font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>
          EV will be derived as equity + net debt.
        </p>
      )}

      {/* PE quick math — deliberately simple, with its assumptions stated. */}
      <button
        type="button"
        onClick={() => setShowPe((v) => !v)}
        data-testid="toggle-pe-math"
        className="mt-6 font-sans text-[13px] underline-offset-4 hover:underline"
        style={{ color: "var(--fg)" }}
      >
        {showPe ? "Hide" : "Show"} PE quick math
      </button>

      {showPe && (
        <div className="mt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Equity %">
              <TextInput value={equityPct} onChange={touch(setEquityPct)} placeholder="40" />
            </Field>
            <Field label="Hold (years)">
              <TextInput value={holdYears} onChange={touch(setHoldYears)} placeholder="5" />
            </Field>
            <Field label="Exit multiple (×)">
              <TextInput value={exitMultiple} onChange={touch(setExitMultiple)} placeholder="10" />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap items-baseline gap-8">
            <span className="font-mono text-[13px]" style={{ color: "var(--fg-2)" }}>
              MOIC{" "}
              <strong data-testid="moic" style={{ color: "var(--fg)" }}>
                {preview.moic == null ? "—" : `${preview.moic}×`}
              </strong>
            </span>
            <span className="font-mono text-[13px]" style={{ color: "var(--fg-2)" }}>
              IRR{" "}
              <strong data-testid="irr" style={{ color: "var(--fg)" }}>
                {preview.irr == null ? "—" : `${(preview.irr * 100).toFixed(1)}%`}
              </strong>
            </span>
          </div>
          <p className="mt-2 font-sans text-[11.5px] leading-relaxed" style={{ color: "var(--fg-2)", maxWidth: "62ch" }}>
            Estimate only: no interim cash flows, no fees, entry debt held flat to exit.
            MOIC = exit equity ÷ entry equity; IRR = MOIC^(1/years) − 1.
          </p>
        </div>
      )}

      {saved.data?.sourcesUses?.length ? (
        <div className="mt-6">
          <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>
            Sources &amp; uses
          </p>
          <p className="mt-2 font-mono text-[13px]" style={{ color: "var(--fg-2)" }}>
            Sources {fx.money(preview.su.sources, currency)} · Uses {fx.money(preview.su.uses, currency)}
            {!preview.su.balanced && (
              <span
                className="ml-3 rounded-full px-2.5 py-1 font-sans text-[length:var(--step-xs)]"
                style={{ background: "color-mix(in srgb, var(--sev-flag) 12%, transparent)", color: "var(--sev-flag-text)" }}
              >
                Out by {fx.money(Math.abs(preview.su.delta), currency)}
              </span>
            )}
          </p>
        </div>
      ) : null}

      <div className="mt-6 flex items-center gap-4">
        <button
          type="button"
          onClick={onSave}
          disabled={save.isPending || !dirty}
          data-testid="save-economics"
          className="rounded-full px-6 py-2.5 font-sans text-sm font-medium disabled:opacity-50"
          style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)", minHeight: 44 }}
        >
          {save.isPending ? "Saving…" : dirty ? "Save economics" : "Saved"}
        </button>
        {save.error && (
          <span className="font-sans text-[12.5px]" style={{ color: "var(--sev-flag-text)" }}>
            {save.error.message}
          </span>
        )}
      </div>
    </Card>
  );
}
