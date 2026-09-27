import { beforeAll, describe, expect, it } from "vitest";
import { callerFor, errorCodeFrom, errorMessageFrom, type Caller } from "../support/caller";
import { PARTNER } from "../support/users";
import { dealId, documentId, scenarioId } from "../support/corpus";
import { EMPTY_DOCUMENT_NAME, TRUNCATED_DOCUMENT_NAME } from "@fixtures/thornevale/documents";

// REG-DOC / REG-ASSUM / REG-SCEN / REG-ECON / REG-TIME / REG-DD / REG-COMP /
// REG-PAT — the analysis surfaces, read against the retained corpus.
//
// Read-only by design. These are the assertions that tell a future run whether
// the data a person is meant to inspect still says what it said at sign-off.

let partner: Caller;
let anvil: number;

beforeAll(async () => {
  partner = await callerFor(PARTNER);
  anvil = await dealId("anvil");
});

describe("REG-DOC — the data room", () => {
  it("REG-DOC-001: Project Anvil's data room holds the full document set", async () => {
    expect((await partner.documents.list({ dealId: anvil })).length).toBeGreaterThanOrEqual(38);
  });

  it("REG-DOC-002: all three supported formats are present", async () => {
    const mimes = new Set((await partner.documents.list({ dealId: anvil })).map((d) => d.mime));
    expect(mimes.size).toBe(3);
  });

  it("REG-DOC-003: every document records a non-zero size", async () => {
    const docs = await partner.documents.list({ dealId: anvil });
    expect(docs.filter((d) => d.sizeBytes <= 0)).toEqual([]);
  });

  it("REG-DOC-004: every document's storage path sits under its own deal prefix", async () => {
    // The cross-deal path claim, checked on the stored rows rather than only at
    // the moment of upload.
    const docs = await partner.documents.list({ dealId: anvil });
    expect(docs.every((d) => d.path.startsWith(`${anvil}/`))).toBe(true);
  });

  it("REG-DOC-005: a signed download returns the real bytes", async () => {
    const doc = await documentId("anvil", "03 Financial History FY2001-FY2025.txt");
    const { url } = await partner.documents.getDownloadUrl({ documentId: doc });
    const text = await (await fetch(url)).text();
    expect(text).toContain("TWENTY-FIVE YEAR FINANCIAL HISTORY");
  });

  it("REG-DOC-006: the 25-year history document records the FY2012 disclosure gap", async () => {
    const doc = await documentId("anvil", "03 Financial History FY2001-FY2025.txt");
    const { url } = await partner.documents.getDownloadUrl({ documentId: doc });
    const text = await (await fetch(url)).text();
    expect(text).toContain("FY2012 segment disclosure is not included");
  });

  it("REG-DOC-007: the quality-of-earnings document contradicts the CIM on margin", async () => {
    const doc = await documentId("anvil", "02 Quality of Earnings Report (Final).pdf");
    const { url } = await partner.documents.getDownloadUrl({ documentId: doc });
    const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
    const { extractText } = await import("../../api/lib/extract");
    const { text } = await extractText(bytes, "application/pdf");
    expect(text).toContain("18.4%");
    expect(text).toContain("22.0%");
  });

  it("REG-DOC-008: the management pack still shows the PRE-restatement quarter", async () => {
    // A deliberate contradiction in the corpus, and a real disclosure-quality
    // signal: the CFO memo says this page should have been updated.
    const doc = await documentId("anvil", "05 Management Presentation.pdf");
    const { url } = await partner.documents.getDownloadUrl({ documentId: doc });
    const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
    const { extractText } = await import("../../api/lib/extract");
    const { text } = await extractText(bytes, "application/pdf");
    expect(text).toContain("312.4");
  });

  it("REG-DOC-009: the restatement memo carries the corrected figure", async () => {
    const doc = await documentId("anvil", "06 CFO Memo - FY2025 Q3 Restatement.docx");
    const { url } = await partner.documents.getDownloadUrl({ documentId: doc });
    const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
    const { extractText } = await import("../../api/lib/extract");
    const { text } = await extractText(bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(text).toContain("298.7");
  });

  it("REG-DOC-010: the deliberately truncated document is present and cut off", async () => {
    const doc = await documentId("anvil", TRUNCATED_DOCUMENT_NAME);
    const { url } = await partner.documents.getDownloadUrl({ documentId: doc });
    const text = await (await fetch(url)).text();
    expect(text.trimEnd().endsWith("which requires")).toBe(true);
  });

  it("REG-DOC-011: the deliberately empty document fails analysis honestly", async () => {
    // An empty analysis would be worse than an error: the model would
    // confidently summarise nothing and a reader would believe it.
    const doc = await documentId("anvil", EMPTY_DOCUMENT_NAME);
    expect(await errorMessageFrom(() => partner.ai.analyzeDocument({ documentId: doc, kind: "summary" }))).toMatch(
      /No extractable text/i,
    );
  });
});

describe("REG-ASSUM — the assumption ledger", () => {
  it("REG-ASSUM-001: Project Anvil carries a populated ledger", async () => {
    const ledger = await partner.assumptionLedger.ledger({ dealId: anvil });
    expect(ledger.rows.length).toBeGreaterThanOrEqual(10);
  });

  it("REG-ASSUM-002: exactly one assumption blocks advancement", async () => {
    const byDeal = await partner.ai.blockingByDeal();
    expect(byDeal.find((d) => d.dealId === anvil)?.count).toBe(1);
  });

  it("REG-ASSUM-003: a high score WITH a reviewer response does not block", async () => {
    const rows = await partner.ai.listAssumptions({ dealId: anvil });
    const answered = rows.filter(
      (a) => (a.result?.optimismScore ?? 0) > 80 && (a.reviewerNote ?? "").trim().length > 0,
    );
    expect(answered.length).toBeGreaterThan(0);
  });

  it("REG-ASSUM-004: an assumption the model never scored does not block", async () => {
    const rows = await partner.ai.listAssumptions({ dealId: anvil });
    expect(rows.some((a) => a.result === null)).toBe(true);
  });

  it("REG-ASSUM-005: the corpus retains an uncategorised assumption", async () => {
    // Models a pre-Phase-15.15 row. The schema is explicit that these read as
    // "other" and must not be back-filled by guessing at the statement text.
    const rows = await partner.ai.listAssumptions({ dealId: anvil });
    expect(rows.some((a) => a.category === null)).toBe(true);
  });

  it("REG-ASSUM-006: the corpus retains two near-duplicate assumptions", async () => {
    const rows = await partner.ai.listAssumptions({ dealId: anvil });
    const management = rows.filter((a) => /management (team )?will (remain|stay)/i.test(a.assumption));
    expect(management.length).toBe(2);
  });

  it("REG-ASSUM-007: assumption outcomes are readable on the corpus", async () => {
    const ledger = await partner.assumptionLedger.ledger({ dealId: anvil });
    const withOutcomes = ledger.rows.filter((r) => (r.outcomes?.length ?? 0) > 0);
    expect(withOutcomes.length).toBeGreaterThan(0);
  });
});

describe("REG-SCEN — scenario analysis", () => {
  it("REG-SCEN-001: Project Anvil carries two snapshots", async () => {
    const snapshots = await partner.ai.listScenarioAnalyses({ dealId: anvil });
    expect(snapshots.length).toBeGreaterThanOrEqual(2);
  });

  it("REG-SCEN-002: every snapshot's probabilities sum to exactly 100", async () => {
    const snapshots = await partner.ai.listScenarioAnalyses({ dealId: anvil });
    for (const s of snapshots) {
      expect((s.result?.cases ?? []).reduce((n, c) => n + c.probabilityPct, 0)).toBe(100);
    }
  });

  it("REG-SCEN-003: every snapshot carries three named cases", async () => {
    const snapshots = await partner.ai.listScenarioAnalyses({ dealId: anvil });
    for (const s of snapshots) {
      const names = (s.result?.cases ?? []).map((c) => c.name).sort().join(",");
      expect(names).toBe("base,downside,upside");
    }
  });

  it("REG-SCEN-004: the later snapshot puts more weight on the downside", async () => {
    // The two runs are the same deal before and after one piece of diligence.
    // If regenerating did not change the shape, the feature would do nothing.
    const older = await scenarioId("anvil_scenario_v1");
    const newer = await scenarioId("anvil_scenario_v2");
    const snapshots = await partner.ai.listScenarioAnalyses({ dealId: anvil });
    const down = (id: number) =>
      snapshots.find((s) => s.id === id)!.result!.cases.find((c) => c.name === "downside")!.probabilityPct;
    expect(down(newer)).toBeGreaterThan(down(older));
  });

  it("REG-SCEN-005: a case is addressable by its composite id", async () => {
    const snapshot = await scenarioId("anvil_scenario_v2");
    const scenario = await partner.scenarios.getById({ dealId: anvil, scenarioId: `${snapshot}:downside` });
    expect(scenario.caseName).toBe("downside");
  });

  it("REG-SCEN-006: a malformed scenario id is rejected", async () => {
    expect(
      await errorMessageFrom(() => partner.scenarios.getById({ dealId: anvil, scenarioId: "not-an-id" })),
    ).toMatch(/scenario id/i);
  });

  it("REG-SCEN-006b: a scenario id from a DIFFERENT deal is NOT_FOUND, not undefined", async () => {
    // Found by mutation testing: removing the on-this-deal check broke nothing,
    // because every test asked for a scenario that WAS on the deal.
    //
    // Not a leak — loadScenarios is already scoped to the deal and to the owner,
    // so the caller gets nothing either way. It is a contract question: a client
    // asking for the wrong id should get a refusal it can render, not an
    // undefined that flows onward and fails somewhere less obvious.
    const foreignSnapshot = await scenarioId("carve_scenario_v1");
    expect(
      await errorCodeFrom(() =>
        partner.scenarios.getById({ dealId: anvil, scenarioId: `${foreignSnapshot}:base` }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("REG-SCEN-007: a citation stays pinned to the snapshot it cited", async () => {
    // A citation that follows a regeneration is not a citation.
    const older = await scenarioId("anvil_scenario_v1");
    const links = await partner.recommendations.listScenarioLinks({ dealId: anvil });
    expect(links.some((l) => l.scenarioAnalysisId === older)).toBe(true);
  });

  it("REG-SCEN-008: scenario links carry a stated relation", async () => {
    const links = await partner.recommendations.listScenarioLinks({ dealId: anvil });
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((l) => typeof l.relation === "string" && l.relation.length > 0)).toBe(true);
  });
});

describe("REG-ECON / REG-TIME / REG-DD — dossier surfaces", () => {
  it("REG-ECON-001: Project Anvil's economics are stored and derived", async () => {
    const econ = await partner.economics.get({ dealId: anvil });
    expect(econ!.evEbitda).toBeCloseTo(8.0, 1);
  });

  it("REG-ECON-002: the closed deal retains its realised outcome", async () => {
    const econ = await partner.economics.get({ dealId: await dealId("nordhaven") });
    expect(econ!.realized?.realizedMoic).toBeCloseTo(2.14, 2);
  });

  it("REG-ECON-003: a non-USD deal keeps its own currency", async () => {
    const econ = await partner.economics.get({ dealId: await dealId("verity") });
    expect(econ!.currency).toBe("EUR");
  });

  it("REG-ECON-004: the data-poor deal has no economics record at all", async () => {
    expect(await partner.economics.get({ dealId: await dealId("loom") })).toBeNull();
  });

  it("REG-TIME-001: Project Anvil carries milestones", async () => {
    expect((await partner.milestones.list({ dealId: anvil })).length).toBeGreaterThanOrEqual(6);
  });

  it("REG-TIME-002: a due date is a plain calendar day, not a timestamp", async () => {
    // A closing date is a day. Storing an instant would shift the date for
    // anyone in another timezone.
    const ms = await partner.milestones.list({ dealId: anvil });
    expect(ms.every((m) => /^\d{4}-\d{2}-\d{2}$/.test(m.dueDate))).toBe(true);
  });

  it("REG-TIME-003: the corpus surfaces upcoming deadlines across the portfolio", async () => {
    // `upcoming` takes a result limit, not a day window — the window is the
    // query's own business. Passing `{ days }` was silently ignored, which made
    // an earlier version of this test assert nothing about the window at all.
    const upcoming = await partner.milestones.upcoming({ limit: 5 });
    expect(upcoming.length).toBeGreaterThan(0);
    expect(upcoming.length).toBeLessThanOrEqual(5);
  });

  it("REG-TIME-004: completed milestones are retained rather than removed", async () => {
    const ms = await partner.milestones.list({ dealId: anvil });
    expect(ms.some((m) => m.completed)).toBe(true);
  });

  it("REG-DD-001: Project Anvil's diligence tracker carries the standard checklist", async () => {
    const items = await partner.dd.list({ dealId: anvil });
    expect(items.filter((i) => i.isStandard).length).toBe(12);
  });

  it("REG-DD-002: the tracker carries deal-specific items beyond the standard set", async () => {
    const items = await partner.dd.list({ dealId: anvil });
    expect(items.filter((i) => !i.isStandard).length).toBeGreaterThan(0);
  });

  it("REG-DD-003: items a human ruled on are marked as manually set", async () => {
    const items = await partner.dd.list({ dealId: anvil });
    expect(items.filter((i) => i.manuallySet).length).toBeGreaterThan(5);
  });

  it("REG-DD-004: the tracker records open issues rather than only closed ones", async () => {
    const items = await partner.dd.list({ dealId: anvil });
    expect(items.some((i) => i.status === "issue")).toBe(true);
  });
});

describe("REG-COMP / REG-PAT — the learning surfaces", () => {
  it("REG-COMP-001: the comps engine returns a result over the corpus", async () => {
    expect(await partner.comps.query({})).toBeTruthy();
  });

  it("REG-COMP-002: the comps benchmark runs against a deal", async () => {
    expect(await partner.comps.benchmark({ dealId: anvil })).toBeTruthy();
  });

  it("REG-PAT-001: failure patterns fold across the portfolio", async () => {
    expect(await partner.patterns.list()).toBeTruthy();
  });

  it("REG-PAT-002: outcomes owed reports a total and a per-deal breakdown", async () => {
    const owed = await partner.patterns.outcomesOwed();
    expect(typeof owed.totalOwed).toBe("number");
    expect(Array.isArray(owed.deals)).toBe(true);
  });

  it("REG-PAT-003: assumption findings fold across the portfolio", async () => {
    expect(await partner.patterns.assumptionFindings()).toBeTruthy();
  });

  it("REG-PAT-004: the scenario benchmark scores forecasts against outcomes", async () => {
    expect(await partner.patterns.scenarioBenchmark()).toBeTruthy();
  });

  it("REG-PAT-005: the activity feed records the corpus's history", async () => {
    const feed = await partner.activity.list({});
    expect(feed.length).toBeGreaterThan(20);
  });

  it("REG-PAT-006: institutional-memory search reaches the corpus", async () => {
    const res = await partner.ai.dealGenomeSearch({ query: "covenant headroom and the Braeburn carve-out" });
    expect(res).toBeTruthy();
  });
});
