import { useCurrency } from "./currency";
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { withToast } from "./parchment/notify";
import { Card } from "./parchment/Card";
import { Field, Modal, SelectInput, TextInput, Textarea } from "./DealPipeline";
import { INDUSTRY_OPTIONS } from "@/lib/form-options";
import { AiDisclaimer } from "@/components/AiDisclaimer";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";

type Run = inferRouterOutputs<AppRouter>["targets"]["discover"];
type Candidate = Run["results"][number];

const SIZE_BUCKETS = [
  { value: "micro", label: "Micro (< $5M rev)" },
  { value: "small", label: "Small ($5–25M)" },
  { value: "lower_mid", label: "Lower mid ($25–100M)" },
  { value: "mid", label: "Mid ($100–500M)" },
  { value: "large", label: "Large (> $500M)" },
] as const;
type SizeBucket = (typeof SIZE_BUCKETS)[number]["value"];

const CONF_COLOR: Record<string, string> = {
  High: "var(--sev-grounded)",
  Medium: "var(--sev-watch)",
  Low: "var(--sev-flag)",
};

export function TargetDiscovery() {
  const fx = useCurrency();
  const sizeLabels: Record<string, string> = { micro: `Micro (< ${fx.money(5)} revenue)`, small: `Small (${fx.money(5)}–${fx.money(25)})`, lower_mid: `Lower mid (${fx.money(25)}–${fx.money(100)})`, mid: `Mid (${fx.money(100)}–${fx.money(500)})`, large: `Large (> ${fx.money(500)})` };
  const utils = trpc.useUtils();
  const [industries, setIndustries] = useState<string[]>([]);
  const [geography, setGeography] = useState("");
  const [sizeBuckets, setSizeBuckets] = useState<SizeBucket[]>([]);
  const [mustHaves, setMustHaves] = useState("");
  const [dealBreakers, setDealBreakers] = useState("");
  const [count, setCount] = useState<5 | 10>(5);
  const [error, setError] = useState<string | null>(null);
  // The most recent run this session; past runs load from the query below.
  const [run, setRun] = useState<Run | null>(null);

  const runs = trpc.targets.listDiscoveryRuns.useQuery();
  const discover = trpc.targets.discover.useMutation(withToast({ done: "Candidates found", failed: "Could not run discovery" }, {
    onSuccess: (r) => {
      setRun(r);
      utils.targets.listDiscoveryRuns.invalidate();
      utils.activity.list.invalidate();
    },
    onError: (e) => setError(e.message),
  }));

  const toggleIndustry = (v: string) =>
    setIndustries((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));
  const toggleBucket = (v: SizeBucket) =>
    setSizeBuckets((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));

  const canRun = industries.length > 0 && geography.trim().length > 0 && sizeBuckets.length > 0;

  return (
    <div className="space-y-6">
      {/* Persistent disclaimer */}
      <div className="rounded-sm border-l p-4" style={{ borderColor: "var(--sev-watch)", background: "color-mix(in srgb, var(--sev-watch) 8%, var(--fg-surface))" }} data-testid="discovery-disclaimer">
        <p className="font-sans text-[13px]" style={{ color: "var(--fg-2)" }}>
          Candidates are AI-researched from live web sources. All figures are <strong>estimates</strong> — verify independently before any outreach.
        </p>
      </div>

      <Card>
        <p className="mb-4 ansyra-label" style={{ color: "var(--fg-2)" }}>Acquisition thesis</p>
        <div className="space-y-4">
          <Field required label={`Industries (${industries.length} selected)`}>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {INDUSTRY_OPTIONS.filter((i) => i !== "Other").map((ind) => (
                <label key={ind} className="flex items-center gap-2 font-sans text-[13px]" style={{ color: "var(--fg)" }}>
                  <input type="checkbox" checked={industries.includes(ind)} onChange={() => toggleIndustry(ind)} data-testid={`disc-ind-${ind.split(" ")[0].toLowerCase()}`} />
                  {ind}
                </label>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Geography">
              <div data-testid="disc-geo">
                <TextInput required value={geography} onChange={setGeography} placeholder="e.g. India, DACH, US Midwest" />
              </div>
            </Field>
            <Field label="How many candidates">
              <SelectInput value={String(count)} onChange={(v) => setCount(Number(v) === 10 ? 10 : 5)} options={["5", "10"]} />
            </Field>
          </div>
          <Field required label="Company size">
            <div className="flex flex-wrap gap-3">
              {SIZE_BUCKETS.map((b) => (
                <label key={b.value} className="flex items-center gap-2 font-sans text-[13px]" style={{ color: "var(--fg)" }}>
                  <input type="checkbox" checked={sizeBuckets.includes(b.value)} onChange={() => toggleBucket(b.value)} data-testid={`disc-size-${b.value}`} />
                  {sizeLabels[b.value]}
                </label>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Must-haves (optional)">
              <Textarea value={mustHaves} onChange={setMustHaves} rows={2} placeholder="e.g. recurring revenue, founder open to exit" />
            </Field>
            <Field label="Deal-breakers (optional)">
              <Textarea value={dealBreakers} onChange={setDealBreakers} rows={2} placeholder="e.g. heavy customer concentration, litigation" />
            </Field>
          </div>

          {error && <p className="font-sans text-[13px]" style={{ color: "var(--sev-flag-text)" }} data-testid="disc-error">{error}</p>}

          <button
            onClick={() => {
              setError(null);
              discover.mutate({
                industries,
                geography,
                sizeBuckets,
                mustHaves: mustHaves.trim() || undefined,
                dealBreakers: dealBreakers.trim() || undefined,
                count,
              });
            }}
            disabled={!canRun || discover.isPending}
            data-testid="disc-run"
            className="rounded-full px-6 py-2.5 font-sans text-[13px] disabled:opacity-50"
            style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)" }}
          >
            {discover.isPending ? "Researching the live market… (5–15s)" : "Run discovery"}
          </button>
        </div>
      </Card>

      {run && (
        <div data-testid="disc-results">
          <p className="mb-3 ansyra-label" style={{ color: "var(--fg-2)" }}>
            {run.results.length} candidates · {new Date(run.createdAt).toLocaleString()}
          </p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {run.results.map((c, i) => (
              <CandidateCard key={`${run.id}-${i}`} candidate={c} />
            ))}
          </div>
        </div>
      )}

      {/* Past runs */}
      {(runs.data ?? []).filter((r) => r.id !== run?.id).length > 0 && (
        <div>
          <p className="mb-3 ansyra-label" style={{ color: "var(--fg-2)" }}>Past runs</p>
          <div className="space-y-3">
            {(runs.data ?? [])
              .filter((r) => r.id !== run?.id)
              .map((r) => (
                <PastRun key={r.id} run={r} />
              ))}
          </div>
        </div>
      )}
      <AiDisclaimer />
    </div>
  );
}

function PastRun({ run }: { run: Run }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left" data-testid={`past-run-${run.id}`}>
        <div>
          <p className="font-serif text-[15px]" style={{ color: "var(--fg)" }}>
            {run.input.industries.join(", ")} · {run.input.geography}
          </p>
          <p className="font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>
            {run.results.length} candidates · {new Date(run.createdAt).toLocaleString()}
          </p>
        </div>
        <span className="font-mono text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {run.results.map((c, i) => (
            <CandidateCard key={`${run.id}-${i}`} candidate={c} />
          ))}
        </div>
      )}
    </Card>
  );
}

function CandidateCard({ candidate: c }: { candidate: Candidate }) {
  const fx = useCurrency();
  const [adding, setAdding] = useState(false);
  return (
    <Card data-testid="candidate-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-serif text-xl leading-tight" style={{ color: "var(--fg)" }}>{c.name}</h3>
          <p className="mt-0.5 font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>
            {c.hq}
            {c.website && (
              <>
                {" · "}
                <a href={c.website} target="_blank" rel="noreferrer" className="underline underline-offset-2" style={{ color: "var(--fg)" }}>site</a>
              </>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-serif text-3xl leading-none" style={{ color: "var(--fg)" }}>{c.fitScore}</p>
          <p className="font-mono text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>/ 100 fit</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-3" style={{ borderColor: "var(--fg-rule)" }}>
        <Stat label="Revenue" value={fx.text(c.estRevenue)} />
        <Stat label="EBITDA" value={fx.text(c.estEbitda)} />
        <Stat label="People" value={c.employees ?? "—"} />
      </div>

      <p className="mt-3 font-sans text-[13px] leading-relaxed" style={{ color: "var(--fg-2)" }}>{c.description}</p>
      <p className="mt-2 font-sans text-[13px] leading-relaxed" style={{ color: "var(--fg-2)" }}><em>{c.whyFit}</em></p>

      {c.risks.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {c.risks.map((r, i) => (
            <li key={i} className="font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>⚠ {r}</li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-sm border px-2 py-0.5 ansyra-label" style={{ borderColor: "var(--fg-rule)", color: CONF_COLOR[c.confidence] ?? "var(--fg-2)" }}>
          {c.confidence} confidence
        </span>
        {c.sources.map((s, i) => (
          <a key={i} href={s.url} target="_blank" rel="noreferrer" className="max-w-[180px] truncate rounded-sm border px-2 py-0.5 font-sans text-[length:var(--step-xs)] underline-offset-2 hover:underline" style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)" }} title={s.title}>
            {s.title}
          </a>
        ))}
      </div>

      <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--fg-rule)" }}>
        <button onClick={() => setAdding(true)} data-testid="candidate-add" className="rounded-full px-4 py-1.5 font-sans text-[12px]" style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)" }}>
          + Add to Targets
        </button>
      </div>

      {adding && <AddToTargetsModal candidate={c} onClose={() => setAdding(false)} />}
    </Card>
  );
}

// Pre-fills the standard create-target form from a candidate; saving goes
// through the existing targets.create path (same scoping + activity log).
function AddToTargetsModal({ candidate, onClose }: { candidate: Candidate; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [name, setName] = useState(candidate.name.replace(/^\[mock\]\s*/, ""));
  const [sector, setSector] = useState<string>(INDUSTRY_OPTIONS[0]);
  const [fitScore, setFitScore] = useState(String(candidate.fitScore));
  const [description, setDescription] = useState(
    `${candidate.description}\n\nWhy it fits: ${candidate.whyFit}\n(AI-discovered — figures are estimates; verify before outreach.)`,
  );
  const [error, setError] = useState<string | null>(null);

  const create = trpc.targets.create.useMutation(withToast({ done: "Target added to your watchlist", failed: "Could not add that target" }, {
    onSuccess: () => {
      utils.targets.list.invalidate();
      utils.activity.list.invalidate();
      onClose();
    },
    onError: (e) => setError(e.message),
  }));

  return (
    <Modal title="Add to Targets" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Name"><TextInput required value={name} onChange={setName} /></Field>
        <Field label="Sector">
          <SelectInput value={sector} onChange={setSector} options={INDUSTRY_OPTIONS} />
        </Field>
        <Field label="Fit score (0–100)"><TextInput value={fitScore} onChange={setFitScore} /></Field>
        <Field label="Notes"><Textarea value={description} onChange={setDescription} rows={5} /></Field>
        {error && <p className="font-sans text-[13px]" style={{ color: "var(--sev-flag-text)" }}>{error}</p>}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-full border px-5 py-2 font-sans text-[13px]" style={{ borderColor: "var(--fg-rule)", color: "var(--fg)" }}>Cancel</button>
          <button
            onClick={() =>
              create.mutate({
                name,
                sector,
                revenue: candidate.estRevenue,
                ebitda: candidate.estEbitda || undefined,
                fitScore: Math.max(0, Math.min(100, parseInt(fitScore, 10) || 0)),
                description,
                status: "new",
              })
            }
            disabled={create.isPending || !name}
            data-testid="add-confirm"
            className="rounded-full px-5 py-2 font-sans text-[13px] disabled:opacity-50"
            style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)" }}
          >
            {create.isPending ? "Adding…" : "Add target"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>{label}</p>
      <p className="truncate font-sans text-sm" style={{ color: "var(--fg-2)" }} title={value}>{value}</p>
    </div>
  );
}
