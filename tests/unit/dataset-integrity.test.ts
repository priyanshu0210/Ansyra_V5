import { describe, expect, it } from "vitest";
import {
  DATASET_VERSION,
  SEED_ASSUMPTIONS,
  SEED_DEALS,
  SEED_DOCUMENTS,
  SEED_TARGETS,
  datasetManifest,
  validateDataset,
} from "@fixtures/thornevale/index";

// The corpus checks itself, in CI, with no database.
//
// This matters more than it sounds. The fixture's own validator caught a real
// problem on first run: four deals were sitting at stages the recommendation
// gate says are unreachable, because they carried conclusions filed at the stage
// they had ARRIVED at rather than the stage they LEFT. Every gate test written
// against that corpus would have been asserting a lie and passing.

describe("the dataset satisfies its own rules", () => {
  it("has no integrity problems", () => {
    // Reported as a list rather than one failure at a time, so a broken fixture
    // tells you everything wrong with it in a single run.
    expect(validateDataset()).toEqual([]);
  });

  it("is versioned, so a future run can be diffed against this one", () => {
    expect(DATASET_VERSION).toBe("thornevale-v1");
  });
});

describe("the corpus is big enough to be worth running against", () => {
  const m = datasetManifest();

  it("covers a full twenty-five year operating history", () => {
    expect(m.annualYears).toBe(25);
  });

  it("carries recent quarterly detail as well as annual history", () => {
    expect(m.quarters).toBeGreaterThanOrEqual(8);
  });

  it("spans every deal stage", () => {
    const stages = new Set(SEED_DEALS.map((d) => d.stage));
    for (const s of ["sourcing", "evaluation", "diligence", "negotiation", "closing", "integration"]) {
      expect(stages.has(s as "sourcing")).toBe(true);
    }
  });

  it("includes a completed deal and a cancelled one", () => {
    const statuses = new Set(SEED_DEALS.map((d) => d.status));
    // Without a completed deal the comps engine has no precedent; without a
    // cancelled one the failure-pattern detector has no negative signal.
    expect(statuses.has("completed")).toBe(true);
    expect(statuses.has("cancelled")).toBe(true);
  });

  it("has a data room with all three supported document formats", () => {
    const mimes = new Set(SEED_DOCUMENTS.map((d) => d.mime));
    expect(mimes.size).toBe(3);
  });
});

describe("the edge cases are actually present", () => {
  it("includes a deal with no value at all", () => {
    expect(SEED_DEALS.some((d) => d.value === null)).toBe(true);
  });

  it("includes a deal with no economics record", () => {
    expect(SEED_DEALS.some((d) => d.economics === null)).toBe(true);
  });

  it("includes a target with a missing EBITDA and one with a zero EBITDA", () => {
    // These reach DIFFERENT branches of computeMultiples — the null-denominator
    // branch and the non-positive-denominator branch — and a corpus with only
    // one of them leaves the other untested.
    expect(SEED_TARGETS.some((t) => t.ebitda === null)).toBe(true);
    expect(SEED_TARGETS.some((t) => t.ebitda === "$0M")).toBe(true);
  });

  it("includes a duplicated customer entity under two spellings", () => {
    const torvald = SEED_TARGETS.filter((t) => /torvald/i.test(t.name));
    expect(torvald.length).toBe(2);
    expect(torvald[0].name).not.toBe(torvald[1].name);
  });

  it("includes an assumption with no category, modelling a pre-15.15 row", () => {
    // The schema is explicit that these must read as "other" and must NOT be
    // back-filled by guessing at the statement text, so one has to exist.
    expect(SEED_ASSUMPTIONS.some((a) => a.category === null)).toBe(true);
  });

  it("includes assumptions the AI never scored", () => {
    // An unscored row must not block advancement. The gate exists to force an
    // answer to a challenge that was made, not to punish a row nobody reached.
    expect(SEED_ASSUMPTIONS.some((a) => a.result === null)).toBe(true);
  });

  it("includes a truncated document and an empty one", () => {
    const defects = new Set(SEED_DOCUMENTS.map((d) => d.defect).filter(Boolean));
    expect(defects.has("truncated")).toBe(true);
    expect(defects.has("empty")).toBe(true);
  });

  it("includes documents that contradict each other and documents that are stale", () => {
    const defects = SEED_DOCUMENTS.map((d) => d.defect);
    expect(defects.filter((d) => d === "contradictory").length).toBeGreaterThanOrEqual(2);
    expect(defects.filter((d) => d === "stale").length).toBeGreaterThanOrEqual(2);
  });
});
