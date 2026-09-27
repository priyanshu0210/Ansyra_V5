import { beforeAll, describe, expect, it } from "vitest";
import { callerFor, errorCodeFrom, errorMessageFrom, type Caller } from "../support/caller";
import { PARTNER } from "../support/users";
import { createScratchDeal } from "../support/scratch";
import { dealId } from "../support/corpus";
import { getDb } from "../../api/queries/connection";
import { assumptions } from "@db/schema";
import { ORG_A_ID, USER_PARTNER } from "@fixtures/thornevale/ids";

const partnerUserId = USER_PARTNER.id;

// The two gates are the product's central claim: a deal cannot move forward
// without a recorded conclusion behind it, and it cannot move forward while a
// red-flag assumption sits unanswered.
//
// Both are enforced inside one transaction in decisions.record, and neither had
// an executable test. `contracts/stages.ts` and both gate contracts are well
// unit-tested in isolation; what was never checked is that the ROUTER actually
// consults them, in the right order, against the right rows.
//
// Everything here happens on scratch deals created inside the test, so the
// retained corpus is never advanced, blocked or otherwise disturbed.

let partner: Caller;

beforeAll(async () => {
  partner = await callerFor(PARTNER);
});

describe("deals.update cannot be used to skip the gate", () => {
  it("refuses a bare forward stage move", async () => {
    const deal = await createScratchDeal(partner, "Gate bypass", { stage: "sourcing" });
    const msg = await errorMessageFrom(() => partner.deals.update({ id: deal.id, stage: "diligence" }));
    expect(msg).toContain("DECISION_REQUIRED");
  });

  it("allows a BACKWARD stage move without a decision", async () => {
    // Deliberate asymmetry: going back is an admission, not a commitment, and
    // demanding a formal conclusion to walk something back would just mean
    // people leave deals at the wrong stage.
    const deal = await createScratchDeal(partner, "Gate backward", { stage: "diligence" });
    await partner.deals.update({ id: deal.id, stage: "evaluation" });
    expect((await partner.deals.get({ id: deal.id })).stage).toBe("evaluation");
  });

  it("allows a same-stage edit without a decision", async () => {
    const deal = await createScratchDeal(partner, "Gate same-stage", { stage: "evaluation" });
    await partner.deals.update({ id: deal.id, stage: "evaluation", industry: "Chemicals & Materials" });
    expect((await partner.deals.get({ id: deal.id })).industry).toBe("Chemicals & Materials");
  });

  it("allows a non-stage edit without a decision", async () => {
    const deal = await createScratchDeal(partner, "Gate non-stage", { stage: "diligence" });
    await partner.deals.update({ id: deal.id, value: "$250M" });
    const after = await partner.deals.get({ id: deal.id });
    expect(after.value).toBe("$250M");
    expect(after.stage).toBe("diligence");
  });
});

describe("the recommendation gate", () => {
  it("lets sourcing → evaluation through ungated", async () => {
    // Deliberately not gated: demanding a formal recorded conclusion before you
    // may look harder at a lead would make the product hostile at exactly the
    // moment it should be cheap.
    const deal = await createScratchDeal(partner, "Ungated first hop", { stage: "sourcing" });
    await partner.decisions.record({
      dealId: deal.id,
      decisionType: "advance",
      toStage: "evaluation",
      rationale: "Worth a first look on sector position; no formal conclusion required at this hop.",
    });
    expect((await partner.deals.get({ id: deal.id })).stage).toBe("evaluation");
  });

  it("blocks evaluation → diligence with no accepted recommendation", async () => {
    const deal = await createScratchDeal(partner, "Gated no rec", { stage: "evaluation" });
    const msg = await errorMessageFrom(() =>
      partner.decisions.record({
        dealId: deal.id,
        decisionType: "advance",
        toStage: "diligence",
        rationale: "Attempting to advance with nothing recorded behind it — this must be refused.",
      }),
    );
    expect(msg).toContain("RECOMMENDATION_GATE");
  });

  it("is not satisfied by a DRAFT recommendation", async () => {
    const deal = await createScratchDeal(partner, "Gated draft only", { stage: "evaluation" });
    await partner.recommendations.create({
      dealId: deal.id,
      stage: "evaluation",
      claim: "Proceed to diligence on the strength of the aftermarket franchise.",
      rationale: "A draft is a thought, not a conclusion. This must not open the gate on its own.",
      confidence: 80,
    });
    const msg = await errorMessageFrom(() =>
      partner.decisions.record({
        dealId: deal.id,
        decisionType: "advance",
        toStage: "diligence",
        rationale: "Attempting to advance on a draft — the gate should still be closed.",
      }),
    );
    expect(msg).toContain("RECOMMENDATION_GATE");
  });

  it("is not satisfied by a recommendation filed at the WRONG stage", async () => {
    // The conclusion that justifies advancing is the one you reached where you
    // are standing. A recommendation filed against a stage the deal has not
    // entered is a plan, not a finding.
    const deal = await createScratchDeal(partner, "Gated wrong stage", { stage: "evaluation" });
    const rec = await partner.recommendations.create({
      dealId: deal.id,
      stage: "diligence",
      claim: "Once in diligence, prioritise the quality-of-earnings workstream.",
      rationale: "Filed against diligence, which is the stage being entered rather than the one being left.",
      confidence: 80,
    });
    const [evidence] = await getDb().insert(assumptions).values({
      dealId: deal.id, assumption: "Synthetic source supporting this gate test.",
      category: "other", createdBy: partnerUserId, organizationId: ORG_A_ID,
    }).returning();
    await partner.recommendations.update({ id: rec.id, supportingEvidence: [{ kind: "assumption", id: evidence.id }] });
    await partner.recommendations.accept({ id: rec.id });
    const msg = await errorMessageFrom(() =>
      partner.decisions.record({
        dealId: deal.id,
        decisionType: "advance",
        toStage: "diligence",
        rationale: "Attempting to advance on a conclusion filed at the destination stage.",
      }),
    );
    expect(msg).toContain("RECOMMENDATION_GATE");
  });

  it("opens once an accepted recommendation exists at the stage being left", async () => {
    const deal = await createScratchDeal(partner, "Gate opens", { stage: "evaluation" });
    const rec = await partner.recommendations.create({
      dealId: deal.id,
      stage: "evaluation",
      claim: "Proceed to confirmatory diligence, conditional on a quality-of-earnings review.",
      rationale: "The aftermarket franchise is supported by the segment history through two downturns.",
      confidence: 68,
    });
    const [evidence] = await getDb().insert(assumptions).values({
      dealId: deal.id, assumption: "Synthetic source supporting this gate test.",
      category: "other", createdBy: partnerUserId, organizationId: ORG_A_ID,
    }).returning();
    await partner.recommendations.update({ id: rec.id, supportingEvidence: [{ kind: "assumption", id: evidence.id }] });
    await partner.recommendations.accept({ id: rec.id });
    await partner.decisions.record({
      dealId: deal.id,
      decisionType: "advance",
      toStage: "diligence",
      rationale: "Accepted conclusion recorded at evaluation; proceeding to confirmatory diligence.",
    });
    expect((await partner.deals.get({ id: deal.id })).stage).toBe("diligence");
  });

  it("stops being satisfied once the recommendation expires", async () => {
    // An expired conclusion is still readable — it was a conclusion about a
    // world that has since moved on — but it must stop opening the gate.
    const deal = await createScratchDeal(partner, "Gate expiry", { stage: "evaluation" });
    const rec = await partner.recommendations.create({
      dealId: deal.id,
      stage: "evaluation",
      claim: "Financing at SOFR+400 on 5.5x is achievable on current indications.",
      rationale: "Indicative terms from two arrangers were consistent at the time this was written.",
      confidence: 55,
      expiresAt: new Date(Date.now() - 86_400_000),
    });
    const [evidence] = await getDb().insert(assumptions).values({
      dealId: deal.id, assumption: "Synthetic source supporting this gate test.",
      category: "other", createdBy: partnerUserId, organizationId: ORG_A_ID,
    }).returning();
    await partner.recommendations.update({ id: rec.id, supportingEvidence: [{ kind: "assumption", id: evidence.id }] });
    await partner.recommendations.accept({ id: rec.id });
    const msg = await errorMessageFrom(() =>
      partner.decisions.record({
        dealId: deal.id,
        decisionType: "advance",
        toStage: "diligence",
        rationale: "Attempting to advance on a conclusion that has aged out.",
      }),
    );
    expect(msg).toContain("RECOMMENDATION_GATE");
  });
});

describe("the assumption gate", () => {
  it("blocks advancement on a red-flag assumption with no reviewer response", async () => {
    const deal = await createScratchDeal(partner, "Assumption gate", { stage: "evaluation" });

    // Give the deal a live conclusion first, so the ONLY thing that can refuse
    // the move is the assumption gate. Without this the test would pass on the
    // recommendation gate and prove nothing about assumptions.
    const rec = await partner.recommendations.create({
      dealId: deal.id,
      stage: "evaluation",
      claim: "Proceed to diligence.",
      rationale: "A live conclusion exists, so the only thing that can stop this move is the assumption gate.",
      confidence: 70,
    });
    const [evidence] = await getDb().insert(assumptions).values({
      dealId: deal.id, assumption: "Synthetic source supporting this gate test.",
      category: "other", createdBy: partnerUserId, organizationId: ORG_A_ID,
    }).returning();
    await partner.recommendations.update({ id: rec.id, supportingEvidence: [{ kind: "assumption", id: evidence.id }] });
    await partner.recommendations.accept({ id: rec.id });

    // Confirm the gate is genuinely open before closing it — otherwise a broken
    // setup would look identical to a working gate.
    await partner.decisions.record({
      dealId: deal.id,
      decisionType: "advance",
      toStage: "diligence",
      rationale: "Baseline: with no red flags recorded, this move should be permitted.",
    });
    expect((await partner.deals.get({ id: deal.id })).stage).toBe("diligence");

    // Now place a red flag with no reviewer response. Written directly rather
    // than through the AI path because the mock's optimism score is reactive to
    // the prompt, and a gate test that depends on what a mock happens to return
    // is testing the mock.
    await getDb().insert(assumptions).values({
      dealId: deal.id,
      assumption: "Margin expands 600bps within three years, with no plan behind it.",
      category: "margin",
      result: {
        optimismScore: 93,
        confidence: "low",
        reasoning: "Placed by the stage-gate integration test to close the assumption gate.",
        recommendation: "Answer this before advancing.",
      },
      createdBy: partnerUserId,
      organizationId: ORG_A_ID,
    });

    const msg = await errorMessageFrom(() =>
      partner.decisions.record({
        dealId: deal.id,
        decisionType: "advance",
        toStage: "negotiation",
        rationale: "Attempting to advance with an unanswered red flag on the ledger.",
      }),
    );
    expect(msg).toContain("ASSUMPTION_GATE");
    expect((await partner.deals.get({ id: deal.id })).stage).toBe("diligence");
  });

  it("reopens once a reviewer answers the red flag", async () => {
    // The property that makes the gate usable rather than a permanent lock: it
    // asks for an ANSWER, not for a better score.
    const deal = await createScratchDeal(partner, "Assumption gate answered", { stage: "evaluation" });
    const rec = await partner.recommendations.create({
      dealId: deal.id,
      stage: "evaluation",
      claim: "Proceed to diligence.",
      rationale: "A live conclusion exists so the assumption gate is the only remaining wall.",
      confidence: 70,
    });
    const [evidence] = await getDb().insert(assumptions).values({
      dealId: deal.id, assumption: "Synthetic source supporting this gate test.",
      category: "other", createdBy: partnerUserId, organizationId: ORG_A_ID,
    }).returning();
    await partner.recommendations.update({ id: rec.id, supportingEvidence: [{ kind: "assumption", id: evidence.id }] });
    await partner.recommendations.accept({ id: rec.id });

    const [row] = await getDb()
      .insert(assumptions)
      .values({
        dealId: deal.id,
        assumption: "Customer concentration is mitigated by contract tenure.",
        category: "revenue_retention",
        result: {
          optimismScore: 91,
          confidence: "low",
          reasoning: "Placed by the stage-gate integration test.",
          recommendation: "Answer this before advancing.",
        },
        createdBy: partnerUserId,
        organizationId: ORG_A_ID,
      })
      .returning({ id: assumptions.id });

    expect(
      await errorMessageFrom(() =>
        partner.decisions.record({
          dealId: deal.id,
          decisionType: "advance",
          toStage: "diligence",
          rationale: "Should be refused while the red flag is unanswered.",
        }),
      ),
    ).toContain("ASSUMPTION_GATE");

    await partner.ai.addReviewerNote({ outcome: "resolved", evidence: "Fictional diligence memo, page 3",
      id: row.id,
      reviewerNote:
        "Rejected. Tenure is not mitigation when the contracts are terminable on 90 days notice. Priced as a terms risk.",
    });

    await partner.decisions.record({
      dealId: deal.id,
      decisionType: "advance",
      toStage: "diligence",
      rationale: "Red flag answered by a second reviewer; proceeding to confirmatory diligence.",
    });
    expect((await partner.deals.get({ id: deal.id })).stage).toBe("diligence");
  });

  it("reports exactly one unanswered red flag on Project Anvil, without touching it", async () => {
    // Read-only against the retained corpus. Anvil deliberately carries exactly
    // one unanswered red flag, so the deal a person opens first is visibly
    // stuck.
    //
    // `blockingByDeal` takes NO argument — it returns a portfolio-wide roll-up
    // grouped by deal — so this picks Anvil's entry out rather than asserting on
    // the length of the list. That is not a detail: the scratch deals this file
    // creates also carry red flags, so a length assertion would pass on the
    // first run and fail on every run after it.
    const anvil = await dealId("anvil");
    const byDeal = await partner.ai.blockingByDeal();
    const entry = byDeal.find((d) => d.dealId === anvil);
    expect(entry).toBeDefined();
    expect(entry!.count).toBe(1);
    expect((await partner.deals.get({ id: anvil })).stage).toBe("diligence");
  });
});

describe("a decision that records reasoning without a move", () => {
  it("is accepted at any stage and leaves the stage alone", async () => {
    const deal = await createScratchDeal(partner, "Hold decision", { stage: "diligence" });
    await partner.decisions.record({
      dealId: deal.id,
      decisionType: "hold",
      rationale: "Quality of earnings supports materially less than management presents. Holding pending a retrade.",
    });
    expect((await partner.deals.get({ id: deal.id })).stage).toBe("diligence");
    const log = await partner.decisions.list({ dealId: deal.id });
    expect(log.some((d) => d.decisionType === "hold")).toBe(true);
  });

  it("refuses a rationale too short to be a reason", async () => {
    const deal = await createScratchDeal(partner, "Thin rationale", { stage: "diligence" });
    expect(
      await errorCodeFrom(() =>
        partner.decisions.record({ dealId: deal.id, decisionType: "hold", rationale: "no" }),
      ),
    ).toBe("BAD_REQUEST");
  });
});
