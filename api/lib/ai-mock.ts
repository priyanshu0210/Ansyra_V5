// ─────────────────────────────────────────────────────────────────────────────
// Mock AI provider — zero-cost development mode.
// ─────────────────────────────────────────────────────────────────────────────
// Detects which Ansyra feature is calling (from the system prompt) and returns
// realistic, correctly-shaped canned JSON after a short delay. Lets every
// screen be built and tested without an API key or quota. Clearly labelled
// output ("[mock]") so nobody mistakes it for real analysis.
// ─────────────────────────────────────────────────────────────────────────────

const DELAY_MS = 600;

export async function mockAIResponse(
  prompt: string,
  system: string | undefined,
  json: boolean,
): Promise<string> {
  await new Promise((r) => setTimeout(r, DELAY_MS));
  const s = system ?? "";

  if (!json) {
    return (
      "[mock] AI is running in mock mode (no API key configured). " +
      "This is a placeholder response so you can test the interface. " +
      "Set AI_PROVIDER and the matching API key in .env for real analysis."
    );
  }

  if (s.includes("Assumption Ledger")) {
    return JSON.stringify({
      optimismScore: 72,
      confidence: "Medium",
      reasoning:
        "[mock] Comparable mid-market transactions suggest this assumption sits above the median outcome; two of three precedents undershot the projected figure within 18 months.",
      recommendation:
        "[mock] Commission a bottom-up validation of the underlying driver before advancing the deal.",
      comparables: [
        "[mock] Alpha Corp / Beta Ltd (2023)",
        "[mock] Gamma Holdings / Delta Inc (2022)",
      ],
      // Echoed from the prompt's own vocabulary (Phase 15.15) so a mock run
      // exercises the category path end to end. "margin" rather than "other":
      // an always-other mock would let a broken coercion pass unnoticed.
      category: "margin",
    });
  }

  if (s.includes("diligence questions")) return JSON.stringify({ summary: "[mock] Example diligence questions; no factual assessment performed.", questions: ["[mock] Which source supports the proposed transaction rationale?", "[mock] Who will verify the missing information?"], missingEvidence: ["[mock] Supporting documents and specialist review"] });

  if (s.includes("Cultural Compatibility")) {
    return JSON.stringify({
      overallScore: 68,
      leadershipCompatibility: 74,
      decisionSpeedDelta: { acquirer: "Moderate", target: "Fast" },
      retentionRisk: "Medium",
      communicationStyleDelta:
        "[mock] The acquirer favours structured, top-down comms while the target operates on informal, rapid iteration.",
      keyRisks: [
        "[mock] Founder-led target may resist layered approval chains",
        "[mock] Compensation philosophy mismatch in engineering",
        "[mock] Post-close reporting cadence likely to frustrate target leadership",
      ],
      summary:
        "[mock] Workable cultural fit with targeted integration effort. Retention packages for the target's senior team should be agreed pre-close.",
    });
  }

  if (s.includes("Regulatory Radar")) {
    return JSON.stringify({
      challengeProbability: 24,
      likelyReviewTimeline: "4-6 months",
      jurisdictions: ["[mock] CMA (UK)", "[mock] European Commission"],
      precedentCases: [
        {
          name: "[mock] Example Co / Sample Corp",
          outcome: "Cleared",
          note: "[mock] Cleared at Phase 1 with behavioural commitments.",
        },
      ],
      recommendedMitigations: [
        "[mock] Pre-notification engagement with the CMA",
        "[mock] Prepare a clean-team protocol for commercially sensitive data",
        "[mock] Scope a divestment fallback for the overlapping business line",
      ],
      summary:
        "[mock] Low-to-moderate antitrust exposure. Early engagement should keep review within Phase 1.",
    });
  }

  if (s.includes("Synergy Reality Engine")) {
    return JSON.stringify({
      analyses: [
        {
          category: "Revenue",
          variancePct: -33,
          verdict: "Behind",
          explanation:
            "[mock] Cross-sell attach rates are trailing plan; the joint pipeline was built later than scheduled.",
          action:
            "[mock] Stand up a joint account-mapping sprint for the top 20 shared prospects.",
        },
        {
          category: "Cost",
          variancePct: 22,
          verdict: "Ahead",
          explanation:
            "[mock] Vendor consolidation landed a quarter early, pulling savings forward.",
          action: "[mock] Bank the overage; do not re-baseline until Q3.",
        },
      ],
      portfolioSummary:
        "[mock] Net synergy capture is broadly on plan — cost is ahead, revenue behind. Focus effort on the joint pipeline.",
    });
  }

  if (s.includes("Document Intelligence")) {
    if (s.includes("(red_flags)")) {
      const text = prompt.split("--- DOCUMENT TEXT START ---\n")[1]?.split("\n--- DOCUMENT TEXT END ---")[0]?.trim() ?? "";
      return JSON.stringify({
        flags: text ? [{
          clause: "[mock] Example review point",
          quote: text.slice(0, 160),
          severity: "Low",
          concern: "[mock] Demonstration only: this excerpt has not been assessed for legal risk.",
        }] : [],
      });
    }
    if (s.includes("(key_terms)")) {
      return JSON.stringify({
        parties: ["[mock] Alpha Corp — Buyer", "[mock] Beta Ltd — Seller"],
        effectiveDate: null,
        consideration: "[mock] $10M cash at close",
        conditions: ["[mock] Regulatory approval", "[mock] No material adverse change"],
        indemnities: "[mock] Standard 18-month survival, 10% cap",
        changeOfControl: null,
        nonCompete: "[mock] 3 years, national scope",
      });
    }
    if (s.includes("(dd_checklist)")) {
      return JSON.stringify({
        items: [
          { item: "Corporate structure & cap table", status: "present", note: "[mock] Described in section 1." },
          { item: "Material contracts", status: "unclear", note: "[mock] Referenced but not attached." },
          { item: "Financial statements (3 years)", status: "missing", note: "[mock] Not covered in this document." },
          { item: "Tax filings & liabilities", status: "missing", note: "[mock] Not covered." },
          { item: "IP ownership & licenses", status: "missing", note: "[mock] Not covered." },
          { item: "Employment agreements & benefits", status: "missing", note: "[mock] Not covered." },
          { item: "Litigation & disputes history", status: "missing", note: "[mock] Not covered." },
          { item: "Regulatory & compliance filings", status: "missing", note: "[mock] Not covered." },
          { item: "Real property & leases", status: "missing", note: "[mock] Not covered." },
          { item: "Insurance policies", status: "missing", note: "[mock] Not covered." },
          { item: "Environmental liabilities", status: "missing", note: "[mock] Not covered." },
          { item: "Change-of-control / consent requirements", status: "unclear", note: "[mock] Consent clause present but scope ambiguous." },
        ],
      });
    }
    // summary (default)
    return JSON.stringify({
      headline: "[mock] Placeholder document summary — configure a real AI provider.",
      keyPoints: ["[mock] Key point one", "[mock] Key point two", "[mock] Key point three"],
      summary: "[mock] This is a canned summary produced by mock mode. It exists so the Data Room interface can be exercised end-to-end without an AI key. Configure AI_PROVIDER for real analysis.",
    });
  }

  if (s.includes("Target Discovery")) {
    const mk = (i: number, name: string, hq: string, rev: string, fit: number) => ({
      name: `[mock] ${name}`,
      hq,
      website: `https://example${i}.com`,
      estRevenue: rev,
      estEbitda: "est. $4–7M",
      employees: "est. 120–200",
      description: `[mock] Placeholder candidate ${i} — configure a real AI provider for live web-grounded research.`,
      whyFit: "[mock] Matches the stated industry and size criteria.",
      fitScore: fit,
      fitRationale: "[mock] Canned rationale for interface testing.",
      risks: ["[mock] Placeholder risk A", "[mock] Placeholder risk B"],
      confidence: "Low",
      sources: [{ title: `[mock] Example source ${i}`, url: `https://example${i}.com/about` }],
    });
    return JSON.stringify({
      candidates: [
        mk(1, "Northway Logistics", "Mumbai, IN", "est. $28M", 86),
        mk(2, "Cargon Systems", "Pune, IN", "est. $41M", 81),
        mk(3, "FreightLine Co", "Delhi, IN", "est. $19M", 77),
        mk(4, "Portside Group", "Chennai, IN", "est. $33M", 72),
        mk(5, "TransArc Holdings", "Bengaluru, IN", "est. $24M", 69),
      ],
    });
  }

  if (s.includes("Recommendation Engine")) {
    // The only branch that reads the prompt, and it has to: the router filters
    // cited evidence against the ids it actually offered, so a mock citing a
    // hard-coded id=1 would be stripped and the draft discarded as unsourceable.
    // Echoing back a real offered id exercises the citation path instead of
    // being silently deleted by it. No offers on the deal → cite nothing, and
    // the router's "run some analyses first" message is what you should see.
    // Anchored to the line immediately after the block header, so an EMPTY
    // block ("(none on file)") cannot borrow the next block's id and pair it
    // with the wrong kind.
    const offered = [...prompt.matchAll(/\{"kind":"(\w+)","id":<id>\}:\n {2}- \[id=(\d+)\]/g)]
      .map((m) => ({ kind: m[1], id: Number(m[2]) }));
    const cite = offered.slice(0, 2).map((o) => ({
      kind: o.kind,
      id: o.id,
      label: "[mock] cited source",
    }));

    // Phase 15.10 — echo back a supplied failure pattern, for the same reason
    // the citation above is echoed: a canned counterargument proves nothing
    // about whether the pattern block actually reached the model. Anchored to
    // the block header, so an empty block ("(none on file)") yields nothing
    // rather than borrowing a neighbouring line.
    const patternLines = [
      ...prompt.matchAll(/have gone wrong before[^\n]*:\n((?: {2}- [^\n]*\n?)+)/g),
    ].flatMap((m) =>
      m[1]
        .split("\n")
        .map((l) => l.replace(/^ {2}- /, "").trim())
        .filter(Boolean),
    );
    const patternCounter = patternLines.length
      ? [
          {
            point: `[mock] The firm's own ledger says otherwise: ${patternLines[0]}`,
            weight: "material" as const,
          },
        ]
      : [];

    // Phase 15.16 — same echo, one layer down: the ASSUMPTION block. Anchored to
    // its own header ("have failed before"), which cannot collide with the
    // pattern header ("have gone wrong before"), so an empty block on either
    // side yields nothing rather than borrowing the other's lines.
    const assumptionLines = [
      ...prompt.matchAll(/have failed before[^\n]*:\n((?: {2}- [^\n]*\n?)+)/g),
    ].flatMap((m) =>
      m[1]
        .split("\n")
        .map((l) => l.replace(/^ {2}- /, "").trim())
        .filter(Boolean),
    );
    const assumptionCounter = assumptionLines.length
      ? [
          {
            point: `[mock] The assumption underneath this has a record: ${assumptionLines[0]}`,
            weight: "material" as const,
          },
        ]
      : [];

    return JSON.stringify({
      recommendations: [
        {
          claim:
            "[mock] Proceed to confirmatory diligence, conditional on a bottom-up rebuild of the retention assumption.",
          rationale:
            "[mock] The stress-tested assumptions clear on everything except retention, and the synergy phasing is credible on its own timetable. Retention is the single unhedged input, and it carries the whole case.",
          supportingEvidence: cite,
          counterarguments: [
            ...patternCounter,
            ...assumptionCounter,
            {
              point: "[mock] The regulatory read assumes a Phase 1 clearance with no remedy.",
              weight: "material",
              response: "[mock] A four-month delay is priced into the timeline and the LOI carries a long-stop.",
            },
            {
              point: "[mock] No independent quality-of-earnings has been run.",
              weight: "fatal",
            },
          ],
          // Priced down when the firm's history argues against the claim, so the
          // "lower its confidence" instruction is visibly exercised in mock
          // mode. Two independent histories, so two independent deductions —
          // a claim that is both a known-bad shape AND rests on a known-bad
          // assumption category should not price the same as one that is only
          // the former.
          confidence: 64 - (patternLines.length ? 12 : 0) - (assumptionLines.length ? 10 : 0),
        },
      ],
    });
  }

  // IC memo (Phase 15.1). Token from ai-router's system prompt: "You are
  // Ansyra's Investment Committee memo generator". Capitalised, so the lowercase
  // "an investment committee" in the scenario prompt below cannot match it.
  if (s.includes("Investment Committee memo generator")) {
    return JSON.stringify({
      thesis:
        "[mock] A defensible mid-market platform at a fair entry multiple, provided the retention assumption survives a bottom-up rebuild.",
      dealSummary:
        "[mock] Proprietary process, founder-led target, no competing bidder disclosed. Diligence is partially complete; commercial and quality-of-earnings workstreams are outstanding.",
      valuation: {
        summary: "[mock] Entry economics sit within the firm's stated band for this sector.",
        keyMultiples: "[mock] see Deal Economics — those figures are server-computed and are not restated here",
      },
      risks: [
        { source: "assumptions", risk: "[mock] Retention is the single unhedged input and it carries the whole case.", severity: "high" },
        { source: "regulatory", risk: "[mock] Clearance is modelled at Phase 1 with no remedy.", severity: "medium" },
        { source: "synergy", risk: "[mock] Revenue synergies are phased ahead of the joint pipeline.", severity: "medium" },
      ],
      openItems: [
        "[mock] No independent quality-of-earnings on file.",
        "[mock] Cultural compatibility not yet scored.",
        "[mock] Management retention terms not agreed.",
      ],
      decisionHistory:
        "[mock] Placeholder narrative — configure a real AI provider for a genuine read of the decision log.",
      recommendation: {
        verdict: "proceed_with_conditions",
        conditions: [
          "[mock] Commission a quality-of-earnings review before signing.",
          "[mock] Rebuild the retention assumption bottom-up.",
        ],
        reasoning:
          "[mock] The thesis holds on everything the file covers; the conditions close the two gaps it does not.",
      },
    });
  }

  // Scenario analysis (Phase 15.6). Token: "You are Ansyra's scenario analyst".
  // Must emit ALL THREE case names — ScenarioCards orders downside/base/upside
  // and drops what it cannot find, so a two-case stub renders a hole. The
  // probabilities need not sum to 100; ai-router renormalises them.
  if (s.includes("scenario analyst")) {
    // Reads the prompt for the same reason the Recommendation Engine branch
    // does: a canned driver string renders as a scenario citing an assumption
    // the deal does not contain. Echo back what was actually supplied.
    const quoted = [...prompt.matchAll(/^- "(.+?)" → optimism/gm)].map((m) => m[1]);
    const driver = (i: number, direction: "holds" | "breaks" | "exceeds") => ({
      assumption: quoted[i] ?? "[mock] placeholder assumption",
      direction,
    });

    // Phase 15.17 — the firm's assumption record, echoed for the same reason
    // the drivers are: a canned probability proves nothing about whether the
    // block reached the model. Anchored on its own header, and safe from the
    // `quoted` scanner above because those lines are indented and carry no
    // "→ optimism".
    const historyLines = [
      ...prompt.matchAll(/have failed before[^\n]*:\n((?: {2}- [^\n]*\n?)+)/g),
    ].flatMap((m) =>
      m[1]
        .split("\n")
        .map((l) => l.replace(/^ {2}- /, "").trim())
        .filter(Boolean),
    );
    // WEIGHT the range, never assert the break: the downside gets heavier and
    // the base gives up exactly what the downside gains, so the three still land
    // near 100 before ai-router renormalises them.
    const shift = historyLines.length ? 15 : 0;
    return JSON.stringify({
      cases: [
        {
          name: "base",
          probabilityPct: 55 - shift,
          narrative:
            "[mock] The plan lands broadly as underwritten: retention holds, cost synergies arrive on their stated timetable, and revenue synergies slip a quarter.",
          drivers: [driver(0, "holds"), driver(1, "holds")],
          thesisImpact: "[mock] The thesis is intact and the entry multiple is justified.",
          keyMetricDelta: "[mock] qualitative — no economics supplied",
        },
        {
          name: "upside",
          probabilityPct: 20,
          narrative:
            "[mock] Cross-sell attaches faster than modelled and the joint pipeline converts inside the first year.",
          drivers: [driver(0, "exceeds"), driver(1, "holds")],
          thesisImpact: "[mock] Returns clear the hurdle a year early; paying up at entry looks better in hindsight.",
          keyMetricDelta: "[mock] qualitative",
        },
        {
          name: "downside",
          probabilityPct: 25 + shift,
          narrative:
            "[mock] Retention breaks in the first two quarters post-close and the revenue synergy case goes with it.",
          drivers: [driver(0, "breaks"), driver(1, "breaks")],
          thesisImpact: "[mock] The thesis rests on cost synergies alone, which do not carry the entry price.",
          keyMetricDelta: "[mock] qualitative",
        },
      ],
      summary: historyLines.length
        ? `[mock] A workable base case with a fat, correlated downside — retention is the fork, and the firm's own record argues for weighting it: ${historyLines[0]}`
        : "[mock] A workable base case with a fat, correlated downside — retention is the fork.",
      watchItems: [
        ...(historyLines.length
          ? ["[mock] The leading indicator for the category the firm has been wrong about before."]
          : []),
        "[mock] Voluntary attrition in the target's top two engineering teams, monthly.",
        "[mock] Joint-pipeline coverage ratio at 90 days post-close.",
        "[mock] Timing of the first cross-sell close.",
      ],
    });
  }

  if (s.includes("Deal Genome")) {
    return JSON.stringify({
      answer:
        "[mock] Based on the supplied portfolio, two deals match your query. This is placeholder output — configure a real AI provider for genuine analysis.",
      matches: [],
    });
  }

  // Generic strict-JSON fallback
  return JSON.stringify({
    summary: "[mock] Placeholder JSON response — no AI provider configured.",
  });
}
