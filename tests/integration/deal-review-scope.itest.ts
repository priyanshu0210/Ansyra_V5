import { expect, it } from "vitest";
import { callerFor, errorCodeFrom } from "../support/caller";
import { PARTNER, RIVAL } from "../support/users";
it("filters review histories to the requested deal and rejects another firm's deal", async () => {
  const partner = await callerFor(PARTNER);
  const rival = await callerFor(RIVAL);
  for (const name of ["listCulturalScores", "listRegulatoryAnalyses"] as const) {
    const all = await partner.ai[name]();
    const id = all.find(row => row.dealId !== null)?.dealId;
    expect(id).toBeTypeOf("number");
    if (id == null) throw new Error("The seeded review history needs a linked deal");
    const filtered = await partner.ai[name]({ dealId: id });
    expect(filtered.map(row => row.id)).toEqual(all.filter(row => row.dealId === id).map(row => row.id));
    expect(filtered.length).toBeGreaterThan(0);
    expect(await errorCodeFrom(() => rival.ai[name]({ dealId: id }))).toBe("FORBIDDEN");
  }
});
