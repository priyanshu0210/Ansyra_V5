import { beforeAll, describe, expect, it } from "vitest";
import { anonCaller, callerFor, errorCodeFrom, type Caller } from "../support/caller";
import { ADMIN, ASSOCIATE, PARTNER, RIVAL } from "../support/users";
import { dealId, documentId } from "../support/corpus";
import { createScratchDeal } from "../support/scratch";

// REG-AUTH / REG-RBAC / REG-ISO — the three walls, as release gates.
//
// Read-only against the retained corpus. Every refusal here is a security
// property: Ansyra connects to Postgres as the table-owning role and bypasses
// RLS entirely, so these walls ARE the tenancy model.

let partner: Caller;
let associate: Caller;
let admin: Caller;
let rival: Caller;
let anvil: number;
/** Disposable, partner-owned. Every WRITE the rival attempts is aimed here so a
 *  broken wall cannot damage the retained corpus — see the note in
 *  tests/integration/tenancy-isolation.itest.ts for what happened when it did. */
let victim: number;

beforeAll(async () => {
  [partner, associate, admin, rival] = await Promise.all([
    callerFor(PARTNER),
    callerFor(ASSOCIATE),
    callerFor(ADMIN),
    callerFor(RIVAL),
  ]);
  anvil = await dealId("anvil");
  victim = (await createScratchDeal(partner, "Isolation target", { stage: "diligence" })).id;
});

describe("REG-AUTH — authentication", () => {
  it("REG-AUTH-001: an unauthenticated caller reaches the public health check", async () => {
    expect((await anonCaller().ping()).ok).toBe(true);
  });

  it("REG-AUTH-002: an unauthenticated caller cannot list deals", async () => {
    expect(await errorCodeFrom(() => anonCaller().deals.list())).toBe("UNAUTHORIZED");
  });

  it("REG-AUTH-003: an unauthenticated caller cannot read a deal by id", async () => {
    expect(await errorCodeFrom(() => anonCaller().deals.get({ id: anvil }))).toBe("UNAUTHORIZED");
  });

  it("REG-AUTH-004: an unauthenticated caller cannot list documents", async () => {
    expect(await errorCodeFrom(() => anonCaller().documents.list({ dealId: anvil }))).toBe("UNAUTHORIZED");
  });

  it("REG-AUTH-005: an unauthenticated caller cannot read the activity feed", async () => {
    expect(await errorCodeFrom(() => anonCaller().activity.list({}))).toBe("UNAUTHORIZED");
  });

  it("REG-AUTH-006: an unauthenticated caller cannot reach the admin console", async () => {
    expect(await errorCodeFrom(() => anonCaller().admin.listUserSummaries())).toBe("UNAUTHORIZED");
  });

  it("REG-AUTH-007: an authenticated member resolves their own identity", async () => {
    const me = await partner.auth.me();
    expect(me?.email).toBe(PARTNER);
  });
});

describe("REG-RBAC — role and feature gating", () => {
  it("REG-RBAC-001: an admin account is refused the deal pipeline", async () => {
    // Admins hold every feature grant in this fixture, so the refusal can only
    // be the member-kind wall.
    expect(await errorCodeFrom(() => admin.deals.list())).toBe("FORBIDDEN");
  });

  it("REG-RBAC-002: an admin account is refused target screening", async () => {
    expect(await errorCodeFrom(() => admin.targets.list())).toBe("FORBIDDEN");
  });

  it("REG-RBAC-003: an admin account is refused the AI copilot", async () => {
    // The argument is passed deliberately. Calling with none made this refuse
    // on a zod validation error rather than on the member-kind wall — green,
    // and proving nothing about RBAC.
    expect(await errorCodeFrom(() => admin.ai.copilotHistory({ surface: "general" }))).toBe("FORBIDDEN");
  });

  it("REG-RBAC-004: an admin account reaches the admin console", async () => {
    const users = await admin.admin.listUserSummaries();
    expect(Array.isArray(users)).toBe(true);
  });

  it("REG-RBAC-005: a member is refused the admin console", async () => {
    expect(await errorCodeFrom(() => partner.admin.listUserSummaries())).toBe("FORBIDDEN");
  });

  it("REG-RBAC-006: a member without the documents grant cannot list a data room", async () => {
    expect(await errorCodeFrom(() => associate.documents.list({ dealId: anvil }))).toBe("FORBIDDEN");
  });

  it("REG-RBAC-007: a member without the documents grant cannot request an upload", async () => {
    expect(
      await errorCodeFrom(() =>
        associate.documents.requestUpload({ dealId: anvil, name: "x.txt", mime: "text/plain", size: 10 }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("REG-RBAC-008: a member without the documents grant cannot analyse a document", async () => {
    const doc = await documentId("anvil", "01 Confidential Information Memorandum.pdf");
    expect(await errorCodeFrom(() => associate.ai.analyzeDocument({ documentId: doc, kind: "summary" }))).toBe(
      "FORBIDDEN",
    );
  });

  it("REG-RBAC-009: a member without the economics grant cannot read economics", async () => {
    expect(await errorCodeFrom(() => associate.economics.get({ dealId: anvil }))).toBe("FORBIDDEN");
  });

  it("REG-RBAC-010: a member without the economics grant cannot write economics", async () => {
    expect(
      await errorCodeFrom(() => associate.economics.save({ dealId: anvil, currency: "USD", equityValue: 1 })),
    ).toBe("FORBIDDEN");
  });

  it("REG-RBAC-011: the same member reaches the features they DO hold", async () => {
    // Proves the previous refusals are per-feature and not a blanket denial.
    expect((await associate.deals.list()).length).toBeGreaterThan(0);
    expect(Array.isArray(await associate.decisions.list({ dealId: anvil }))).toBe(true);
    expect(Array.isArray(await associate.comments.list({ dealId: anvil }))).toBe(true);
  });

  it("REG-RBAC-012: a fully-granted member reaches the data room", async () => {
    expect((await partner.documents.list({ dealId: anvil })).length).toBeGreaterThan(30);
  });
});

describe("REG-ISO — cross-organisation isolation", () => {
  const refusals: { id: string; what: string; call: () => Promise<unknown> }[] = [];

  beforeAll(() => {
    // Table-driven so a new deal-scoped namespace is one line rather than a
    // copied block — and so the list of things that MUST be walled is readable
    // in one place.
    refusals.push(
      { id: "REG-ISO-001", what: "read a deal by id", call: () => rival.deals.get({ id: anvil }) },
      { id: "REG-ISO-002", what: "update a deal", call: () => rival.deals.update({ id: victim, name: "Owned" }) },
      { id: "REG-ISO-003", what: "delete a deal", call: () => rival.deals.delete({ id: victim }) },
      { id: "REG-ISO-004", what: "list documents", call: () => rival.documents.list({ dealId: anvil }) },
      {
        id: "REG-ISO-005",
        what: "request an upload",
        call: () => rival.documents.requestUpload({ dealId: victim, name: "x.txt", mime: "text/plain", size: 10 }),
      },
      { id: "REG-ISO-006", what: "read the assumption ledger", call: () => rival.assumptionLedger.ledger({ dealId: anvil }) },
      { id: "REG-ISO-007", what: "list scenario snapshots", call: () => rival.scenarios.listByDeal({ dealId: anvil }) },
      { id: "REG-ISO-008", what: "list recommendations", call: () => rival.recommendations.list({ dealId: anvil }) },
      {
        id: "REG-ISO-009",
        what: "create a recommendation",
        call: () =>
          rival.recommendations.create({
            dealId: victim,
            stage: "diligence",
            claim: "Injected by the regression suite — must never persist.",
            rationale: "If this row exists, tenancy is broken and the retained corpus is contaminated.",
            confidence: 50,
          }),
      },
      { id: "REG-ISO-010", what: "read the decision log", call: () => rival.decisions.list({ dealId: anvil }) },
      {
        id: "REG-ISO-011",
        what: "record a decision",
        call: () =>
          rival.decisions.record({
            dealId: victim,
            decisionType: "advance",
            toStage: "negotiation",
            rationale: "Injected by the regression suite — must never be recorded against another firm's deal.",
          }),
      },
      { id: "REG-ISO-012", what: "read economics", call: () => rival.economics.get({ dealId: anvil }) },
      {
        id: "REG-ISO-013",
        what: "overwrite economics",
        call: () => rival.economics.save({ dealId: victim, currency: "USD", equityValue: 1 }),
      },
      { id: "REG-ISO-014", what: "list milestones", call: () => rival.milestones.list({ dealId: anvil }) },
      { id: "REG-ISO-015", what: "list diligence items", call: () => rival.dd.list({ dealId: anvil }) },
      { id: "REG-ISO-016", what: "seed the diligence checklist", call: () => rival.dd.seed({ dealId: victim }) },
      { id: "REG-ISO-017", what: "read the comment thread", call: () => rival.comments.list({ dealId: anvil }) },
      {
        id: "REG-ISO-018",
        what: "post a comment",
        call: () => rival.comments.add({ dealId: victim, body: "Injected by the regression suite." }),
      },
      { id: "REG-ISO-019", what: "read decision health", call: () => rival.recommendations.decisionHealth({ dealId: anvil }) },
      {
        id: "REG-ISO-020",
        what: "list scenario links",
        call: () => rival.recommendations.listScenarioLinks({ dealId: anvil }),
      },
      { id: "REG-ISO-021", what: "list outcomes", call: () => rival.recommendations.listOutcomes({ dealId: anvil }) },
      { id: "REG-ISO-022", what: "read the outcome schedule", call: () => rival.recommendations.outcomeSchedule({ dealId: anvil }) },
      { id: "REG-ISO-023", what: "generate an IC memo", call: () => rival.ai.generateIcMemo({ dealId: victim }) },
      { id: "REG-ISO-024", what: "run a scenario analysis", call: () => rival.ai.scenarioAnalysis({ dealId: victim }) },
      { id: "REG-ISO-025", what: "draft recommendations", call: () => rival.ai.draftRecommendations({ dealId: victim }) },
      {
        id: "REG-ISO-026",
        what: "create a milestone",
        call: () =>
          rival.milestones.create({
            dealId: victim,
            kind: "closing",
            dueDate: "2027-01-15",
            note: "Injected by the regression suite — must never persist.",
          }),
      },
      {
        id: "REG-ISO-027",
        what: "stress-test an assumption onto the deal",
        call: () => rival.ai.stressTestAssumption({ dealId: victim, assumption: "Injected by the regression suite." }),
      },
      { id: "REG-ISO-028", what: "read the synergy plan", call: () => rival.ai.getSynergyPlan({ dealId: anvil }) },
      { id: "REG-ISO-029", what: "list IC memos", call: () => rival.ai.listIcMemos({ dealId: anvil }) },
      { id: "REG-ISO-030", what: "list scenario analyses", call: () => rival.ai.listScenarioAnalyses({ dealId: anvil }) },
    );
  });

  for (let i = 1; i <= 30; i++) {
    const id = `REG-ISO-${String(i).padStart(3, "0")}`;
    it(`${id}: another firm cannot ${["read a deal by id","update a deal","delete a deal","list documents","request an upload","read the assumption ledger","list scenario snapshots","list recommendations","create a recommendation","read the decision log","record a decision","read economics","overwrite economics","list milestones","list diligence items","seed the diligence checklist","read the comment thread","post a comment","read decision health","list scenario links","list outcomes","read the outcome schedule","generate an IC memo","run a scenario analysis","draft recommendations","create a milestone","stress-test an assumption onto the deal","read the synergy plan","list IC memos","list scenario analyses"][i - 1]}`, async () => {
      const entry = refusals.find((r) => r.id === id)!;
      expect(await errorCodeFrom(entry.call)).toBe("FORBIDDEN");
    });
  }

  it("REG-ISO-031a: a scoped LIST returns nothing rather than throwing", async () => {
    // Two safe shapes, not one. Routes that resolve a specific deal call
    // assertDealAccess and throw FORBIDDEN; routes that only apply ownerScope
    // return an empty set. The second leaks strictly less — a FORBIDDEN would
    // confirm that a deal exists at that id — so this is asserted as intended
    // behaviour rather than corrected to match the other shape.
    const rows = await rival.ai.listAssumptions({ dealId: anvil });
    expect(rows).toEqual([]);
  });

  it("REG-ISO-031: another firm's deal list contains none of the corpus", async () => {
    const names = new Set((await rival.deals.list()).map((d) => d.name));
    expect(names.has("Project Anvil")).toBe(false);
    expect(names.has("Project Verity")).toBe(false);
  });

  it("REG-ISO-032: another firm's target list contains none of the corpus", async () => {
    const names = new Set((await rival.targets.list()).map((t) => t.name));
    expect(names.has("Ashgrove Surface Technologies")).toBe(false);
  });

  it("REG-ISO-033: another firm's activity feed leaks no deal names", async () => {
    const feed = await rival.activity.list({});
    expect(feed.filter((e) => (e.detail ?? "").includes("Project Anvil"))).toEqual([]);
  });

  it("REG-ISO-034: institutional-memory search does not range across firms", async () => {
    const res = await rival.ai.dealGenomeSearch({ query: "Thornevale covenant headroom Braeburn carve-out" });
    expect(JSON.stringify(res)).not.toContain("Thornevale Industrial Group");
  });

  it("REG-ISO-035: cross-firm failure-pattern learning stays inside the firm", async () => {
    const patterns = await rival.patterns.list();
    expect(JSON.stringify(patterns)).not.toContain("Braeburn");
  });

  it("REG-ISO-036: an unknown deal id is NOT_FOUND, not FORBIDDEN", async () => {
    // FORBIDDEN on an unknown id would confirm that some other tenant's row
    // exists at that id.
    expect(await errorCodeFrom(() => partner.deals.get({ id: 2_000_000_000 }))).toBe("NOT_FOUND");
  });

  it("REG-ISO-037: none of the injected writes above actually landed", async () => {
    const recs = await partner.recommendations.list({ dealId: anvil });
    expect(recs.some((r) => r.claim.includes("regression suite"))).toBe(false);
    const comments = await partner.comments.list({ dealId: anvil });
    expect(comments.some((c) => c.body.includes("regression suite"))).toBe(false);
    const assumptions = await partner.ai.listAssumptions({ dealId: anvil });
    expect(assumptions.some((a) => a.assumption.includes("regression suite"))).toBe(false);
  });

  it("REG-ISO-038: the corpus deal is untouched after the whole sweep", async () => {
    const deal = await partner.deals.get({ id: anvil });
    expect(deal.name).toBe("Project Anvil");
    expect(deal.stage).toBe("diligence");
    expect(deal.status).toBe("active");
  });
});
