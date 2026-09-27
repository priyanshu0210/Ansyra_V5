import { expect, it } from "vitest";
import { StoredSynergyCategories, SynergyAnalysisSchema, LegacySynergyAnalysisSchema } from "./synergy-data";
import { variancePct } from "./synergy";
it("keeps zero-baseline and overflow variances unavailable rather than Infinity", () => {
  expect(variancePct(0, 1)).toBeNull();
  expect(variancePct(Number.MIN_VALUE, 1e12)).toBeNull();
});
it("converts database numeric strings without coercing missing data to zero", () => {
  expect(StoredSynergyCategories.parse([{ category: "Revenue", planned: "12.5", actual: "0" }])[0]).toMatchObject({ planned: 12.5, actual: 0 });
  for (const v of [null, undefined, "", " ", NaN, Infinity, {}, "no value"])
    expect(StoredSynergyCategories.safeParse([{ category: "Revenue", planned: v, actual: 0 }]).success).toBe(false);
});
it("rejects malformed arrays/periods and validates legacy analysis explicitly", () => {
  for (const value of [null, [], {}, [null], [{ category: "Revenue", planned: 2, actual: 1, periods: [null] }]])
    expect(StoredSynergyCategories.safeParse(value).success).toBe(false);
  const legacy = { summary: "Retained summary", recommendation: "Review revenue case", realisationPct: 63.9 };
  expect(SynergyAnalysisSchema.safeParse(legacy).success).toBe(false);
  expect(LegacySynergyAnalysisSchema.safeParse(legacy).success).toBe(true);
  expect(SynergyAnalysisSchema.safeParse({ analyses: [null], portfolioSummary: "Bad" }).success).toBe(false);
});
