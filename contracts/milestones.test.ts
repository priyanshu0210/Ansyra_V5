import { describe, expect, it } from "vitest";
import {
  countdownLabel,
  daysUntil,
  dueReminder,
  thresholdKey,
  todayIso,
  urgencyOf,
} from "./milestones";

const TODAY = "2026-07-20";

describe("daysUntil", () => {
  it("counts whole days forward and backward", () => {
    expect(daysUntil("2026-07-26", TODAY)).toBe(6);
    expect(daysUntil("2026-07-20", TODAY)).toBe(0);
    expect(daysUntil("2026-07-17", TODAY)).toBe(-3);
  });
  it("crosses month and year boundaries", () => {
    expect(daysUntil("2026-08-01", "2026-07-31")).toBe(1);
    expect(daysUntil("2027-01-01", "2026-12-31")).toBe(1);
  });
  it("returns null for an unparseable date", () => {
    expect(daysUntil("not-a-date", TODAY)).toBeNull();
  });
});

describe("urgencyOf", () => {
  it("bands by proximity", () => {
    expect(urgencyOf("2026-07-17", TODAY)).toBe("overdue");
    expect(urgencyOf("2026-07-20", TODAY)).toBe("imminent"); // due today
    expect(urgencyOf("2026-07-22", TODAY)).toBe("imminent");
    expect(urgencyOf("2026-07-26", TODAY)).toBe("soon");
    expect(urgencyOf("2026-09-01", TODAY)).toBe("later");
  });
});

describe("countdownLabel", () => {
  it("reads naturally", () => {
    expect(countdownLabel("2026-07-26", TODAY)).toBe("6d");
    expect(countdownLabel("2026-07-20", TODAY)).toBe("Due today");
    expect(countdownLabel("2026-07-17", TODAY)).toBe("Overdue 3d");
  });
});

describe("dueReminder", () => {
  const base = { completed: false as boolean, lastNotified: null as null | Record<string, string> };

  it("fires the 7-day reminder inside the window", () => {
    expect(dueReminder({ ...base, dueDate: "2026-07-26" }, TODAY)).toBe(7);
  });
  it("fires the 1-day reminder when closer, not a stale d7", () => {
    expect(dueReminder({ ...base, dueDate: "2026-07-21" }, TODAY)).toBe(1);
  });
  it("is idempotent — never re-sends a recorded threshold", () => {
    expect(dueReminder({ ...base, dueDate: "2026-07-26", lastNotified: { d7: TODAY } }, TODAY)).toBeNull();
    // …but a d7-notified milestone still gets its d1 reminder later.
    expect(dueReminder({ ...base, dueDate: "2026-07-21", lastNotified: { d7: "2026-07-15" } }, TODAY)).toBe(1);
    expect(
      dueReminder({ ...base, dueDate: "2026-07-21", lastNotified: { d7: "2026-07-15", d1: TODAY } }, TODAY),
    ).toBeNull();
  });
  it("catches up if a run was missed (window, not exact-day equality)", () => {
    // 3 days out, d7 never sent because the server was down on the exact day.
    expect(dueReminder({ ...base, dueDate: "2026-07-23" }, TODAY)).toBe(7);
  });
  it("never notifies for completed or overdue milestones", () => {
    expect(dueReminder({ ...base, completed: true, dueDate: "2026-07-21" }, TODAY)).toBeNull();
    expect(dueReminder({ ...base, dueDate: "2026-07-19" }, TODAY)).toBeNull();
  });
  it("ignores far-future milestones", () => {
    expect(dueReminder({ ...base, dueDate: "2026-09-01" }, TODAY)).toBeNull();
  });
});

describe("thresholdKey / todayIso", () => {
  it("maps thresholds to their state keys", () => {
    expect(thresholdKey(7)).toBe("d7");
    expect(thresholdKey(1)).toBe("d1");
  });
  it("formats today as YYYY-MM-DD", () => {
    expect(todayIso(new Date(2026, 6, 20))).toBe("2026-07-20");
    expect(todayIso(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
