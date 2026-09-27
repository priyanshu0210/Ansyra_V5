import { describe, expect, it } from "vitest";
import {
  ddProgress,
  mergeDdAnalysis,
  workstreamFor,
  type DdTrackerItem,
} from "./dd-merge";

const TODAY = "2026-07-20";

const untouched = (id: number, item: string, extra: Partial<DdTrackerItem> = {}): DdTrackerItem => ({
  id,
  item,
  status: "open",
  note: null,
  manuallySet: false,
  ...extra,
});

describe("workstreamFor", () => {
  it("maps standard items to their workstream", () => {
    expect(workstreamFor("Financial statements (3 years)")).toBe("financial");
    expect(workstreamFor("Tax filings & liabilities")).toBe("tax");
    expect(workstreamFor("Employment agreements & benefits")).toBe("hr");
  });
  it("falls back to other for custom items", () => {
    expect(workstreamFor("Board minutes 2019")).toBe("other");
  });
});

describe("mergeDdAnalysis", () => {
  it("fills untouched items: present -> received, unclear -> issue", () => {
    const items = [untouched(1, "Material contracts"), untouched(2, "Insurance policies")];
    const r = mergeDdAnalysis(
      items,
      [
        { item: "Material contracts", status: "present", note: "12 MSAs found" },
        { item: "Insurance policies", status: "unclear", note: "Policy schedule incomplete" },
      ],
      TODAY,
    );
    expect(r.filled).toBe(2);
    expect(r.skippedManual).toBe(0);
    expect(r.patches.find((p) => p.id === 1)?.status).toBe("received");
    expect(r.patches.find((p) => p.id === 2)?.status).toBe("issue");
  });

  it("leaves a 'missing' item open — the gap is the signal", () => {
    const r = mergeDdAnalysis(
      [untouched(1, "Environmental liabilities")],
      [{ item: "Environmental liabilities", status: "missing", note: "Not in the data room" }],
      TODAY,
    );
    // Note recorded, but no status change.
    expect(r.patches[0].status).toBeUndefined();
    expect(r.patches[0].note).toContain("AI (2026-07-20): Not in the data room");
  });

  it("NEVER overwrites a status a human set — the core invariant", () => {
    const items = [
      untouched(1, "Financial statements (3 years)", { status: "reviewed", manuallySet: true }),
    ];
    const r = mergeDdAnalysis(
      items,
      [{ item: "Financial statements (3 years)", status: "unclear", note: "Only 2 years present" }],
      TODAY,
    );
    expect(r.skippedManual).toBe(1);
    expect(r.filled).toBe(0);
    // The one permitted change is the appended note.
    expect(r.patches).toHaveLength(1);
    expect(r.patches[0].status).toBeUndefined();
    expect(r.patches[0].note).toContain("AI (2026-07-20): Only 2 years present");
  });

  it("appends notes rather than replacing them", () => {
    const items = [untouched(1, "Material contracts", { note: "Requested from seller 14 Jul" })];
    const r = mergeDdAnalysis(
      items,
      [{ item: "Material contracts", status: "present", note: "12 MSAs found" }],
      TODAY,
    );
    expect(r.patches[0].note).toBe("Requested from seller 14 Jul\nAI (2026-07-20): 12 MSAs found");
  });

  it("reports analysis rows with no tracker item instead of dropping them", () => {
    const r = mergeDdAnalysis(
      [untouched(1, "Material contracts")],
      [
        { item: "Material contracts", status: "present" },
        { item: "Cyber insurance addendum", status: "unclear" },
      ],
      TODAY,
    );
    expect(r.unmatched).toEqual(["Cyber insurance addendum"]);
  });

  it("matches item text case- and whitespace-insensitively", () => {
    const r = mergeDdAnalysis(
      [untouched(1, "Material contracts")],
      [{ item: "  MATERIAL CONTRACTS ", status: "present", note: "ok" }],
      TODAY,
    );
    expect(r.filled).toBe(1);
    expect(r.unmatched).toEqual([]);
  });

  it("produces no patch when there is nothing to change", () => {
    const items = [untouched(1, "Material contracts", { status: "received" })];
    const r = mergeDdAnalysis(items, [{ item: "Material contracts", status: "present" }], TODAY);
    expect(r.patches).toHaveLength(0);
    expect(r.filled).toBe(0);
  });

  it("ignores unknown AI verdicts and blank item names", () => {
    const r = mergeDdAnalysis(
      [untouched(1, "Material contracts")],
      [{ item: "", status: "present" }, { item: "Material contracts", status: "banana" }],
      TODAY,
    );
    expect(r.patches).toHaveLength(0);
  });
});

describe("ddProgress", () => {
  it("counts anything not open as progressed", () => {
    expect(
      ddProgress([{ status: "open" }, { status: "received" }, { status: "n_a" }, { status: "issue" }]),
    ).toEqual({ done: 3, total: 4 });
  });
  it("handles an empty set", () => {
    expect(ddProgress([])).toEqual({ done: 0, total: 0 });
  });
});
