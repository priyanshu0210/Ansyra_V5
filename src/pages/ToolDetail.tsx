import { FEATURE_GUIDES } from "@/lib/feature-guides";
import { FEATURE_LABELS } from "@contracts/constants";
import { useParams, Link, Navigate } from "react-router";
import { useState } from "react";
import { DocShell } from "@/components/ansyra/DocShell";
import { CATEGORIES, RESEARCH, TOOLS, supportingFor } from "@/lib/landing-content";
import { ChartFor } from "./ResearchArticle";
import { RequestAccessModalLazy } from "@/components/ansyra/modals/RequestAccessModalLazy";
import { Icon } from "@/components/ansyra/Icon";

// ─────────────────────────────────────────────────────────────────────────────
// /platform/:slug — one instrument, told as a working dossier: what it is, how
// it runs, what lands on your desk, and a day-in-the-life scenario.
//
// Rebuilt in the landing's document system. This page previously ran the
// retired language (font-serif, --gold, rounded-full pills, stock rounded
// cards) while the landing that links here was rebuilt around exhibits, ruled
// registers, and ink-on-paper — so the page a visitor arrived at contradicted
// the one that sent them. DESIGN.md:77 is explicit that a stock rounded card in
// this world is a lapse.
//
// Left-aligned throughout. The old build centred the header, which reads as a
// marketing page; a dossier is a document, and documents start at the margin.
// ─────────────────────────────────────────────────────────────────────────────

const SHELL = "mx-auto w-full max-w-5xl px-6";

export default function ToolDetail() {
  const { slug } = useParams();
  const [showAccess, setShowAccess] = useState(false);
  const tool = TOOLS.find((t) => t.slug === slug);
  if (!tool) return <Navigate to="/" replace />;

  const related = RESEARCH.filter((r) => tool.relatedResearch.includes(r.slug));
  const category = CATEGORIES.find((c) => c.id === tool.category);
  // "Next" walks the register in order rather than wrapping the whole array
  // blindly, so the sequence a reader follows matches the one the landing shows.
  const idx = TOOLS.findIndex((t) => t.slug === tool.slug);
  const next = TOOLS[(idx + 1) % TOOLS.length];

  return (
    <DocShell ground="dark">
      <article className={`${SHELL} pb-16 pt-8 md:pt-14`}>
        {/* Title block. Same grammar as the landing's first sheet. */}
        <header className="border-t pt-3" style={{ borderColor: "var(--fg)" }}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <span className="ansyra-index">{category ? category.label : "Instrument"}</span>
            <span className="ansyra-index tabular-nums">{tool.n}</span>
          </div>

          <h1
            className="mt-8 text-balance font-display font-normal"
            style={{
              color: "var(--fg)",
              fontSize: "var(--step-title)",
              lineHeight: 1.04,
              letterSpacing: "-0.025em",
              maxWidth: "18ch",
            }}
          >
            {tool.name}
          </h1>

          <p
            className="mt-5 text-pretty font-sans"
            style={{ color: "var(--fg-2)", fontSize: "var(--step-body)", lineHeight: 1.6, maxWidth: "46ch" }}
          >
            {tool.tagline}
          </p>
        </header>

        <section className="mt-10 space-y-6" aria-label="How this works in the dashboard">
          {[tool.featureKey, ...supportingFor(tool.featureKey)].map(key => {
            const guide = FEATURE_GUIDES[key];
            return <div key={key} className="border-t pt-5" style={{ borderColor: "var(--fg-rule)" }}>
              <h2 className="font-display text-xl" style={{ color: "var(--fg)" }}>{FEATURE_LABELS[key]}</h2>
              <p className="mt-2 font-sans text-sm" style={{ color: "var(--fg-2)" }}>M&amp;A stage: {guide.stage}</p>
              <p className="mt-1 font-sans text-sm" style={{ color: "var(--fg-2)" }}>{guide.where}</p>
              <dl className="mt-4 grid gap-4 font-sans text-sm sm:grid-cols-2" style={{ color: "var(--fg-2)", lineHeight: 1.65 }}>
                {[["What you provide", guide.input], ["What you receive", guide.output], ["How AI helps", guide.ai], ["What to check", guide.limit]].map(([label, value]) => <div key={label}><dt className="font-medium" style={{ color: "var(--fg)" }}>{label}</dt><dd className="mt-1">{value}</dd></div>)}
              </dl>
            </div>;
          })}
        </section>

        {/* The instrument, with its panel figure in the margin. */}
        <div className="mt-14 grid grid-cols-1 gap-10 border-t pt-8 lg:grid-cols-12 lg:gap-14" style={{ borderColor: "var(--fg-rule)" }}>
          <div className="lg:col-span-7">
            {tool.description.map((p) => (
              <p
                key={p.slice(0, 24)}
                className="mb-5 text-pretty font-sans last:mb-0"
                style={{ color: "var(--fg-2)", fontSize: "var(--step-sm)", lineHeight: 1.75, maxWidth: "62ch" }}
              >
                {p}
              </p>
            ))}
          </div>

          {/* A tipped-in figure, not a floating card: flat panel, heavy top
              rule, no shadow. A shadowed card on this ground reads as a lapse. */}
          <figure
            className="lg:col-span-5"
            style={{ background: "var(--fg-surface)", borderTop: "2px solid var(--fg)" }}
          >
            <div className="px-5 py-5">
              <ChartFor spec={tool.chart} />
              <p
                className="mt-4 font-sans"
                style={{ color: "var(--fg-2)", fontSize: "var(--step-xs)", lineHeight: 1.55 }}
              >
                {tool.chartCaption}
              </p>
            </div>
          </figure>
        </div>

        {/* The steps, numbered. The numerals carry the sequence; the word "Procedure" over them was the dossier costume. */}
        <section className="mt-16">
          <div className="border-t" style={{ borderColor: "var(--fg)" }} />
          <ol className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {tool.how.map((h, i) => (
              <li key={h.step} className="ansyra-exhibit h-full px-5 py-5">
                <span className="ansyra-index tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <h2
                  className="mt-3 font-display"
                  style={{ color: "var(--fg)", fontSize: "var(--step-md)", lineHeight: 1.2 }}
                >
                  {h.step}
                </h2>
                <p
                  className="mt-2 font-sans"
                  style={{ color: "var(--fg-2)", fontSize: "var(--step-xs)", lineHeight: 1.6 }}
                >
                  {h.detail}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* Illustrative scenarios are examples, not customer outcomes. */}
        <section className="mt-16 grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-7">
            <div className="border-t" style={{ borderColor: "var(--fg)" }} />
            <h2
              className="mt-5 text-balance font-display"
              style={{ color: "var(--fg)", fontSize: "var(--step-lead)", lineHeight: 1.15, maxWidth: "24ch" }}
            >
              {tool.scenario.title}
            </h2>
            <p
              className="mt-4 text-pretty font-sans"
              style={{ color: "var(--fg-2)", fontSize: "var(--step-sm)", lineHeight: 1.75, maxWidth: "58ch" }}
            >
              Illustrative example: {tool.scenario.body.replace(/^Illustrative example: /, "")}
            </p>
          </div>

          <div className="lg:col-span-5">
            <div className="border-t pt-3" style={{ borderColor: "var(--fg)" }}>
              <span className="ansyra-index">What lands on your desk</span>
            </div>
            <ul className="mt-4">
              {tool.outputs.map((o) => (
                <li
                  key={o}
                  className="border-b py-3 font-sans"
                  style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)", fontSize: "var(--step-xs)", lineHeight: 1.6 }}
                >
                  {o}
                </li>
              ))}
            </ul>
            <button
              onClick={() => setShowAccess(true)}
              data-testid="tool-request-access"
              className="ansyra-cta mt-8 px-7 py-3.5"
              style={{ fontSize: "var(--step-sm)", minHeight: 48 }}
            >
              Request Access
              <Icon name="arrow" size={16} />
            </button>
          </div>
        </section>

        {/* Grounding research, when a study genuinely applies. Several
            instruments have none, and stretching one to fill the slot is how a
            page starts citing research that does not support it. */}
        {related.length > 0 && (
          <section className="mt-16">
            <div className="border-t pt-3" style={{ borderColor: "var(--fg)" }}>
              <span className="ansyra-index">The research behind it</span>
            </div>
            <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((r, i) => (
                <li key={r.slug} className="h-full">
                  <Link to={`/research/${r.slug}`} className="ansyra-exhibit flex h-full flex-col px-5 py-5">
                    {/* Was the exhibit LETTER (A-F). That field is gone with the
                        dossier vocabulary; a position in this list is the only
                        thing a number here can honestly mean. */}
                    <span className="ansyra-index tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                    <p
                      className="mt-3 font-display"
                      style={{ color: "var(--fg)", fontSize: "var(--step-lead)", lineHeight: 1.1 }}
                    >
                      {r.headline}
                    </p>
                    <p
                      className="mt-2 text-pretty font-sans"
                      style={{ color: "var(--fg-2)", fontSize: "var(--step-xs)", lineHeight: 1.5 }}
                    >
                      {r.headlineLabel}
                    </p>
                    <div className="mt-auto flex items-end justify-between gap-3 pt-5">
                      <span className="font-sans" style={{ color: "var(--fg-2)", fontSize: "var(--step-xs)" }}>
                        {r.source}, {r.year}
                      </span>
                      <span className="font-sans" style={{ color: "var(--fg)", fontSize: "var(--step-xs)" }}>
                        Read →
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <nav
          className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t pt-6"
          style={{ borderColor: "var(--fg)" }}
        >
          <Link to="/#platform" className="ansyra-navlink font-sans" style={{ fontSize: "var(--step-xs)" }}>
            ← All instruments
          </Link>
          <Link
            to={`/platform/${next.slug}`}
            className="ansyra-cta ansyra-cta--ghost px-5 py-2.5 font-sans"
            style={{ fontSize: "var(--step-xs)", minHeight: 44 }}
          >
            Next: {next.name.replace("™", "")}
            <Icon name="arrow" size={16} />
          </Link>
        </nav>
      </article>
      <RequestAccessModalLazy open={showAccess} onClose={() => setShowAccess(false)} />
    </DocShell>
  );
}
