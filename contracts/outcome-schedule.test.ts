import { describe, expect, it } from "vitest";
import { canRecordOutcome } from "./outcomes";
import {
  MIN_HIGH_SIGNAL,
  MIN_PATTERN_SUPPORT,
  foldPatterns,
  type PatternCell,
} from "./failure-patterns";
import {
  SCHEDULED_HORIZONS,
  addDays,
  addMonths,
  foldOwed,
  horizonDueDate,
  horizonStates,
  isoDateOf,
  owedCount,
  owedLabel,
  pickCloseDate,
  scheduledHorizons,
  summariseSchedule,
  type OwedRow,
  type ScheduleOutcomeRow,
} from "./outcome-schedule";

// The engine is entirely here. api/queries/outcomes-owed.ts returns transport
// rows and computes nothing — it is guarded separately, at the source level, by
// api/outcomes-owed.wiring.test.ts (scope, demo exclusion, and the absence of
// any date arithmetic or horizon literal in SQL).

const DECIDED = "2026-01-15T22:40:00.000Z"; // late evening UTC, on purpose
const NOW = "2026-04-20";

const rec = (over: Partial<Parameters<typeof scheduledHorizons>[0]> = {}) => ({
  status: "accepted",
  decidedAt: DECIDED,
  ...over,
});

const read = (horizon: string | null, over: Partial<ScheduleOutcomeRow> = {}): ScheduleOutcomeRow => ({
  id: 1,
  horizon,
  outcomeType: "held",
  ...over,
});

describe("addMonths — calendar months, clamped", () => {
  it("clamps month-end rather than rolling into the next month", () => {
    // Date's own rollover would give 2026-03-03 here. Nobody writes that date.
    expect(addMonths("2025-08-31", 6)).toBe("2026-02-28");
    expect(addMonths("2023-10-31", 6)).toBe("2024-04-30");
  });

  it("lands on 29 February in a leap year", () => {
    expect(addMonths("2023-08-31", 6)).toBe("2024-02-29");
  });

  it("leaves a mid-month date alone", () => {
    expect(addMonths("2025-07-15", 6)).toBe("2026-01-15");
  });

  it("rolls the year in both directions", () => {
    expect(addMonths("2025-11-10", 6)).toBe("2026-05-10");
    expect(addMonths("2026-02-10", -6)).toBe("2025-08-10");
  });

  // The assertion that stops someone "simplifying" this back to arithmetic.
  it("is NOT 180 days", () => {
    expect(addMonths("2025-08-31", 6)).not.toBe(addDays("2025-08-31", 180));
  });

  it("returns null on an unparseable date rather than a bad one", () => {
    expect(addMonths("not-a-date", 6)).toBeNull();
    expect(addDays("not-a-date", 30)).toBeNull();
  });
});

describe("isoDateOf", () => {
  it("reads UTC, so one accept falls due on one day for the whole firm", () => {
    // Local getters would put this late-evening instant on the 16th for a reader
    // east of Greenwich, and two colleagues would then see different due dates.
    expect(isoDateOf(DECIDED)).toBe("2026-01-15");
  });

  it("is null for null and for nonsense", () => {
    expect(isoDateOf(null)).toBeNull();
    expect(isoDateOf(undefined)).toBeNull();
    expect(isoDateOf("nonsense")).toBeNull();
  });
});

describe("scheduledHorizons — who owes", () => {
  it("schedules accepted AND rejected", () => {
    expect(scheduledHorizons(rec())).toEqual([...SCHEDULED_HORIZONS]);
    expect(scheduledHorizons(rec({ status: "rejected" }))).toEqual([...SCHEDULED_HORIZONS]);
  });

  it("schedules nothing for a draft — nobody has claimed it", () => {
    expect(scheduledHorizons(rec({ status: "draft", decidedAt: null }))).toEqual([]);
  });

  // The permitted/owed distinction, pinned in one test so neither drifts.
  it("owes nothing on a superseded row, while still PERMITTING a read on it", () => {
    expect(scheduledHorizons(rec({ status: "superseded" }))).toEqual([]);
    expect(canRecordOutcome("superseded")).toBe(true);
  });

  it("schedules nothing without a decision date", () => {
    expect(scheduledHorizons(rec({ decidedAt: null }))).toEqual([]);
    expect(scheduledHorizons(rec({ decidedAt: "nonsense" }))).toEqual([]);
  });

  it("never schedules ad_hoc — an off-schedule read cannot be owed", () => {
    expect(SCHEDULED_HORIZONS).not.toContain("ad_hoc");
  });
});

describe("horizonDueDate", () => {
  it("counts the day horizons from the decision", () => {
    expect(horizonDueDate("30_day", rec())).toBe("2026-02-14");
    expect(horizonDueDate("90_day", rec())).toBe("2026-04-15");
  });

  it("counts the six-month horizon in calendar months", () => {
    expect(horizonDueDate("6_month", rec())).toBe("2026-07-15");
  });

  it("counts post-close from the close date, not the decision", () => {
    expect(horizonDueDate("post_close", rec(), "2026-09-30")).toBe("2026-09-30");
  });

  it("has no post-close date without a close date, and never invents one", () => {
    expect(horizonDueDate("post_close", rec())).toBeNull();
    expect(horizonDueDate("post_close", rec(), null)).toBeNull();
  });
});

describe("horizonStates", () => {
  const states = (outcomes: ScheduleOutcomeRow[] = [], closeDate?: string | null, now = NOW) =>
    Object.fromEntries(horizonStates(rec(), outcomes, closeDate, now).map((s) => [s.horizon, s]));

  it("reads past horizons as due and future ones as upcoming", () => {
    const s = states();
    expect(s["30_day"].state).toBe("due"); // 2026-02-14, now 2026-04-20
    expect(s["90_day"].state).toBe("due"); // 2026-04-15
    expect(s["6_month"].state).toBe("upcoming"); // 2026-07-15
  });

  it("treats the due date itself as a day you owe", () => {
    expect(states([], null, "2026-02-14")["30_day"].state).toBe("due");
    expect(states([], null, "2026-02-13")["30_day"].state).toBe("upcoming");
  });

  it("signs daysUntilDue so callers can render overdue without a fifth state", () => {
    expect(states()["30_day"].daysUntilDue).toBe(-65);
    expect(states()["6_month"].daysUntilDue).toBeGreaterThan(0);
  });

  it("completes a horizon on an exact label match, and carries the outcome id", () => {
    const s = states([read("30_day", { id: 77 })]);
    expect(s["30_day"].state).toBe("completed");
    expect(s["30_day"].satisfiedByOutcomeId).toBe(77);
    expect(s["90_day"].state).toBe("due");
  });

  // The schema's own rule: recordedAt is user-settable, so the LABEL decides.
  it("completes on the label however late the write, and never on date proximity", () => {
    // A 30-day read written up 200 days later still completes the 30-day horizon.
    expect(states([read("30_day")])["30_day"].state).toBe("completed");
    // A 90-day read filed on day 3 completes the 90-day horizon, not the 30-day.
    const s = states([read("90_day")]);
    expect(s["90_day"].state).toBe("completed");
    expect(s["30_day"].state).toBe("due");
  });

  it("credits nothing to a read that names no horizon", () => {
    const s = states([read(null), read("ad_hoc")]);
    expect(s["30_day"].state).toBe("due");
    expect(s["90_day"].state).toBe("due");
  });

  it("reports post-close as unanchored without a close date, never as owed", () => {
    const s = states([], null);
    expect(s.post_close.state).toBe("unanchored");
    expect(s.post_close.dueDate).toBeNull();
    expect(s.post_close.daysUntilDue).toBeNull();
    expect(owedCount(Object.values(s))).toBe(2); // 30_day + 90_day only
  });

  it("lets a filed post-close read beat unanchored — the work was done", () => {
    expect(states([read("post_close")], null).post_close.state).toBe("completed");
  });

  it("schedules post-close once a close date exists", () => {
    expect(states([], "2026-03-01").post_close.state).toBe("due");
    expect(states([], "2026-12-01").post_close.state).toBe("upcoming");
  });

  it("closes every remaining horizon when the claim goes moot", () => {
    const s = states([read(null, { id: 9, outcomeType: "moot" })]);
    for (const h of SCHEDULED_HORIZONS) {
      expect(s[h].state).toBe("completed");
      expect(s[h].closedAsMoot).toBe(true);
      expect(s[h].satisfiedByOutcomeId).toBe(9);
    }
  });

  it("lets an explicit read outrank the moot closure for its own horizon", () => {
    const s = states([read("30_day", { id: 3 }), read(null, { id: 9, outcomeType: "moot" })]);
    expect(s["30_day"].satisfiedByOutcomeId).toBe(3);
    expect(s["30_day"].closedAsMoot).toBeUndefined();
    expect(s["90_day"].closedAsMoot).toBe(true);
  });

  it("returns nothing at all for a row that owes nothing", () => {
    expect(horizonStates(rec({ status: "draft", decidedAt: null }), [], null, NOW)).toEqual([]);
  });
});

describe("summariseSchedule", () => {
  it("counts each state, and reports unlabelled reads separately", () => {
    const outcomes = [read("30_day"), read(null), read(null)];
    const s = summariseSchedule(horizonStates(rec(), outcomes, null, NOW), outcomes);
    expect(s).toMatchObject({ owed: 1, upcoming: 1, completed: 1, unanchored: 1, unlabelled: 2 });
    expect(s.byHorizon).toEqual({ "90_day": 1 });
  });

  it("reports the oldest overdue read", () => {
    const s = summariseSchedule(horizonStates(rec(), [], null, NOW));
    expect(s.mostOverdueDays).toBe(65); // the 30-day, 2026-02-14 → 2026-04-20
  });

  it("has no overdue days when nothing is owed", () => {
    const s = summariseSchedule(horizonStates(rec(), [], null, "2026-01-16"));
    expect(s.owed).toBe(0);
    expect(s.mostOverdueDays).toBeNull();
  });
});

describe("owedLabel", () => {
  it("says nothing when nothing is owed, so no empty chip renders", () => {
    expect(owedLabel(summariseSchedule(horizonStates(rec(), [], null, "2026-01-16")))).toBeNull();
  });

  it("names the count and the oldest overdue read", () => {
    expect(owedLabel(summariseSchedule(horizonStates(rec(), [], null, NOW)))).toBe(
      "2 reads owed — the oldest is 65 days overdue",
    );
  });
});

describe("pickCloseDate — several closing milestones, no unique constraint", () => {
  const ms = (id: number, dueDate: string, completed = false) => ({ id, dueDate, completed });

  it("is null with nothing on file, and never invents a date", () => {
    expect(pickCloseDate([])).toBeNull();
  });

  it("prefers a close that happened over one that is merely planned", () => {
    // Even though the planned date is later.
    expect(pickCloseDate([ms(1, "2026-03-01", true), ms(2, "2026-09-01")])).toEqual({
      closeDate: "2026-03-01",
      closeSource: "closed",
    });
  });

  it("takes the latest of several planned dates — a slipped close, not an earlier one", () => {
    expect(pickCloseDate([ms(1, "2026-03-01"), ms(2, "2026-06-01")])).toMatchObject({
      closeDate: "2026-06-01",
      closeSource: "planned",
    });
  });

  it("breaks a tie on the highest id", () => {
    expect(pickCloseDate([ms(1, "2026-03-01"), ms(5, "2026-03-01")])?.closeDate).toBe("2026-03-01");
  });
});

describe("foldOwed — the firm's queue", () => {
  const row = (over: Partial<OwedRow> = {}): OwedRow => ({
    recommendationId: 1,
    dealId: 10,
    dealName: "Halden",
    status: "accepted",
    decidedAt: DECIDED,
    stage: "diligence",
    loggedHorizons: [],
    hasMoot: false,
    closeDate: null,
    closeSource: null,
    ...over,
  });

  it("groups by deal and counts owed reads per horizon", () => {
    const out = foldOwed([row(), row({ recommendationId: 2 })], NOW);
    expect(out.totalOwed).toBe(4); // two rows × (30_day + 90_day)
    expect(out.byHorizon).toEqual({ "30_day": 2, "90_day": 2 });
    expect(out.deals).toHaveLength(1);
    expect(out.deals[0]).toMatchObject({ dealId: 10, owed: 4, recommendationIds: [1, 2] });
  });

  it("never counts an unanchored post-close as owed, but does report the deal", () => {
    const out = foldOwed([row()], NOW);
    expect(out.deals[0].unanchoredPostClose).toBe(true);
    expect(out.unanchoredDeals).toBe(1);
    expect(out.byHorizon.post_close).toBeUndefined();
  });

  it("drops a deal that owes nothing and is fully anchored", () => {
    const out = foldOwed(
      [row({ loggedHorizons: ["30_day", "90_day", "6_month", "post_close"], closeDate: "2026-03-01" })],
      NOW,
    );
    expect(out.deals).toEqual([]);
    expect(out.totalOwed).toBe(0);
  });

  it("ignores rows that owe nothing at all", () => {
    expect(foldOwed([row({ status: "superseded" }), row({ status: "draft" })], NOW).totalOwed).toBe(0);
  });

  it("orders the busiest deal first, ties by name, so two runs agree", () => {
    const out = foldOwed(
      [
        row({ dealId: 1, dealName: "Zephyr" }),
        row({ dealId: 2, dealName: "Alder" }),
        row({ dealId: 3, dealName: "Borden", recommendationId: 9 }),
        row({ dealId: 3, dealName: "Borden", recommendationId: 10 }),
      ],
      NOW,
    );
    expect(out.deals.map((d) => d.dealName)).toEqual(["Borden", "Alder", "Zephyr"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The two engines compose. Logging an owed read is what makes a pattern
// visible — that is the whole point of scheduling reads, and it is the one
// assertion that proves 15.11 feeds 15.10.
//
// The cell fixture deliberately MIRRORS the SQL grain (outcome × distinct
// evidence kind) rather than importing the query, so it cannot quietly become a
// second implementation of it.
// ─────────────────────────────────────────────────────────────────────────────
describe("the two engines compose", () => {
  const cellsFor = (contradictedReads: number): PatternCell[] => [
    {
      kind: "regulatory",
      stage: "diligence",
      band: "high",
      horizon: "6_month",
      recStatus: "accepted",
      outcomeType: "contradicted",
      n: contradictedReads,
      exampleRecommendationIds: [1, 2, 3].slice(0, contradictedReads),
    },
  ];

  it("stays silent below the floors, then speaks once the owed read is logged", () => {
    // Two six-month reads on file: below MIN_PATTERN_SUPPORT, so no pattern.
    expect(cellsFor(2)[0].n).toBeLessThan(MIN_PATTERN_SUPPORT);
    expect(foldPatterns(cellsFor(2))).toEqual([]);

    // A third recommendation, decided six months ago, owes its 6-month read.
    const third = rec({ decidedAt: "2025-10-15T12:00:00.000Z" });
    const before = horizonStates(third, [], null, NOW).find((s) => s.horizon === "6_month")!;
    expect(before.state).toBe("due");

    // Log it.
    const after = horizonStates(third, [read("6_month", { outcomeType: "contradicted" })], null, NOW)
      .find((s) => s.horizon === "6_month")!;
    expect(after.state).toBe("completed");

    // And now the firm can see the pattern it could not see a moment ago.
    const patterns = foldPatterns(cellsFor(3));
    expect(patterns).toHaveLength(1);
    expect(patterns[0]).toMatchObject({
      patternId: "regulatory:diligence:high:6_month",
      supportingCount: 3,
      highSignalCount: 3,
    });
    expect(patterns[0].supportingCount).toBeGreaterThanOrEqual(MIN_PATTERN_SUPPORT);
    expect(patterns[0].highSignalCount).toBeGreaterThanOrEqual(MIN_HIGH_SIGNAL);
  });
});
