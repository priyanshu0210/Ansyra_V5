import { useParams, Link, Navigate } from "react-router";
import { DocShell } from "@/components/ansyra/DocShell";
import { BarsChart, CauseBars, DonutChart, LineChart, SlopeChart } from "@/components/ansyra/charts";
import { RESEARCH, RESEARCH_REDIRECTS, TOOLS, type ChartSpec } from "@/lib/landing-content";

// ─────────────────────────────────────────────────────────────────────────────
// /research/:slug — one public study, summarized as a dossier exhibit with an
// animated visual of its core finding (2026-07 revamp).
// ─────────────────────────────────────────────────────────────────────────────

export function ChartFor({ spec }: { spec: ChartSpec }) {
  switch (spec.kind) {
    case "process":
      return <ol className="grid gap-4 sm:grid-cols-3">{spec.steps.map((step, i) => <li key={step} className="border-t pt-4 font-serif text-xl" style={{ borderColor: "var(--fg-rule)", color: "var(--fg)" }}><span className="mb-2 block font-sans text-xs" style={{ color: "var(--fg-2)" }}>{i + 1}</span>{step}</li>)}</ol>;
    case "donut":
      return <DonutChart value={spec.value} caption={spec.caption} />;
    case "bars":
      return <BarsChart data={spec.data} unit={spec.unit} />;
    case "cause":
      return <CauseBars data={spec.data} />;
    case "line":
      return <LineChart points={spec.points} labels={spec.labels} unit={spec.unit} />;
    case "slope":
      return <SlopeChart pairs={spec.pairs} leftLabel={spec.leftLabel} rightLabel={spec.rightLabel} />;
  }
}

export default function ResearchArticle() {
  const { slug } = useParams();
  if (slug && RESEARCH_REDIRECTS[slug]) return <Navigate to={`/research/${RESEARCH_REDIRECTS[slug]}`} replace />;
  const entry = RESEARCH.find((r) => r.slug === slug);
  if (!entry) return <Navigate to="/" replace />;
  const related = TOOLS.filter((t) => t.relatedResearch.includes(entry.slug)).slice(0, 2);
  const idx = RESEARCH.findIndex((r) => r.slug === entry.slug);
  const next = RESEARCH[(idx + 1) % RESEARCH.length];

  return (
    <DocShell>
      <article className="act-stagger mx-auto w-full max-w-3xl px-6 pb-10 pt-10 md:pt-16">
        <div className="flex flex-col items-center text-center">
          <p className="font-sans text-[13px] font-medium" style={{ color: "var(--fg)" }}>
            {entry.source} · {entry.published}
          </p>
          <h1
            className="mt-6 font-serif font-light leading-[1.08]"
            style={{ color: "var(--fg)", fontSize: "clamp(30px, 4.6vw, 52px)", maxWidth: "22ch" }}
          >
            {entry.title}
          </h1>
          <p className="mt-5 font-serif" style={{ color: "var(--fg)", fontSize: "clamp(20px, 2.6vw, 28px)" }}>
            {entry.headline} <span style={{ color: "var(--fg-2)", fontStyle: "normal", fontSize: "0.65em" }}>{entry.headlineLabel}</span>
          </p>
        </div>

        <p className="mt-8 font-sans text-sm leading-relaxed" style={{ color: "var(--fg-2)" }}>{entry.evidenceType}. {entry.scope} Source checked {entry.verified}.</p>
        {/* The visual — the study's core finding, drawn on */}
        <figure
          className="ansyra-alive mt-12 rounded-sm border p-6 sm:p-8"
          style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", boxShadow: "0 2px 24px rgba(46,43,35,0.06)" }}
        >
          <p className="mb-5 font-sans text-[length:var(--step-xs)] font-medium uppercase tracking-[0.12em]" style={{ color: "var(--fg-2)" }}>
            Visual summary
          </p>
          <ChartFor spec={entry.chart} />
          <figcaption className="mt-4 font-sans text-[12.5px] leading-relaxed" style={{ color: "var(--fg-2)" }}>
            {entry.chartCaption}
          </figcaption>
        </figure>

        {/* Summary prose */}
        <div className="mt-12 space-y-5">
          <p className="font-sans text-[length:var(--step-xs)] font-medium uppercase tracking-[0.12em]" style={{ color: "var(--fg-2)" }}>
            The brief
          </p>
          {entry.summary.map((p) => (
            <p key={p.slice(0, 24)} className="font-sans text-[15.5px] leading-[1.85]" style={{ color: "var(--fg-2)" }}>
              {p}
            </p>
          ))}
        </div>

        {/* Key findings strip */}
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {entry.findings.map((f) => (
            <div
              key={f.stat}
              className="ansyra-alive rounded-sm border p-5"
              style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)" }}
            >
              <p className="font-serif text-3xl" style={{ color: "var(--fg)" }}>{f.stat}</p>
              <p className="mt-2 font-sans text-[12.5px] leading-relaxed" style={{ color: "var(--fg-2)" }}>{f.label}</p>
            </div>
          ))}
        </div>

        {/* Takeaway.
            A 1px left rule, not the 2px one this shipped with. A coloured left
            border above a hairline is the callout tell the craft floor names,
            and it was the only place on the site doing it — `sections.tsx`
            already sets its supporting sentence with `border-l pl-5` at 1px.
            One idiom for "an aside attached to the claim above it", used twice,
            rather than two weights of the same device. */}
        <div
          className="mt-12 rounded-sm border-l py-2 pl-6"
          style={{ borderColor: "var(--fg)" }}
        >
          <p className="font-sans text-[length:var(--step-xs)] font-medium uppercase tracking-[0.12em]" style={{ color: "var(--fg-2)" }}>
            Our product interpretation · no publisher endorsement
          </p>
          <p className="mt-3 font-serif text-[19px] leading-relaxed" style={{ color: "var(--fg)" }}>
            {entry.takeaway}
          </p>
        </div>

        {/* Related instruments + next exhibit */}
        {related.length > 0 && (
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {related.map((t) => (
              <Link
                key={t.slug}
                to={`/platform/${t.slug}`}
                className="ansyra-alive block rounded-sm border p-5"
                style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)" }}
              >
                <p className="font-sans text-[length:var(--step-xs)]" style={{ color: "var(--fg)" }}>
                  Related instrument
                </p>
                <p className="mt-2 font-serif text-lg" style={{ color: "var(--fg)" }}>{t.name}</p>
                <p className="mt-1 font-sans text-[12.5px]" style={{ color: "var(--fg-2)" }}>{t.tagline}</p>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t pt-6" style={{ borderColor: "var(--fg-rule)" }}>
          <div>
            <p className="font-sans text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>
              Source · {entry.source}, {entry.year} · summarized by Ansyra
            </p>
            <a href={entry.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block font-sans text-[12.5px] underline underline-offset-4" style={{ color: "var(--fg)" }}>
              Read the original source ↗
            </a>
          </div>
          <Link
            to={`/research/${next.slug}`}
            className="rounded-full border px-5 py-2.5 font-sans text-[12.5px]"
            style={{ borderColor: "var(--fg-rule)", color: "var(--fg)", background: "var(--fg-surface)" }}
          >
            Next: {next.source} →
          </Link>
        </div>
      </article>
    </DocShell>
  );
}
