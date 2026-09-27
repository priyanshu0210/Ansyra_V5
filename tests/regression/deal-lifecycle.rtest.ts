import { getDb } from "../../api/queries/connection";
import { assumptions } from "@db/schema";
import { ORG_A_ID, USER_PARTNER } from "@fixtures/thornevale/ids";
import { beforeAll, describe, expect, it } from "vitest";
import { callerFor, errorCodeFrom, errorMessageFrom, type Caller } from "../support/caller";
import { PARTNER } from "../support/users";
import { createScratchDeal, scratchName } from "../support/scratch";
import { dealId, recommendationId } from "../support/corpus";

// REG-PIPE / REG-DEC / REG-REC / REG-OUT — the decision spine.
//
// Anything that mutates runs on a scratch deal created inside the test. The
// retained corpus is read-only here, so a regression run never advances,
// blocks or otherwise disturbs the data a person is meant to inspect afterwards.

let partner: Caller;
let anvil: number;

async function createRecommendation(input: Parameters<Caller["recommendations"]["create"]>[0]) {
  const [source] = await getDb().insert(assumptions).values({
    dealId: input.dealId, assumption: "Synthetic source for lifecycle regression tests.",
    createdBy: USER_PARTNER.id, organizationId: ORG_A_ID,
  }).returning();
  return partner.recommendations.create({ ...input, supportingEvidence: [{ kind: "assumption", id: source.id }] });
}

beforeAll(async () => {
  partner = await callerFor(PARTNER);
  anvil = await dealId("anvil");
});

describe("REG-PIPE — deal pipeline", () => {
  it("REG-PIPE-001: a deal is created at sourcing by default", async () => {
    const d = await createScratchDeal(partner, "Default stage");
    expect((await partner.deals.get({ id: d.id })).stage).toBe("sourcing");
  });

  it("REG-PIPE-002: a created deal belongs to the caller's organisation", async () => {
    const d = await createScratchDeal(partner, "Org stamp");
    const deal = await partner.deals.get({ id: d.id });
    expect(deal.organizationId).toBeTruthy();
    expect(deal.createdBy).toBeTruthy();
  });

  it("REG-PIPE-003: deals.create does not flag a new deal as demo data", async () => {
    // is_demo rows are excluded from comps, failure patterns and the CSV export,
    // and are deleted in bulk by removeSamples. A real deal must never be one.
    //
    // Asserted on the row `deals.create` RETURNS, not on a later read: the
    // scratch helper deliberately flags its deals as demo afterwards (see
    // tests/support/scratch.ts), and the contract under test here is what the
    // procedure itself does, not what a test fixture does to the row next.
    const created = await partner.deals.create({
      name: scratchName("Not demo"),
      targetCompany: "Not Demo Holdings",
      stage: "sourcing",
    });
    try {
      expect(created.isDemo).toBe(false);
    } finally {
      await partner.deals.delete({ id: created.id });
    }
  });

  it("REG-PIPE-004: a dollar value is mirrored into numeric columns", async () => {
    const d = await createScratchDeal(partner, "Value parse", { value: "$450M" });
    const deal = await partner.deals.get({ id: d.id });
    expect(Number(deal.valueAmount)).toBe(450);
    expect(deal.valueCurrency).toBe("USD");
  });

  it("REG-PIPE-005: a euro value keeps its own currency rather than being converted", async () => {
    const d = await createScratchDeal(partner, "Euro value", { value: "€312M" });
    const deal = await partner.deals.get({ id: d.id });
    expect(deal.valueCurrency).toBe("EUR");
    expect(Number(deal.valueAmount)).toBe(312);
  });

  it("REG-PIPE-006: an unparseable value leaves the numeric mirror null, not zero", async () => {
    // Zero would silently corrupt every portfolio total. Null means "unknown",
    // and the display string stays the fallback.
    const d = await createScratchDeal(partner, "Unparseable value", { value: "TBC" });
    const deal = await partner.deals.get({ id: d.id });
    expect(deal.valueAmount).toBeNull();
    expect(deal.value).toBe("TBC");
  });

  it("REG-PIPE-007: a deal with no value at all is valid", async () => {
    const d = await createScratchDeal(partner, "No value");
    expect((await partner.deals.get({ id: d.id })).value).toBeFalsy();
  });

  it("REG-PIPE-008: an empty name is rejected", async () => {
    expect(
      await errorCodeFrom(() => partner.deals.create({ name: "", targetCompany: "X" })),
    ).toBe("BAD_REQUEST");
  });

  it("REG-PIPE-009: an empty target company is rejected", async () => {
    expect(
      await errorCodeFrom(() => partner.deals.create({ name: "X", targetCompany: "" })),
    ).toBe("BAD_REQUEST");
  });

  it("REG-PIPE-010: an update persists and is visible to a fresh caller", async () => {
    const d = await createScratchDeal(partner, "Persist update");
    await partner.deals.update({ id: d.id, industry: "Clean Energy" });
    const fresh = await callerFor(PARTNER);
    expect((await fresh.deals.get({ id: d.id })).industry).toBe("Clean Energy");
  });

  it("REG-PIPE-011: every seeded deal appears in the owner's list", async () => {
    const names = new Set((await partner.deals.list()).map((d) => d.name));
    for (const n of ["Project Anvil", "Project Verity", "Project Suzhou", "Project Nordhaven"]) {
      expect(names.has(n)).toBe(true);
    }
  });

  it("REG-PIPE-012: the corpus spans every stage", async () => {
    const list = await partner.deals.list();
    const stages = new Set(list.map((d) => d.stage));
    for (const s of ["sourcing", "evaluation", "diligence", "negotiation", "closing", "integration"]) {
      expect(stages.has(s as "sourcing")).toBe(true);
    }
  });

  it("REG-PIPE-013: the corpus contains a completed and a cancelled deal", async () => {
    const list = await partner.deals.list();
    expect(list.some((d) => d.status === "completed")).toBe(true);
    expect(list.some((d) => d.status === "cancelled")).toBe(true);
  });
});

describe("REG-DEC — the stage gate and the decision log", () => {
  it("REG-DEC-001: a bare forward stage move is refused", async () => {
    const d = await createScratchDeal(partner, "Bare forward", { stage: "sourcing" });
    expect(await errorMessageFrom(() => partner.deals.update({ id: d.id, stage: "diligence" }))).toContain(
      "DECISION_REQUIRED",
    );
  });

  it("REG-DEC-002: a backward stage move needs no decision", async () => {
    const d = await createScratchDeal(partner, "Backward move", { stage: "diligence" });
    await partner.deals.update({ id: d.id, stage: "evaluation" });
    expect((await partner.deals.get({ id: d.id })).stage).toBe("evaluation");
  });

  it("REG-DEC-003: sourcing to evaluation is ungated", async () => {
    const d = await createScratchDeal(partner, "First hop", { stage: "sourcing" });
    await partner.decisions.record({
      dealId: d.id,
      decisionType: "advance",
      toStage: "evaluation",
      rationale: "Worth a first look on sector position; no formal conclusion is required at this hop.",
    });
    expect((await partner.deals.get({ id: d.id })).stage).toBe("evaluation");
  });

  it("REG-DEC-004: evaluation to diligence is refused with no accepted recommendation", async () => {
    const d = await createScratchDeal(partner, "Gated hop", { stage: "evaluation" });
    expect(
      await errorMessageFrom(() =>
        partner.decisions.record({
          dealId: d.id,
          decisionType: "advance",
          toStage: "diligence",
          rationale: "Attempting to advance with nothing recorded behind it — this must be refused.",
        }),
      ),
    ).toContain("RECOMMENDATION_GATE");
  });

  it("REG-DEC-005: a draft recommendation does not open the gate", async () => {
    const d = await createScratchDeal(partner, "Draft only", { stage: "evaluation" });
    await createRecommendation({
      dealId: d.id,
      stage: "evaluation",
      claim: "Proceed to diligence on the strength of the aftermarket franchise.",
      rationale: "A draft is a thought, not a conclusion, and must not open the gate on its own.",
      confidence: 85,
    });
    expect(
      await errorMessageFrom(() =>
        partner.decisions.record({
          dealId: d.id,
          decisionType: "advance",
          toStage: "diligence",
          rationale: "Attempting to advance on a draft — the gate should still be closed.",
        }),
      ),
    ).toContain("RECOMMENDATION_GATE");
  });

  it("REG-DEC-006: an accepted recommendation at the stage being LEFT opens the gate", async () => {
    const d = await createScratchDeal(partner, "Gate opens", { stage: "evaluation" });
    const rec = await createRecommendation({
      dealId: d.id,
      stage: "evaluation",
      claim: "Proceed to confirmatory diligence, conditional on a quality-of-earnings review.",
      rationale: "The aftermarket franchise is supported by segment history through two downturns.",
      confidence: 68,
    });
    await partner.recommendations.accept({ id: rec.id });
    await partner.decisions.record({
      dealId: d.id,
      decisionType: "advance",
      toStage: "diligence",
      rationale: "Accepted conclusion recorded at evaluation; proceeding to confirmatory diligence.",
    });
    expect((await partner.deals.get({ id: d.id })).stage).toBe("diligence");
  });

  it("REG-DEC-007: a recommendation filed at the DESTINATION stage does not open the gate", async () => {
    const d = await createScratchDeal(partner, "Wrong stage rec", { stage: "evaluation" });
    const rec = await createRecommendation({
      dealId: d.id,
      stage: "diligence",
      claim: "Once in diligence, prioritise the quality-of-earnings workstream.",
      rationale: "Filed against the stage being entered rather than the stage being left.",
      confidence: 80,
    });
    await partner.recommendations.accept({ id: rec.id });
    expect(
      await errorMessageFrom(() =>
        partner.decisions.record({
          dealId: d.id,
          decisionType: "advance",
          toStage: "diligence",
          rationale: "Attempting to advance on a conclusion filed at the destination stage.",
        }),
      ),
    ).toContain("RECOMMENDATION_GATE");
  });

  it("REG-DEC-008: an expired recommendation stops opening the gate", async () => {
    const d = await createScratchDeal(partner, "Expired rec", { stage: "evaluation" });
    const rec = await createRecommendation({
      dealId: d.id,
      stage: "evaluation",
      claim: "Financing at SOFR+400 on 5.5x is achievable on current indications.",
      rationale: "Indicative terms were consistent at the time this was written; rates have since moved.",
      confidence: 55,
      expiresAt: new Date(Date.now() - 86_400_000),
    });
    await partner.recommendations.accept({ id: rec.id });
    expect(
      await errorMessageFrom(() =>
        partner.decisions.record({
          dealId: d.id,
          decisionType: "advance",
          toStage: "diligence",
          rationale: "Attempting to advance on a conclusion that has aged out.",
        }),
      ),
    ).toContain("RECOMMENDATION_GATE");
  });

  it("REG-DEC-009: a hold decision records reasoning without moving the stage", async () => {
    const d = await createScratchDeal(partner, "Hold", { stage: "diligence" });
    await partner.decisions.record({
      dealId: d.id,
      decisionType: "hold",
      rationale: "Quality of earnings supports materially less than management presents. Holding pending a retrade.",
    });
    expect((await partner.deals.get({ id: d.id })).stage).toBe("diligence");
  });

  it("REG-DEC-010: a rationale shorter than a sentence is refused", async () => {
    const d = await createScratchDeal(partner, "Thin rationale", { stage: "diligence" });
    expect(
      await errorCodeFrom(() => partner.decisions.record({ dealId: d.id, decisionType: "hold", rationale: "no" })),
    ).toBe("BAD_REQUEST");
  });

  it("REG-DEC-011: the decision log is append-only in practice — entries accumulate", async () => {
    const d = await createScratchDeal(partner, "Append only", { stage: "diligence" });
    await partner.decisions.record({
      dealId: d.id,
      decisionType: "hold",
      rationale: "First recorded reasoning, which must survive the second being written.",
    });
    await partner.decisions.record({
      dealId: d.id,
      decisionType: "hold",
      rationale: "Second recorded reasoning, superseding the first without erasing it.",
    });
    expect((await partner.decisions.list({ dealId: d.id })).length).toBe(2);
  });

  it("REG-DEC-012: a decision carries its vote outcome and conditions", async () => {
    const d = await createScratchDeal(partner, "Outcome recorded", { stage: "diligence" });
    await partner.decisions.record({
      dealId: d.id,
      decisionType: "hold",
      rationale: "Recording the committee split and the conditions attached to it.",
      outcome: { votesFor: 4, votesAgainst: 1, conditions: ["Retrade to $1,950M or walk"] },
    });
    const log = await partner.decisions.list({ dealId: d.id });
    expect(log[0].outcome?.votesFor).toBe(4);
    expect(log[0].outcome?.conditions).toContain("Retrade to $1,950M or walk");
  });

  it("REG-DEC-013: the seeded corpus records why Project Anvil is at diligence", async () => {
    const log = await partner.decisions.list({ dealId: anvil });
    expect(log.some((d) => d.toStage === "diligence" && d.fromStage === "evaluation")).toBe(true);
  });

  it("REG-DEC-014: the seeded corpus records the hold taken after the QoE landed", async () => {
    const log = await partner.decisions.list({ dealId: anvil });
    expect(log.some((d) => d.decisionType === "hold")).toBe(true);
  });

  it("REG-DEC-015: the killed deal carries a kill decision", async () => {
    const ardsley = await dealId("ardsley");
    const log = await partner.decisions.list({ dealId: ardsley });
    expect(log.some((d) => d.decisionType === "kill")).toBe(true);
  });
});

describe("REG-REC — the recommendation lifecycle", () => {
  it("REG-REC-001: a new recommendation starts as a draft", async () => {
    const d = await createScratchDeal(partner, "Rec draft", { stage: "diligence" });
    const rec = await createRecommendation({
      dealId: d.id,
      stage: "diligence",
      claim: "Retrade to reflect the quality-of-earnings adjusted EBITDA.",
      rationale: "The bridge gap is not a negotiating position, it is a different company.",
      confidence: 74,
    });
    expect(rec.status).toBe("draft");
  });

  it("REG-REC-002: a human-authored recommendation is owned by a human", async () => {
    const d = await createScratchDeal(partner, "Rec owner", { stage: "diligence" });
    const rec = await createRecommendation({
      dealId: d.id,
      stage: "diligence",
      claim: "Proceed on the aftermarket thesis.",
      rationale: "Recorded by a person rather than drafted by the model.",
      confidence: 60,
    });
    expect(rec.owner).toBe("human");
  });

  it("REG-REC-003: accepting records who decided and when", async () => {
    const d = await createScratchDeal(partner, "Rec accept", { stage: "diligence" });
    const rec = await createRecommendation({
      dealId: d.id,
      stage: "diligence",
      claim: "Proceed subject to conditions.",
      rationale: "Acceptance must be attributable — an unattributed conclusion is not auditable.",
      confidence: 70,
    });
    const accepted = await partner.recommendations.accept({ id: rec.id });
    expect(accepted.status).toBe("accepted");
    expect(accepted.decidedBy).toBeTruthy();
    expect(accepted.decidedAt).toBeTruthy();
  });

  it("REG-REC-004: rejecting is recorded rather than deleting the row", async () => {
    // A rejected conclusion that later turns out right is the highest-signal
    // row in the system. Deleting it would destroy the learning loop.
    const d = await createScratchDeal(partner, "Rec reject", { stage: "diligence" });
    const rec = await createRecommendation({
      dealId: d.id,
      stage: "diligence",
      claim: "The backlog decline is seasonal noise.",
      rationale: "Recorded so that being wrong about it stays visible afterwards.",
      confidence: 28,
    });
    await partner.recommendations.reject({ id: rec.id });
    const all = await partner.recommendations.list({ dealId: d.id });
    expect(all.find((r) => r.id === rec.id)?.status).toBe("rejected");
  });

  it("REG-REC-005: a fatal counterargument with no response blocks acceptance", async () => {
    const d = await createScratchDeal(partner, "Fatal counter", { stage: "diligence" });
    const rec = await createRecommendation({
      dealId: d.id,
      stage: "diligence",
      claim: "Proceed at the agreed price.",
      rationale: "Carries an unanswered fatal objection, which must stop acceptance.",
      confidence: 60,
      counterarguments: [{ point: "The quality-of-earnings gap is 16% of EBITDA.", weight: "fatal" }],
    });
    expect(await errorCodeFrom(() => partner.recommendations.accept({ id: rec.id }))).toBe("BAD_REQUEST");
  });

  it("REG-REC-006: answering the fatal counterargument unblocks acceptance", async () => {
    const d = await createScratchDeal(partner, "Fatal answered", { stage: "diligence" });
    const rec = await createRecommendation({
      dealId: d.id,
      stage: "diligence",
      claim: "Proceed at a reduced price.",
      rationale: "The fatal objection is answered rather than ignored.",
      confidence: 60,
      counterarguments: [
        {
          point: "The quality-of-earnings gap is 16% of EBITDA.",
          weight: "fatal",
          response: "Priced. The recommendation is to retrade, not to proceed at the original number.",
        },
      ],
    });
    const accepted = await partner.recommendations.accept({ id: rec.id });
    expect(accepted.status).toBe("accepted");
  });

  it("REG-REC-007: only an accepted recommendation can be superseded", async () => {
    const d = await createScratchDeal(partner, "Supersede draft", { stage: "diligence" });
    const rec = await createRecommendation({
      dealId: d.id,
      stage: "diligence",
      claim: "A draft conclusion.",
      rationale: "A draft is simply edited rather than superseded, so this must be refused.",
      confidence: 50,
    });
    expect(
      await errorCodeFrom(() =>
        partner.recommendations.supersede({
          id: rec.id,
          claim: "A replacement conclusion.",
          rationale: "Attempting to supersede something that was never accepted.",
          confidence: 60,
        }),
      ),
    ).toBe("CONFLICT");
  });

  it("REG-REC-008: superseding marks the old row and creates a linked new one", async () => {
    const d = await createScratchDeal(partner, "Supersede chain", { stage: "diligence" });
    const first = await createRecommendation({
      dealId: d.id,
      stage: "diligence",
      claim: "Retain the declining unit and fix it operationally.",
      rationale: "A third restructuring, properly resourced, could recover unit margin.",
      confidence: 41,
    });
    await partner.recommendations.accept({ id: first.id });
    const second = await partner.recommendations.supersede({
      supportingEvidence: first.supportingEvidence,
      id: first.id,
      claim: "Divest the declining unit within eighteen months of close.",
      rationale: "Two restructurings delivered roughly 30% of case each; there is no evidence a third differs.",
      confidence: 77,
    });
    const all = await partner.recommendations.list({ dealId: d.id });
    expect(all.find((r) => r.id === first.id)?.status).toBe("superseded");
    expect(all.find((r) => r.id === second.id)?.supersedesId).toBe(first.id);
  });

  it("REG-REC-009: the seeded corpus carries a live supersede chain", async () => {
    const all = await partner.recommendations.list({ dealId: anvil });
    expect(all.some((r) => r.status === "superseded")).toBe(true);
    expect(all.some((r) => r.supersedesId !== null)).toBe(true);
  });

  it("REG-REC-010: the seeded corpus carries an accepted-but-expired conclusion", async () => {
    const all = await partner.recommendations.list({ dealId: anvil });
    const expired = all.filter((r) => r.status === "accepted" && r.expiresAt && r.expiresAt < new Date());
    expect(expired.length).toBeGreaterThan(0);
  });

  it("REG-REC-011: the seeded corpus carries a rejected conclusion", async () => {
    const all = await partner.recommendations.list({ dealId: anvil });
    expect(all.some((r) => r.status === "rejected")).toBe(true);
  });

  it("REG-REC-012: a recommendation resolves its cited evidence", async () => {
    const id = await recommendationId("anvil_retrade");
    const rec = await partner.recommendations.get({ id });
    expect(rec.supportingEvidence.length).toBeGreaterThan(0);
  });

  it("REG-REC-013: a recommendation carries its counterarguments", async () => {
    const id = await recommendationId("anvil_retrade");
    const rec = await partner.recommendations.get({ id });
    expect(rec.counterarguments.length).toBeGreaterThan(0);
  });
});

describe("REG-OUT — the outcome ledger", () => {
  it("REG-OUT-001: an outcome cannot be recorded against a draft", async () => {
    // Nobody has claimed a draft, so there is nothing for it to have been right
    // or wrong about.
    const d = await createScratchDeal(partner, "Outcome on draft", { stage: "diligence" });
    const rec = await createRecommendation({
      dealId: d.id,
      stage: "diligence",
      claim: "An undecided conclusion.",
      rationale: "No one has committed to this, so no outcome can attach to it.",
      confidence: 50,
    });
    expect(
      await errorCodeFrom(() =>
        partner.recommendations.recordOutcome({
          recommendationId: rec.id,
          outcomeType: "held",
          outcomeSummary: "Should be refused because the recommendation is still a draft.",
        }),
      ),
    ).toBe("CONFLICT");
  });

  it("REG-OUT-002: an outcome attaches to an accepted recommendation", async () => {
    const d = await createScratchDeal(partner, "Outcome accepted", { stage: "diligence" });
    const rec = await createRecommendation({
      dealId: d.id,
      stage: "diligence",
      claim: "The aftermarket mix will hold through the cycle.",
      rationale: "Underwritten on twenty-five years of segment data through two downturns.",
      confidence: 70,
    });
    await partner.recommendations.accept({ id: rec.id });
    const outcome = await partner.recommendations.recordOutcome({
      recommendationId: rec.id,
      outcomeType: "held",
      outcomeSummary: "Aftermarket revenue held at 44% of unit revenue through the period.",
      horizon: "90_day",
    });
    expect(outcome).toBeTruthy();
  });

  it("REG-OUT-003: an outcome attaches to a REJECTED recommendation too", async () => {
    // A rejected conclusion that turned out true is the highest-signal row in
    // the system, so this path has to work.
    const d = await createScratchDeal(partner, "Outcome rejected", { stage: "diligence" });
    const rec = await createRecommendation({
      dealId: d.id,
      stage: "diligence",
      claim: "The backlog decline is seasonal noise.",
      rationale: "Rejected at the time; recording what actually happened is the point of the ledger.",
      confidence: 28,
    });
    await partner.recommendations.reject({ id: rec.id });
    const outcome = await partner.recommendations.recordOutcome({
      recommendationId: rec.id,
      outcomeType: "contradicted",
      outcomeSummary: "Backlog fell a further 2.0% the following quarter. Rejecting this was correct.",
      horizon: "30_day",
    });
    expect(outcome).toBeTruthy();
  });

  it("REG-OUT-004: many outcomes accumulate on one recommendation", async () => {
    // The trajectory IS the signal — wrong at thirty days and right at six
    // months is exactly what a failure-pattern detector reads.
    const d = await createScratchDeal(partner, "Outcome trajectory", { stage: "diligence" });
    const rec = await createRecommendation({
      dealId: d.id,
      stage: "diligence",
      claim: "Synergies will be realised in full by year three.",
      rationale: "Recorded so the trajectory of being wrong about it can be read back later.",
      confidence: 64,
    });
    await partner.recommendations.accept({ id: rec.id });
    for (const [type, horizon, summary] of [
      ["too_early", "30_day", "Day-100 review: three of eight workstreams behind plan, none yet quantifiable."],
      ["partially_held", "90_day", "Year one: cost synergies at 78% of plan, revenue synergies at 14%."],
      ["contradicted", "6_month", "Year two: total realisation 63% of plan. The counterargument was correct."],
    ] as const) {
      await partner.recommendations.recordOutcome({
        recommendationId: rec.id,
        outcomeType: type,
        outcomeSummary: summary,
        horizon,
      });
    }
    const outcomes = await partner.recommendations.listOutcomes({ dealId: d.id });
    expect(outcomes.filter((o) => o.recommendationId === rec.id).length).toBe(3);
  });

  it("REG-OUT-004b: the horizon an outcome was filed under survives the write", async () => {
    // Found by mutation testing: hard-coding `horizon: null` on the insert broke
    // nothing, because every test passed a horizon in and none read one back.
    //
    // The horizon is what makes an outcome satisfy a SCHEDULED read. Silently
    // nulling it would leave outcomeSchedule and outcomesOwed reporting that
    // every 30-day, 90-day and 6-month read is still outstanding forever, while
    // the rows sat there already recorded — the learning loop's accounting
    // quietly wrong with nothing visibly broken.
    const d = await createScratchDeal(partner, "Horizon round trip", { stage: "diligence" });
    const rec = await createRecommendation({
      dealId: d.id,
      stage: "diligence",
      claim: "A conclusion filed so its outcome horizon can be read back.",
      rationale: "Asserts recordOutcome persists the horizon it was handed.",
      confidence: 60,
    });
    await partner.recommendations.accept({ id: rec.id });

    const written = await partner.recommendations.recordOutcome({
      recommendationId: rec.id,
      outcomeType: "partially_held",
      outcomeSummary: "Right in direction, wrong in degree — filed as the ninety-day read.",
      horizon: "90_day",
    });
    expect(written.horizon).toBe("90_day");

    // And it is still there on a fresh read, not just in the return value.
    const readBack = (await partner.recommendations.listOutcomes({ dealId: d.id }))
      .find((o) => o.id === written.id);
    expect(readBack?.horizon).toBe("90_day");
  });

  it("REG-OUT-004c: an outcome filed with no horizon stays ad-hoc rather than being invented", async () => {
    // The other direction of the same rule. A null horizon is meaningful — it
    // says "this was an observation, not a scheduled read" — so it must not be
    // back-filled with a guess.
    const d = await createScratchDeal(partner, "Ad-hoc outcome", { stage: "diligence" });
    const rec = await createRecommendation({
      dealId: d.id,
      stage: "diligence",
      claim: "A conclusion whose outcome is recorded off-schedule.",
      rationale: "Asserts an absent horizon is preserved as absent.",
      confidence: 60,
    });
    await partner.recommendations.accept({ id: rec.id });
    const written = await partner.recommendations.recordOutcome({
      recommendationId: rec.id,
      outcomeType: "too_early",
      outcomeSummary: "Looked at it in passing; nothing conclusive either way yet.",
    });
    expect(written.horizon).toBeNull();
  });

  it("REG-OUT-005: an outcome summary too short to explain anything is refused", async () => {
    const d = await createScratchDeal(partner, "Thin outcome", { stage: "diligence" });
    const rec = await createRecommendation({
      dealId: d.id,
      stage: "diligence",
      claim: "A conclusion.",
      rationale: "Accepted so an outcome can be attempted against it.",
      confidence: 50,
    });
    await partner.recommendations.accept({ id: rec.id });
    expect(
      await errorCodeFrom(() =>
        partner.recommendations.recordOutcome({
          recommendationId: rec.id,
          outcomeType: "held",
          outcomeSummary: "yes",
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("REG-OUT-006: the seeded corpus carries a full outcome trajectory", async () => {
    const nordhaven = await dealId("nordhaven");
    const outcomes = await partner.recommendations.listOutcomes({ dealId: nordhaven });
    const horizons = new Set(outcomes.map((o) => o.horizon));
    expect(horizons.size).toBeGreaterThan(2);
  });

  it("REG-OUT-007: the corpus contains a conclusion that was contradicted", async () => {
    const kestrel = await dealId("kestrel_retro");
    const outcomes = await partner.recommendations.listOutcomes({ dealId: kestrel });
    expect(outcomes.some((o) => o.outcomeType === "contradicted")).toBe(true);
  });

  it("REG-OUT-008: the corpus contains a conclusion that held", async () => {
    const nordhaven = await dealId("nordhaven");
    const outcomes = await partner.recommendations.listOutcomes({ dealId: nordhaven });
    expect(outcomes.some((o) => o.outcomeType === "held")).toBe(true);
  });

  it("REG-OUT-009: the outcome schedule reports what is still owed on a deal", async () => {
    const schedule = await partner.recommendations.outcomeSchedule({ dealId: anvil });
    expect(schedule).toBeTruthy();
  });

  it("REG-OUT-010: decision health reads back over the corpus", async () => {
    const health = await partner.recommendations.decisionHealth({ dealId: anvil });
    expect(health).toBeTruthy();
  });
});
