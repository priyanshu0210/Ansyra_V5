import { beforeAll, describe, expect, it } from "vitest";
import { callerFor, errorCodeFrom, type Caller } from "../support/caller";
import { PARTNER, RIVAL } from "../support/users";
import { assumptionId, dealId, documentId, recommendationId, scenarioId } from "../support/corpus";
import { createScratchDeal, uploadScratchDocument } from "../support/scratch";

// The most important file in this suite.
//
// A NOTE ON WHAT THESE TESTS ATTEMPT, AND WHY THAT IS RISKY.
//
// Several of these deliberately try to WRITE to a corpus deal — create a
// recommendation, post a comment, overwrite economics, delete a document. The
// only thing that makes that safe is the wall being tested actually working.
//
// It does. But during a mutation-testing exercise the wall was deliberately
// disabled to prove these tests catch its removal, and every one of those
// writes then landed on the retained corpus: economics were overwritten with
// junk, a document was deleted, and rival-authored rows appeared on Project
// Anvil. Repairing it took a targeted cleanup plus a re-seed.
//
// So the attempts below are pointed at a SCRATCH deal wherever a write is
// involved, and only reads are aimed at the corpus. The assertion is identical
// — a member of another firm is refused — but the blast radius when the wall is
// broken is a throwaway row instead of the dataset this whole exercise exists
// to produce.
//
// Ansyra bypasses RLS entirely — api/queries/connection.ts connects as the
// table-owning role, so every tenant boundary in the product is application
// code: `ownerScope` on reads and `assertDealAccess` per deal. Until now that
// boundary was verified by seven files running `expect(source).toMatch(
// /ownerScope\(/)` against router text, which proves a call site exists and
// says nothing about whether a request from another firm is actually refused.
//
// These tests are the answer to one question, asked of every deal-scoped
// namespace in the API: can a fully-privileged member of a DIFFERENT
// organisation reach a row they do not own?
//
// The rival holds every feature grant, so a refusal here can only be the
// tenancy wall. And every assertion goes through the API — never straight to
// Postgres, where the owner role would see everything by design.

let partner: Caller;
let rival: Caller;
let anvil: number;
/** Owned by the partner, same as the corpus — but disposable. Every WRITE the
 *  rival attempts is aimed here, so a failure of the wall cannot damage the
 *  retained dataset. */
let victim: number;
/** A document on the scratch deal. The rival's DELETE attempt is aimed here:
 *  scratch deals have no documents of their own, so the previous version
 *  targeted Anvil's quality-of-earnings PDF — and a mutation run that disabled
 *  the wall duly deleted it. */
let victimDoc: number;
/** An assumption on the scratch deal, so the rival's outcome-injection attempt
 *  has a disposable target rather than a corpus row. */
let victimAssumption: number;

beforeAll(async () => {
  partner = await callerFor(PARTNER);
  rival = await callerFor(RIVAL);
  anvil = await dealId("anvil");
  victim = (await createScratchDeal(partner, "Isolation target", { stage: "diligence" })).id;
  victimDoc = await uploadScratchDocument(partner, victim, "isolation-target.txt");
  await partner.ai.stressTestAssumption({
    dealId: victim,
    assumption: "Disposable assumption used as the isolation suite's write target.",
  });
  victimAssumption = (await partner.ai.listAssumptions({ dealId: victim }))[0].id;
});

describe("deals", () => {
  it("the owner can read the deal", async () => {
    const deal = await partner.deals.get({ id: anvil });
    expect(deal.name).toBe("Project Anvil");
  });

  it("another firm cannot read it by id", async () => {
    expect(await errorCodeFrom(() => rival.deals.get({ id: anvil }))).toBe("FORBIDDEN");
  });

  it("another firm cannot update it", async () => {
    expect(await errorCodeFrom(() => rival.deals.update({ id: victim, name: "Owned" }))).toBe("FORBIDDEN");
  });

  it("another firm cannot delete it", async () => {
    // The single most destructive thing an isolation bug could permit, and the
    // one the corpus would not survive.
    expect(await errorCodeFrom(() => rival.deals.delete({ id: victim }))).toBe("FORBIDDEN");
  });

  it("a genuinely unknown id is NOT_FOUND rather than FORBIDDEN", async () => {
    // The distinction matters: FORBIDDEN on an unknown id leaks the fact that
    // some other tenant's row exists at that id.
    expect(await errorCodeFrom(() => partner.deals.get({ id: 2_000_000_000 }))).toBe("NOT_FOUND");
  });
});

describe("documents", () => {
  it("another firm cannot list a deal's documents", async () => {
    expect(await errorCodeFrom(() => rival.documents.list({ dealId: anvil }))).toBe("FORBIDDEN");
  });

  it("another firm cannot obtain a download URL for a document it does not own", async () => {
    // A signed URL is a bearer token for the file itself, so this is the one
    // read in the product that leaks bytes rather than metadata.
    const doc = await documentId("anvil", "02 Quality of Earnings Report (Final).pdf");
    expect(await errorCodeFrom(() => rival.documents.getDownloadUrl({ documentId: doc }))).toBe("FORBIDDEN");
  });

  it("another firm cannot delete a document", async () => {
    // Aimed at the scratch deal's own document. The assertion is identical; the
    // casualty if the wall ever breaks is a throwaway file.
    expect(await errorCodeFrom(() => rival.documents.delete({ documentId: victimDoc }))).toBe("FORBIDDEN");
  });

  it("another firm cannot request an upload into someone else's deal", async () => {
    expect(
      await errorCodeFrom(() =>
        rival.documents.requestUpload({ dealId: victim, name: "x.txt", mime: "text/plain", size: 10 }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("the owner can still do all of it", async () => {
    const list = await partner.documents.list({ dealId: anvil });
    expect(list.length).toBeGreaterThan(30);
    const url = await partner.documents.getDownloadUrl({ documentId: list[0].id });
    expect(url.url).toContain("http");
  });
});

describe("assumptions", () => {
  it("another firm cannot read a deal's ledger", async () => {
    expect(await errorCodeFrom(() => rival.assumptionLedger.ledger({ dealId: anvil }))).toBe("FORBIDDEN");
  });

  it("another firm cannot recategorise someone else's assumption", async () => {
    // dealId is passed deliberately. Omitting it made this test pass on a zod
    // validation error rather than on the tenancy wall — green, and proving
    // nothing. Typecheck caught it; the assertion is now on FORBIDDEN
    // specifically rather than on "something threw".
    const id = await assumptionId("anvil_margin_2450");
    expect(
      await errorCodeFrom(() =>
        rival.assumptionLedger.setCategory({ dealId: anvil, assumptionId: id, category: "market" }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("another firm cannot record an outcome against it", async () => {
    // Aimed at the scratch deal's assumption. The outcome ledger is APPEND-ONLY
    // — there is no update or delete procedure anywhere in the API — so an
    // injected row here could not be removed through the product at all. That
    // makes a disposable target more important on this route than most.
    expect(
      await errorCodeFrom(() =>
        rival.assumptionLedger.recordOutcome({
          dealId: victim,
          assumptionId: victimAssumption,
          outcomeType: "held",
          outcomeSummary: "Injected by the isolation test — this must never persist.",
        }),
      ),
    ).toBe("FORBIDDEN");
  });
});

describe("scenarios", () => {
  it("another firm cannot list a deal's snapshots", async () => {
    expect(await errorCodeFrom(() => rival.scenarios.listByDeal({ dealId: anvil }))).toBe("FORBIDDEN");
  });

  it("another firm cannot fetch a specific case by its composite id", async () => {
    // The scenario id is `${snapshotId}:${caseName}` — readable and guessable
    // by design, which is exactly why the router refuses to derive the deal
    // from it and demands the dealId separately (see its docblock). Access is
    // proved against the deal, so a guessed scenario id gets you nothing.
    const snapshot = await scenarioId("anvil_scenario_v2");
    expect(
      await errorCodeFrom(() => rival.scenarios.getById({ dealId: anvil, scenarioId: `${snapshot}:base` })),
    ).toBe("FORBIDDEN");
  });

  it("the owner can fetch it", async () => {
    const snapshot = await scenarioId("anvil_scenario_v2");
    const scenario = await partner.scenarios.getById({ dealId: anvil, scenarioId: `${snapshot}:base` });
    expect(scenario).toBeTruthy();
    expect(scenario.caseName).toBe("base");
  });
});

describe("recommendations", () => {
  it("another firm cannot list them", async () => {
    expect(await errorCodeFrom(() => rival.recommendations.list({ dealId: anvil }))).toBe("FORBIDDEN");
  });

  it("another firm cannot read one by id", async () => {
    const id = await recommendationId("anvil_retrade");
    expect(await errorCodeFrom(() => rival.recommendations.get({ id }))).not.toBe("NO_ERROR");
  });

  it("another firm cannot accept someone else's draft", async () => {
    // Accepting a recommendation satisfies the stage gate. If this were
    // reachable, one firm could unlock another firm's deal advancement.
    const id = await recommendationId("anvil_retrade");
    expect(await errorCodeFrom(() => rival.recommendations.accept({ id }))).not.toBe("NO_ERROR");
  });

  it("another firm cannot create one on a deal it does not own", async () => {
    expect(
      await errorCodeFrom(() =>
        rival.recommendations.create({
          dealId: victim,
          stage: "diligence",
          claim: "Injected by the isolation test — this must never persist.",
          rationale: "If this row exists, tenancy is broken and the corpus is contaminated.",
          confidence: 50,
        }),
      ),
    ).toBe("FORBIDDEN");
  });
});

describe("decisions", () => {
  it("another firm cannot read the decision log", async () => {
    expect(await errorCodeFrom(() => rival.decisions.list({ dealId: anvil }))).toBe("FORBIDDEN");
  });

  it("another firm cannot record a decision, which would move the stage", async () => {
    expect(
      await errorCodeFrom(() =>
        rival.decisions.record({
          dealId: victim,
          decisionType: "advance",
          toStage: "negotiation",
          rationale: "Injected by the isolation test. This must never be recorded against another firm's deal.",
        }),
      ),
    ).toBe("FORBIDDEN");
  });
});

describe("economics, milestones, diligence and comments", () => {
  it("another firm cannot read economics", async () => {
    expect(await errorCodeFrom(() => rival.economics.get({ dealId: anvil }))).toBe("FORBIDDEN");
  });

  it("another firm cannot overwrite economics", async () => {
    expect(
      await errorCodeFrom(() => rival.economics.save({ dealId: victim, currency: "USD", equityValue: 1 })),
    ).toBe("FORBIDDEN");
  });

  it("another firm cannot list milestones", async () => {
    expect(await errorCodeFrom(() => rival.milestones.list({ dealId: anvil }))).toBe("FORBIDDEN");
  });

  it("another firm cannot list diligence items", async () => {
    expect(await errorCodeFrom(() => rival.dd.list({ dealId: anvil }))).toBe("FORBIDDEN");
  });

  it("another firm cannot read the comment thread", async () => {
    expect(await errorCodeFrom(() => rival.comments.list({ dealId: anvil }))).toBe("FORBIDDEN");
  });

  it("another firm cannot post into the comment thread", async () => {
    expect(
      await errorCodeFrom(() => rival.comments.add({ dealId: victim, body: "Injected by the isolation test." })),
    ).toBe("FORBIDDEN");
  });
});

describe("the cross-tenant reads that are not deal-scoped", () => {
  it("the activity feed shows another firm nothing from this corpus", async () => {
    const feed = await rival.activity.list({});
    const leaked = feed.filter((e) => (e.detail ?? "").includes("Project Anvil"));
    expect(leaked).toEqual([]);
  });

  it("target screening shows another firm none of the seeded targets", async () => {
    const list = await rival.targets.list();
    const leaked = list.filter((t) => t.name === "Ashgrove Surface Technologies");
    expect(leaked).toEqual([]);
  });

  it("deal genome search does not reach across firms", async () => {
    // Institutional memory search is the feature most likely to leak, because
    // its whole job is to range across every deal the caller can see.
    const res = await rival.ai.dealGenomeSearch({ query: "Thornevale covenant headroom Braeburn" });
    expect(JSON.stringify(res)).not.toContain("Thornevale Industrial Group");
  });
});

describe("nothing the isolation tests attempted actually landed", () => {
  it("leaves the corpus unchanged", async () => {
    // Belt and braces on the whole file. Every rejection above should have been
    // a no-op, but a partial write before a throw would be exactly the kind of
    // bug worth catching, and it would also have contaminated the retained data.
    const recs = await partner.recommendations.list({ dealId: anvil });
    expect(recs.some((r) => r.claim.includes("isolation test"))).toBe(false);

    const comments = await partner.comments.list({ dealId: anvil });
    expect(comments.some((c) => c.body.includes("isolation test"))).toBe(false);

    const deal = await partner.deals.get({ id: anvil });
    expect(deal.name).toBe("Project Anvil");
    expect(deal.stage).toBe("diligence");
  });
});
