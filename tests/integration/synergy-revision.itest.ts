import { expect, it } from "vitest";
import { callerFor } from "../support/caller";
import { PARTNER } from "../support/users";
import { createScratchDeal } from "../support/scratch";

it("saving revised quarter actuals persists their totals and invalidates the previous explanation", async () => {
  const partner = await callerFor(PARTNER);
  const deal = await createScratchDeal(partner, "Synergy revision", { stage: "integration" });
  const categories = [{ category: "Procurement", planned: 99, actual: 99, periods: [{ quarter: "2026-Q1", planned: 1.5, actual: 0.75 }] }];
  try {
    await partner.ai.synergyAnalysis({ dealId: deal.id, categories });
    expect((await partner.ai.getSynergyPlan({ dealId: deal.id }))?.analysis).not.toBeNull();
    categories[0].periods[0].actual = 1.25;
    await partner.ai.saveSynergyPlan({ dealId: deal.id, categories });
    const fresh = await callerFor(PARTNER);
    const saved = await fresh.ai.getSynergyPlan({ dealId: deal.id });
    expect(saved?.categories).toEqual([{ category: "Procurement", planned: 1.5, actual: 1.25, periods: categories[0].periods }]);
    expect(saved?.analysis).toBeNull();
  } finally {
    await partner.deals.delete({ id: deal.id });
  }
});
