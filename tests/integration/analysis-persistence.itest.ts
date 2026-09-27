import { beforeAll, describe, expect, it } from "vitest";
import { callerFor, errorCodeFrom, errorMessageFrom, type Caller } from "../support/caller";
import { PARTNER } from "../support/users";
import { createScratchDeal } from "../support/scratch";
import { dealId, recommendationId, scenarioId } from "../support/corpus";
import {
  MANAGEMENT_ADJ_EBITDA_M,
  NET_DEBT_M,
  QOE_ADJ_EBITDA_M,
} from "@fixtures/thornevale/index";
import { computeMultiples, deriveEv, quickIrrMoic, sourcesUsesBalance } from "@contracts/economics";

// Two properties this product depends on and never tested end to end:
//
//   1. DERIVED VALUES ARE THE SERVER'S. Economics multiples, IRR and MOIC are
//      recomputed server-side on every save from contracts/economics.ts, so a
//      client can never persist its own arithmetic. Hallucinated or hand-edited
//      deal maths is a credibility kill in this domain.
//
//   2. AI RESULTS PERSIST IN THE SAME REQUEST. Every AI mutation writes its row
//      before returning, so a client remount cannot orphan a result.

let partner: Caller;
let scratch: { id: number; name: string };

beforeAll(async () => {
  partner = await callerFor(PARTNER);
  scratch = await createScratchDeal(partner, "Economics", { stage: "diligence" });
});

describe("economics are computed by the server, not accepted from the client", () => {
  it("derives EV from equity plus net debt", async () => {
    const saved = await partner.economics.save({
      dealId: scratch.id,
      currency: "USD",
      equityValue: 1_200,
      netDebt: 800,
      targetEbitda: 250,
      targetRevenue: 1_300,
    });
    expect(saved.enterpriseValue).toBe(2_000);
  });

  it("computes the multiples with the same functions the dossier previews with", async () => {
    const saved = await partner.economics.get({ dealId: scratch.id });
    const expected = computeMultiples({ ev: 2_000, ebitda: 250, revenue: 1_300 });
    expect(saved!.evEbitda).toBe(expected.evEbitda);
    expect(saved!.evRevenue).toBe(expected.evRevenue);
  });

  it("computes IRR and MOIC from the PE inputs", async () => {
    const saved = await partner.economics.save({
      dealId: scratch.id,
      currency: "USD",
      equityValue: 1_200,
      netDebt: 800,
      targetEbitda: 250,
      targetRevenue: 1_300,
      peInputs: { equityPct: 45, holdYears: 5, exitMultiple: 9 },
    });
    const expected = quickIrrMoic({ ev: 2_000, ebitda: 250, equityPct: 45, holdYears: 5, exitMultiple: 9 });
    expect(saved.moicEstimate).toBe(expected.moic);
    expect(saved.irrEstimate).toBe(expected.irr);
  });

  it("recomputes rather than trusting a client-supplied enterprise value", async () => {
    // Passing an explicit EV is legitimate — it is an input, not a derived
    // value — but the multiples that come back must be computed FROM it, never
    // taken alongside it.
    const saved = await partner.economics.save({
      dealId: scratch.id,
      currency: "USD",
      enterpriseValue: 3_000,
      targetEbitda: 250,
      targetRevenue: 1_300,
    });
    expect(saved.enterpriseValue).toBe(3_000);
    expect(saved.evEbitda).toBe(12); // 3000 / 250, not the previous 8
  });

  it("returns n.m. rather than Infinity when EBITDA is zero", async () => {
    const saved = await partner.economics.save({
      dealId: scratch.id,
      currency: "USD",
      equityValue: 100,
      netDebt: 0,
      targetEbitda: 0,
      targetRevenue: 400,
    });
    expect(saved.evEbitda).toBeNull();
    expect(saved.evRevenue).toBe(0.25);
  });

  it("is one record per deal — saving again updates rather than duplicating", async () => {
    await partner.economics.save({ dealId: scratch.id, currency: "USD", equityValue: 500, netDebt: 100 });
    const a = await partner.economics.get({ dealId: scratch.id });
    await partner.economics.save({ dealId: scratch.id, currency: "USD", equityValue: 600, netDebt: 100 });
    const b = await partner.economics.get({ dealId: scratch.id });
    expect(b!.id).toBe(a!.id);
    expect(b!.equityValue).toBe(600);
  });
});

describe("the seeded corpus's economics survive a round trip", () => {
  it("prices Project Anvil at 8.0x on management's EBITDA", async () => {
    const anvil = await dealId("anvil");
    const econ = await partner.economics.get({ dealId: anvil });
    expect(econ).toBeTruthy();
    expect(econ!.evEbitda).toBeCloseTo(8.0, 1);
    expect(econ!.netDebt).toBeCloseTo(NET_DEBT_M, 1);
    expect(econ!.targetEbitda).toBeCloseTo(MANAGEMENT_ADJ_EBITDA_M, 1);
  });

  it("would price the same deal at 9.6x on the QoE's EBITDA", async () => {
    // Not stored — computed here from the stored EV — because the corpus's
    // whole point is that the multiple did not move and the denominator did.
    const anvil = await dealId("anvil");
    const econ = await partner.economics.get({ dealId: anvil });
    const { evEbitda } = computeMultiples({ ev: econ!.enterpriseValue, ebitda: QOE_ADJ_EBITDA_M });
    expect(evEbitda).toBeGreaterThan(9.5);
  });

  it("keeps the realised outcome on the closed deal", async () => {
    const nordhaven = await dealId("nordhaven");
    const econ = await partner.economics.get({ dealId: nordhaven });
    expect(econ!.realized?.realizedMoic).toBeCloseTo(2.14, 2);
    expect(econ!.realized?.realizedIrr).toBeCloseTo(0.213, 3);
  });

  it("stores sources and uses that balance", async () => {
    // Asserted through the product's OWN balance function rather than by
    // re-summing here. An earlier version of this test allowed a 2% tolerance
    // and passed against a fixture that was 5% out — which is not a rounding
    // artefact, it is a sources-and-uses that does not balance. The sponsor
    // equity is now derived as the plug, so this is exact.
    const anvil = await dealId("anvil");
    const econ = await partner.economics.get({ dealId: anvil });
    const rows = econ!.sourcesUses ?? [];
    expect(rows.length).toBeGreaterThan(4);
    expect(sourcesUsesBalance(rows).balanced).toBe(true);
  });

  it("derives EV the same way for every seeded deal", async () => {
    for (const key of ["anvil", "verity", "suzhou", "nordhaven", "kestrel_retro"]) {
      const econ = await partner.economics.get({ dealId: await dealId(key) });
      if (!econ) continue;
      expect(econ.enterpriseValue).toBeCloseTo(
        deriveEv({ equityValue: econ.equityValue, netDebt: econ.netDebt })!,
        1,
      );
    }
  });
});

describe("every AI mutation persists its result in the same request", () => {
  it("stress-tests an assumption and stores it", async () => {
    const before = (await partner.ai.listAssumptions({ dealId: scratch.id })).length;
    await partner.ai.stressTestAssumption({
      dealId: scratch.id,
      assumption: "Adjusted EBITDA margin reaches 24.5% by FY2028.",
    });
    const after = await partner.ai.listAssumptions({ dealId: scratch.id });
    expect(after.length).toBe(before + 1);
    expect(after[0].result).toBeTruthy();
  });

  it("scores cultural compatibility and stores it", async () => {
    await partner.ai.culturalCompatibility({
      dealId: scratch.id,
      acquirer: "Thornevale Diligence Sandbox",
      target: "Thornevale Industrial Group",
      sector: "Industrials & Manufacturing",
    });
    // The list is portfolio-wide (it takes no argument), so this picks out the
    // row for THIS deal. Asserting on the list length would pass trivially
    // against the seeded corpus and prove nothing about the call just made.
    const stored = await partner.ai.listCulturalScores();
    expect(stored.some((c) => c.dealId === scratch.id)).toBe(true);
  });

  it("runs a regulatory analysis and stores it", async () => {
    await partner.ai.regulatoryRadar({
      acquirer: "Fictional Buyer",
      dealId: scratch.id,
      target: "Anfeng Motion Technologies",
      sector: "Industrials & Manufacturing",
      geography: "Germany",
      combinedMarketShare: "24%",
    });
    const stored = await partner.ai.listRegulatoryAnalyses();
    expect(stored.some((r) => r.dealId === scratch.id)).toBe(true);
  });

  it("refuses to build scenarios from a single assumption", async () => {
    // A real product rule, not a limitation: three cases composed from one
    // assumption is not a range, it is the same number written out three times.
    const thin = await createScratchDeal(partner, "Thin scenarios", { stage: "diligence" });
    await partner.ai.stressTestAssumption({ dealId: thin.id, assumption: "The market grows at 5%." });
    const msg = await errorMessageFrom(() => partner.ai.scenarioAnalysis({ dealId: thin.id }));
    expect(msg).toMatch(/at least two assumptions/i);
  });

  it("generates a scenario snapshot and stores it", async () => {
    // Needs a second assumption on top of the one the stress-test above added.
    await partner.ai.stressTestAssumption({
      dealId: scratch.id,
      assumption: "Torvald Agritech renews in December 2027 on substantially current terms.",
    });
    await partner.ai.scenarioAnalysis({ dealId: scratch.id });
    const stored = await partner.ai.listScenarioAnalyses({ dealId: scratch.id });
    expect(stored.length).toBeGreaterThan(0);
    const cases = stored[0].result?.cases ?? [];
    expect(cases.length).toBe(3);
    // Narrative cases are not calibrated probabilities.
    expect(stored[0].result?.probabilityBasis).toBe("not_estimated");
    expect(cases.every((c) => c.probabilityPct === 0)).toBe(true);
  });

  it("generates an IC memo and stores it with its recommendation provenance", async () => {
    await partner.ai.generateIcMemo({ dealId: scratch.id });
    const memos = await partner.ai.listIcMemos({ dealId: scratch.id });
    expect(memos.length).toBeGreaterThan(0);
    expect(memos[0].result?.recommendation?.verdict).toBeTruthy();
    // Server-written provenance, deliberately OUTSIDE the model's own output
    // container so a prompt edit cannot clobber the audit trail.
    expect(Array.isArray(memos[0].recommendationIds)).toBe(true);
  });

  it("drafts recommendations and stores them as drafts, not as accepted", async () => {
    await partner.ai.draftRecommendations({ dealId: scratch.id });
    const recs = await partner.recommendations.list({ dealId: scratch.id });
    const ai = recs.filter((r) => r.owner === "ai");
    expect(ai.length).toBeGreaterThan(0);
    // An AI conclusion is a suggestion until a human accepts it. If the drafter
    // could produce accepted rows it would be able to open the stage gate by
    // itself, which is the opposite of what this product is for.
    expect(ai.every((r) => r.status === "draft")).toBe(true);
  });

  it("survives a reload — every result is readable in a fresh caller", async () => {
    // The actual property "persisted in the same request" is claiming. A second
    // caller shares no in-memory state with the first.
    const fresh = await callerFor(PARTNER);
    expect((await fresh.ai.listAssumptions({ dealId: scratch.id })).length).toBeGreaterThan(0);
    expect((await fresh.ai.listScenarioAnalyses({ dealId: scratch.id })).length).toBeGreaterThan(0);
    expect((await fresh.ai.listIcMemos({ dealId: scratch.id })).length).toBeGreaterThan(0);
  });
});

describe("scenario citations stay pinned to the snapshot they cited", () => {
  it("keeps a link pointing at the superseded run after a newer one exists", async () => {
    // A citation that follows a regeneration is not a citation. The corpus has
    // two Anvil runs and a recommendation pinned to the older one on purpose.
    const anvil = await dealId("anvil");
    const rec = await recommendationId("anvil_proceed_to_dd");
    const older = await scenarioId("anvil_scenario_v1");
    const newer = await scenarioId("anvil_scenario_v2");
    expect(newer).toBeGreaterThan(older);

    const links = await partner.recommendations.listScenarioLinks({ dealId: anvil });
    const pinned = links.filter((l) => l.recommendationId === rec);
    expect(pinned.length).toBeGreaterThan(0);
    expect(pinned.every((l) => l.scenarioAnalysisId === older)).toBe(true);
  });

  it("refuses to cite a scenario snapshot belonging to a DIFFERENT deal", async () => {
    // Found by mutation testing: deleting the snapshot-belongs-to-this-deal
    // check in linkScenario broke nothing, because no test crossed deals. The
    // router's own comment is explicit that assertDealAccess proves the caller
    // may see the DEAL, not that a client-supplied snapshot id belongs to it —
    // and a citation pointing at another deal's range is a false citation, which
    // is precisely what the link table exists to prevent.
    //
    // The recommendation lives on a SCRATCH deal so the write attempt cannot
    // touch the corpus if the guard is ever removed again.
    const scratchDeal = await createScratchDeal(partner, "Cross-deal citation", { stage: "diligence" });
    const rec = await partner.recommendations.create({
      dealId: scratchDeal.id,
      stage: "diligence",
      claim: "A conclusion that will attempt to cite another deal's scenario range.",
      rationale: "Used to prove the snapshot-ownership check on linkScenario actually holds.",
      confidence: 50,
    });
    const foreignSnapshot = await scenarioId("anvil_scenario_v2");

    expect(
      await errorCodeFrom(() =>
        partner.recommendations.linkScenario({
          recommendationId: rec.id,
          scenarioAnalysisId: foreignSnapshot,
          caseName: "base",
          relation: "supports",
        }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("does not create the link when the snapshot is refused", async () => {
    // The refusal has to be a refusal, not a throw after a partial write.
    const scratchDeal = await createScratchDeal(partner, "Cross-deal citation check", { stage: "diligence" });
    const rec = await partner.recommendations.create({
      dealId: scratchDeal.id,
      stage: "diligence",
      claim: "A second conclusion, to confirm nothing was persisted by the refusal.",
      rationale: "Asserts the failed link left no row behind on the scratch deal.",
      confidence: 50,
    });
    const foreignSnapshot = await scenarioId("anvil_scenario_v1");
    await errorCodeFrom(() =>
      partner.recommendations.linkScenario({
        recommendationId: rec.id,
        scenarioAnalysisId: foreignSnapshot,
        caseName: "all",
        relation: "supports",
      }),
    );
    const links = await partner.recommendations.listScenarioLinks({ dealId: scratchDeal.id });
    expect(links.filter((l) => l.recommendationId === rec.id)).toEqual([]);
  });

  it("treats a duplicate link as a no-op rather than an error", async () => {
    // Deliberate, and documented in the router: "A double-click is not an
    // error; the unique index makes it a no-op." It returns null instead of
    // throwing, and — the part that actually matters — no second row appears.
    const anvil = await dealId("anvil");
    const rec = await recommendationId("anvil_proceed_to_dd");
    const older = await scenarioId("anvil_scenario_v1");

    const before = (await partner.recommendations.listScenarioLinks({ dealId: anvil })).length;
    const created = await partner.recommendations.linkScenario({
      recommendationId: rec,
      scenarioAnalysisId: older,
      caseName: "base",
      relation: "assumes",
    });
    const after = (await partner.recommendations.listScenarioLinks({ dealId: anvil })).length;

    expect(created).toBeNull();
    expect(after).toBe(before);
  });
});

describe("the read models return something over real data", () => {
  it("computes comps from the closed deal's realised outcome", async () => {
    const res = await partner.comps.query({});
    expect(res).toBeTruthy();
  });

  it("returns a decision-health read for Project Anvil", async () => {
    const anvil = await dealId("anvil");
    const health = await partner.recommendations.decisionHealth({ dealId: anvil });
    expect(health).toBeTruthy();
  });

  it("returns the outcomes still owed across the portfolio", async () => {
    // A rollup object grouped by deal and by horizon, not a flat list — the
    // panel renders N deal cards from one query.
    const owed = await partner.patterns.outcomesOwed();
    expect(owed).toBeTruthy();
    expect(typeof owed.totalOwed).toBe("number");
    expect(Array.isArray(owed.deals)).toBe(true);
  });

  it("folds failure patterns across deals", async () => {
    const patterns = await partner.patterns.list();
    expect(patterns).toBeTruthy();
  });

  it("folds assumption findings across deals", async () => {
    const findings = await partner.patterns.assumptionFindings();
    expect(findings).toBeTruthy();
  });

  it("benchmarks scenario forecasts against what happened", async () => {
    const bench = await partner.patterns.scenarioBenchmark();
    expect(bench).toBeTruthy();
  });
});
