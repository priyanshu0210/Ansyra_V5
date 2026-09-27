import { describe, expect, it } from "vitest";
import { RECOMMENDATION_STATUSES } from "./recommendations";
import {
  OUTCOME_HORIZONS,
  OUTCOME_HORIZON_LABELS,
  OUTCOME_SIGNAL,
  OUTCOME_TYPES,
  OUTCOME_TYPE_LABELS,
  canRecordOutcome,
  highSignalLabel,
  isHighSignal,
  latestOutcome,
  outcomeTrajectory,
  reviewStatus,
  reviewStatusMessage,
} from "./outcomes";

const NOW = new Date("2026-08-05T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const read = (type: string, recordedAt: Date | string) => ({ outcomeType: type, recordedAt });

describe("canRecordOutcome", () => {
  it("refuses a draft — nobody has claimed it, so nothing can have been right or wrong", () => {
    expect(canRecordOutcome("draft")).toBe(false);
  });

  it("allows every decided status, rejected and superseded included", () => {
    expect(canRecordOutcome("accepted")).toBe(true);
    expect(canRecordOutcome("rejected")).toBe(true);
    expect(canRecordOutcome("superseded")).toBe(true);
  });
});

describe("outcomeTrajectory", () => {
  it("orders by the date of the reading, ascending", () => {
    const out = outcomeTrajectory([
      read("contradicted", daysAgo(1)),
      read("held", daysAgo(90)),
      read("too_early", daysAgo(30)),
    ]);
    expect(out.map((o) => o.outcomeType)).toEqual(["held", "too_early", "contradicted"]);
  });

  it("does not mutate the input", () => {
    const rows = [read("contradicted", daysAgo(1)), read("held", daysAgo(90))];
    outcomeTrajectory(rows);
    expect(rows[0].outcomeType).toBe("contradicted");
  });

  it("handles ISO strings as well as Dates", () => {
    const out = outcomeTrajectory([
      read("contradicted", daysAgo(1).toISOString()),
      read("held", daysAgo(90).toISOString()),
    ]);
    expect(out[0].outcomeType).toBe("held");
  });
});

describe("latestOutcome", () => {
  it("returns the most recent reading, not the last inserted", () => {
    expect(latestOutcome([read("held", daysAgo(90)), read("contradicted", daysAgo(1))])?.outcomeType).toBe(
      "contradicted",
    );
    expect(latestOutcome([read("contradicted", daysAgo(1)), read("held", daysAgo(90))])?.outcomeType).toBe(
      "contradicted",
    );
  });

  it("is null for an empty ledger", () => {
    expect(latestOutcome([])).toBeNull();
  });
});

describe("reviewStatus", () => {
  it("says not_decided for a draft, whatever the ledger holds", () => {
    const s = reviewStatus({ status: "draft", decidedAt: null }, [read("held", daysAgo(1))], NOW);
    expect(s.state).toBe("not_decided");
  });

  it("distinguishes never-reviewed from reviewed — the whole point of the ledger", () => {
    expect(reviewStatus({ status: "accepted", decidedAt: daysAgo(47) }, [], NOW)).toEqual({
      state: "never_reviewed",
      reads: 0,
      daysSinceDecision: 47,
      daysSinceLastRead: null,
    });
    expect(
      reviewStatus({ status: "accepted", decidedAt: daysAgo(47) }, [read("held", daysAgo(12))], NOW),
    ).toEqual({ state: "reviewed", reads: 1, daysSinceDecision: 47, daysSinceLastRead: 12 });
  });

  it("counts every read but dates only the latest", () => {
    const s = reviewStatus(
      { status: "accepted", decidedAt: daysAgo(200) },
      [read("too_early", daysAgo(170)), read("held", daysAgo(90)), read("contradicted", daysAgo(3))],
      NOW,
    );
    expect(s).toMatchObject({ reads: 3, daysSinceLastRead: 3 });
  });

  it("survives a missing or unparseable decision date", () => {
    expect(reviewStatus({ status: "accepted" }, [], NOW).daysSinceDecision).toBeNull();
    expect(reviewStatus({ status: "accepted", decidedAt: "nonsense" }, [], NOW).daysSinceDecision).toBeNull();
  });
});

describe("reviewStatusMessage", () => {
  const s = (rec: Parameters<typeof reviewStatus>[0], rows: Parameters<typeof reviewStatus>[1]) =>
    reviewStatus(rec, rows, NOW);

  it("says nothing about an undecided draft", () => {
    expect(reviewStatusMessage(s({ status: "draft" }, []))).toBeNull();
  });

  it("names the gap when nobody has gone back to look", () => {
    expect(reviewStatusMessage(s({ status: "accepted", decidedAt: daysAgo(47) }, []))).toBe(
      "Decided 47 days ago · never reviewed",
    );
  });

  it("says 'today' rather than '0 days ago', which nobody says", () => {
    expect(reviewStatusMessage(s({ status: "accepted", decidedAt: daysAgo(0) }, []))).toBe(
      "Decided today · never reviewed",
    );
    expect(
      reviewStatusMessage(s({ status: "rejected", decidedAt: daysAgo(3) }, [read("held", daysAgo(0))]), "held"),
    ).toBe("1 read · last: held, today");
  });

  it("reports the count and the latest verdict", () => {
    const msg = reviewStatusMessage(
      s({ status: "accepted", decidedAt: daysAgo(47) }, [read("held", daysAgo(12))]),
      "held",
    );
    expect(msg).toBe("1 read · last: held, 12 days ago");
  });

  it("agrees with itself on singular and plural", () => {
    const two = s({ status: "accepted", decidedAt: daysAgo(47) }, [
      read("held", daysAgo(30)),
      read("contradicted", daysAgo(1)),
    ]);
    expect(reviewStatusMessage(two, "contradicted")).toBe("2 reads · last: contradicted, 1 day ago");
  });
});

describe("isHighSignal", () => {
  it("fires on exactly two of the twenty combinations", () => {
    const hits: string[] = [];
    for (const status of RECOMMENDATION_STATUSES) {
      for (const type of OUTCOME_TYPES) {
        if (isHighSignal(status, type)) hits.push(`${status}+${type}`);
      }
    }
    // A rejected claim that held, and an accepted claim that did not: the only
    // two rows that say the firm's judgement was wrong in a dated, attributable
    // way. Everything else is either agreement or not yet knowable.
    expect(hits).toEqual(["accepted+contradicted", "rejected+held"]);
  });

  it("does not fire on a draft that was never decided", () => {
    expect(isHighSignal("draft", "held")).toBe(false);
    expect(isHighSignal("draft", "contradicted")).toBe(false);
  });
});

describe("highSignalLabel", () => {
  it("says which way the firm was wrong", () => {
    expect(highSignalLabel("rejected")).toBe("Rejected — and it held.");
    expect(highSignalLabel("accepted")).toBe("Accepted — and it did not.");
  });
});

describe("the vocabularies stay total", () => {
  // The Record<> types already force this at compile time; the test catches a
  // widened type or a hand-written map that drifted.
  it("labels and signals every outcome type", () => {
    for (const t of OUTCOME_TYPES) {
      expect(OUTCOME_TYPE_LABELS[t]?.length).toBeGreaterThan(0);
      expect(["positive", "negative", "neutral"]).toContain(OUTCOME_SIGNAL[t]);
    }
  });

  it("labels every horizon", () => {
    for (const h of OUTCOME_HORIZONS) expect(OUTCOME_HORIZON_LABELS[h]?.length).toBeGreaterThan(0);
  });

  it("keeps too_early, without which an honest early read has no expression", () => {
    expect(OUTCOME_TYPES).toContain("too_early");
    expect(OUTCOME_SIGNAL.too_early).toBe("neutral");
  });
});
