import { describe, expect, it } from "vitest";
import {
  SCENARIO_LINK_CASES,
  SCENARIO_LINK_CASE_LABELS,
  SCENARIO_RELATIONS,
  SCENARIO_RELATION_HINTS,
  SCENARIO_RELATION_LABELS,
  linkStaleness,
  linkStalenessMessage,
} from "./scenario-links";

const snaps = (...ids: number[]) => ids.map((id) => ({ id }));

describe("linkStaleness", () => {
  it("is fresh when the cited run is the latest", () => {
    expect(linkStaleness(9, snaps(9, 7, 4))).toEqual({
      stale: false,
      newerCount: 0,
      latestId: 9,
      missing: false,
    });
  });

  it("counts how many runs have happened since", () => {
    expect(linkStaleness(4, snaps(9, 7, 4))).toMatchObject({ stale: true, newerCount: 2, latestId: 9 });
  });

  it("compares ids, not order — the caller's list may be in any order", () => {
    expect(linkStaleness(4, snaps(4, 7, 9))).toMatchObject({ newerCount: 2 });
    expect(linkStaleness(4, snaps(9, 4, 7))).toMatchObject({ newerCount: 2 });
  });

  it("flags a cited run that is no longer on file", () => {
    expect(linkStaleness(4, snaps(9, 7))).toMatchObject({ missing: true, newerCount: 2 });
  });

  it("treats an empty snapshot list as missing rather than fresh", () => {
    // Fresh would be a lie: there is no run to have cited.
    expect(linkStaleness(4, [])).toEqual({ stale: false, newerCount: 0, latestId: null, missing: true });
  });

  it("is fresh for the only run on the deal", () => {
    expect(linkStaleness(1, snaps(1))).toMatchObject({ stale: false, missing: false, latestId: 1 });
  });
});

describe("linkStalenessMessage", () => {
  it("says nothing when the citation is current", () => {
    expect(linkStalenessMessage(linkStaleness(9, snaps(9, 4)))).toBeNull();
  });

  it("names the count and reassures that the link did not move", () => {
    const msg = linkStalenessMessage(linkStaleness(4, snaps(9, 7, 4)))!;
    expect(msg).toContain("2 newer since");
    expect(msg).toContain("what was actually cited");
  });

  it("agrees with itself on singular and plural", () => {
    expect(linkStalenessMessage(linkStaleness(7, snaps(9, 7)))).toContain("1 newer since");
  });

  it("prefers the missing message over the stale one", () => {
    expect(linkStalenessMessage(linkStaleness(4, snaps(9, 7)))).toBe(
      "The scenario run this cites is no longer on file.",
    );
  });
});

describe("the vocabularies stay total", () => {
  it("labels every case, and calls the whole-run option something a human would say", () => {
    for (const c of SCENARIO_LINK_CASES) expect(SCENARIO_LINK_CASE_LABELS[c]?.length).toBeGreaterThan(0);
    expect(SCENARIO_LINK_CASE_LABELS.all).toBe("Whole run");
  });

  it("labels and explains every relation — an unexplained vocabulary is unusable", () => {
    for (const r of SCENARIO_RELATIONS) {
      expect(SCENARIO_RELATION_LABELS[r]?.length).toBeGreaterThan(0);
      expect(SCENARIO_RELATION_HINTS[r]?.length).toBeGreaterThan(0);
    }
  });

  it("keeps relevant_if_false, the relation the whole feature was asked for", () => {
    expect(SCENARIO_RELATIONS).toContain("relevant_if_false");
    expect(SCENARIO_RELATION_HINTS.relevant_if_false).toContain("wrong");
  });

  it("keeps the case names in step with the scenario engine's own three", () => {
    // ScenarioResult.cases are base | upside | downside; "all" is ours.
    expect([...SCENARIO_LINK_CASES].sort()).toEqual(["all", "base", "downside", "upside"]);
  });
});
