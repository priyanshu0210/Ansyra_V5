import { Reveal, ResolveType, SectionHeading } from "./Reveal";
import { stagger } from "./reveal-stagger";
import { Ledger } from "./Ledger";
import { Pipeline } from "./Pipeline";
import { InstrumentPages } from "./InstrumentPages";
import { EvidenceLens } from "./EvidenceLens";
import { ClarityExhibit } from "./ClarityExhibit";

// ─────────────────────────────────────────────────────────────────────────────
// The Living Deal Record — body sections.
//
// Every component here is a document part, not generic UI: exhibits instead of
// cards, ruled registers instead of icon grids, a stamp block instead of a
// floating pill. See DESIGN.md.
//
// There is deliberately NO decorative imagery. The previous iteration hung five
// glass-puzzle renders here; a deal record is type, rules, and registers, so
// these sections are complete without photography. Real product surfaces get
// added later AS EXHIBITS, which makes them an enhancement rather than a
// dependency the design cannot stand without.
//
// Section rhythm is deliberately uneven, and two sections sit on the ledger
// band: pacing comes from varying density and ground, not from repeating one
// padding value seven times.
// ─────────────────────────────────────────────────────────────────────────────

const SHELL = "mx-auto w-full max-w-7xl px-6";

/** A plain rule. The section's own headline names it; a tracked uppercase
 *  eyebrow over every section is grammar nobody chose, and numbering sections
 *  that carry no sequence is decoration. Both are gone. */
function SectionRule() {
  return (
    <Reveal>
      <div className="border-t" style={{ borderColor: "var(--fg)" }} />
    </Reveal>
  );
}

// ── I. The problem ───────────────────────────────────────────────────────────
// A1. This section used to run TWO number lists back to back: a four-figure
// rail beside the heading, then six study cards each leading with its own
// figure. Rendered, that was the page's worst rhythm problem, and two of the
// figures ($4.6T, ~30%) appeared verbatim in both.
//
// The rail is gone rather than de-duplicated, because the duplication was a
// symptom. Its four figures were doing two unrelated jobs: two argued that AI
// is now standard in deal work (which is the AI section's case, not this one,
// and they have moved there) and two restated studies the reader can open a
// row below. Removing it also removes the 7/5 split that existed only to host
// it, so the heading runs full measure and the dead right column goes with it.
//
// What remains is ONE device: a ruled index of the evidence. An index reads as
// authoritative where a card grid reads as a catalogue, it is not another grid
// of same-weight blocks, and it is the structure B6's lens resolves one row at
// a time.
export function ProblemSection() {
  return (
    <section id="problem" data-testid="section-problem" className={`${SHELL} pb-24 pt-20 md:pb-32 md:pt-24`}>
      <SectionRule />

      <div className="mt-10">
        <SectionHeading
          title="The gap between the deal and the delivery."
          lede="An acquisition starts with a promise: growth, savings, or a stronger business. When evidence, assumptions, and decisions sit in separate files, it is hard to explain why the deal was approved or check whether it delivered. Ansyra keeps those records together; your team supplies and reviews the evidence."
        />
      </div>

      <ClarityExhibit />
      <EvidenceLens />
    </section>
  );
}

// ── II. The platform ─────────────────────────────────────────────────────────
// B7. The four collapsible accordion rows are gone. They were the weakest
// interaction on the page: a disclosure widget doing the job of a product tour,
// and one of the "grid of same-weight text blocks" sections the rework set out
// to break up.
//
// One page per movement, scrolled through vertically. The flat list that used
// to sit under a pinned stack is gone: it was the same eleven instruments told
// a second time, and under reduced motion it rendered them all TWICE. The pages
// carry every link themselves — see InstrumentPages.tsx.
export function PlatformSection() {
  return (
    <section id="platform" data-testid="section-platform" className="w-full py-20 md:py-28">
      {/* `platform-all` is kept as an anchor target: it was linked from the old
          terminal card and may exist in the wild. */}
      <div id="platform-all" className="scroll-mt-24">
        <Reveal>
          <SectionHeading
            title="One decision record, end to end."
            /* Comma, not the em dash the brief set: constitution §9 bans
               em-dashes in rendered copy outside long-form /research prose. */
            lede="Eleven connected tools for finding acquisitions, reviewing evidence, recording decisions, and tracking results after closing. Open a tool to see its inputs, outputs, and limits."
          />
        </Reveal>
      </div>

      <div className="mt-14">
        <InstrumentPages />
      </div>

      {/* The cross-cutting capabilities. They belong to no single instrument,
          so they get a line rather than a row of their own. */}
      <div className={SHELL}>
        <Reveal variant="lift" delay={0.2}>
          <p
            className="mt-8 border-t pt-5 font-sans"
            style={{ borderColor: "var(--fg)", color: "var(--fg-2)", fontSize: "var(--step-xs)", lineHeight: 1.6, maxWidth: "62ch" }}
          >
            Across the workspace: an activity history, a printable deal record, and feature access managed by an administrator. The copilot adapts to the page and recent conversation. It does not automatically read your deal records, search the web, or make decisions for you.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

// ── III. The method ──────────────────────────────────────────────────────────
// The four stages moved to landing/Pipeline.tsx (B3), together with the sample
// artifacts each one produces. They were four identical text columns here,
// which said "four parallel features" when the truth is "one pipeline, and
// each stage feeds the next".

// A1. These two moved here from the Problem section's rail. They were sitting
// next to six studies about why deals fail, arguing something else entirely:
// that AI is now standard equipment in deal work. That is this section's case,
// so this is where they belong. They also give the heading row a right column,
// which is half of why the old layout read as unfinished.
const ADOPTION = [
  { n: "Evidence", label: "Check the source behind a claim", src: "Ansyra workflow" },
  { n: "Review", label: "Record the human decision", src: "Ansyra workflow" },
];

export function AISection() {
  return (
    <section id="ai" data-testid="section-ai" className="w-full py-24 md:py-32">
      <div className={SHELL}>
        <SectionRule />

        <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-7">
            <SectionHeading
              title="An AI second opinion that goes on the record."
              /* Same em-dash rule as the platform lede above. */
              lede="AI researches candidate companies, challenges assumptions, reads uploaded text, and drafts analyses. Each tool uses a specific set of inputs. Your team checks the output, adds evidence, and decides what happens next."
            />
          </div>
          <dl className="lg:col-span-5 lg:pt-2">
            {ADOPTION.map((f, i) => (
              <Reveal key={f.n} variant="lift" delay={0.1 + stagger(i)}>
                <div className="border-t py-5" style={{ borderColor: "var(--fg-rule)" }}>
                  <dd
                    className="font-display tabular-nums"
                    style={{ color: "var(--fg)", fontSize: "var(--step-title)", lineHeight: 1 }}
                  >
                    {f.n}
                  </dd>
                  <dt
                    className="mt-2 font-sans"
                    style={{ color: "var(--fg-2)", fontSize: "var(--step-sm)", lineHeight: 1.5, maxWidth: "30ch" }}
                  >
                    {f.label}
                    <span className="mt-1 block" style={{ fontSize: "var(--step-xs)" }}>
                      {f.src}
                    </span>
                  </dt>
                </div>
              </Reveal>
            ))}
          </dl>
        </div>

        <div className="mt-14 md:mt-16">
          <p className="mb-6 font-sans text-sm" style={{ color: "var(--fg-2)", maxWidth: "72ch", lineHeight: 1.6 }}>Scope → Ground → Analyse → Verdict is a guide to reviewing an assumption, illustrated below. It is not an automatic pipeline shared by every feature. Target Discovery uses web research; document analysis reads one file; Deal Genome uses a limited record extract. Financial calculations use formulas, and approval remains a human decision.</p>
          <Pipeline />
        </div>

      </div>

      {/* B2. The product doing its actual job, at the page's widest.
          Full-bleed and OUTSIDE the shell: it used to sit inside this
          section's column at card scale, which is what buried the most
          convincing thing on the site. Still inside <section id="ai"> because
          the arc keeps this stretch on one continuous dark ground, and the
          pipeline (B3) will wire straight into these rows. */}
      <div className="mt-16 md:mt-20">
      <Ledger />
      </div>

      {/* A3. This was a 58ch paragraph behind a hairline, sitting in the left
          half of a full-width section with nothing to its right. It is the one
          claim on the page a competitor cannot make, so it now gets the whole
          measure at display size, breaking the shell. The supporting sentence
          carries the detail the pull-quote drops.

          The only place on this page where a sentence is the entire viewport. */}
      <div className="mt-20 w-full border-y py-16 md:mt-28 md:py-24" style={{ borderColor: "var(--fg-rule)" }}>
        <div className={SHELL}>
          <ResolveType>
            <p
              className="text-balance font-display font-light"
              style={{
                color: "var(--fg)",
                fontSize: "var(--step-title)",
                lineHeight: 1.12,
                letterSpacing: "-0.018em",
                maxWidth: "26ch",
              }}
            >
              Use your recorded deals to frame the next question. Review the evidence before relying on the answer.
            </p>
          </ResolveType>
          <Reveal variant="lift" delay={0.12}>
            <p
              className="mt-8 border-l pl-5 font-sans"
              style={{
                borderColor: "var(--sev-grounded)",
                color: "var(--fg-2)",
                fontSize: "var(--step-sm)",
                lineHeight: 1.65,
                maxWidth: "52ch",
              }}
            >
              Successful structured analyses are saved to their relevant records; people and regulatory reviews can be linked to a deal. Deal Genome search answers are not saved as analyses. Copilot conversations have their own history. A saved result or valid format does not prove factual accuracy.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ── V. The closing ───────────────────────────────────────────────────────────
// Moved to landing/Closing.tsx (B9). It was a 7/5 grid whose right column held
// a retired caption and whose lower half held nothing; it is now the page's
// light path arriving.
