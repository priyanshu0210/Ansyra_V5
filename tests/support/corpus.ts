// Resolve seeded rows to their database ids, so tests can address the corpus by
// the handle the fixture uses rather than by a serial id nobody can read.
import { eq, and } from "drizzle-orm";
import { getDb } from "../../api/queries/connection";
import { assumptions, deals, documents, recommendations, scenarioAnalyses } from "@db/schema";
import { ORG_A_ID, SEED_DEALS, SEED_ASSUMPTIONS, SEED_RECOMMENDATIONS, SEED_SCENARIOS } from "@fixtures/thornevale/index";

const dealCache = new Map<string, number>();

/** Database id of a seeded deal, by its fixture handle (e.g. "anvil"). */
export async function dealId(key: string): Promise<number> {
  const hit = dealCache.get(key);
  if (hit) return hit;
  const fixture = SEED_DEALS.find((d) => d.key === key);
  if (!fixture) throw new Error(`No fixture deal with key "${key}"`);
  const [row] = await getDb()
    .select({ id: deals.id })
    .from(deals)
    .where(and(eq(deals.name, fixture.name), eq(deals.organizationId, ORG_A_ID)))
    .limit(1);
  if (!row) throw new Error(`Deal "${fixture.name}" is not seeded. Run \`npm run seed:thornevale\`.`);
  dealCache.set(key, row.id);
  return row.id;
}

/** Database id of a seeded assumption, by fixture handle. */
export async function assumptionId(key: string): Promise<number> {
  const fixture = SEED_ASSUMPTIONS.find((a) => a.key === key);
  if (!fixture) throw new Error(`No fixture assumption with key "${key}"`);
  const [row] = await getDb()
    .select({ id: assumptions.id })
    .from(assumptions)
    .where(and(eq(assumptions.dealId, await dealId(fixture.dealKey)), eq(assumptions.assumption, fixture.assumption)))
    .limit(1);
  if (!row) throw new Error(`Assumption "${key}" is not seeded.`);
  return row.id;
}

/** Database id of a seeded recommendation, by fixture handle. */
export async function recommendationId(key: string): Promise<number> {
  const fixture = SEED_RECOMMENDATIONS.find((r) => r.key === key);
  if (!fixture) throw new Error(`No fixture recommendation with key "${key}"`);
  const [row] = await getDb()
    .select({ id: recommendations.id })
    .from(recommendations)
    .where(and(eq(recommendations.dealId, await dealId(fixture.dealKey)), eq(recommendations.claim, fixture.claim)))
    .limit(1);
  if (!row) throw new Error(`Recommendation "${key}" is not seeded.`);
  return row.id;
}

/** Database id of a seeded scenario snapshot, by fixture handle. */
export async function scenarioId(key: string): Promise<number> {
  const fixture = SEED_SCENARIOS.find((s) => s.key === key);
  if (!fixture) throw new Error(`No fixture scenario with key "${key}"`);
  const rows = await getDb()
    .select({ id: scenarioAnalyses.id, result: scenarioAnalyses.result })
    .from(scenarioAnalyses)
    .where(eq(scenarioAnalyses.dealId, await dealId(fixture.dealKey)));
  const hit = rows.find((r) => r.result?.summary === fixture.result.summary);
  if (!hit) throw new Error(`Scenario "${key}" is not seeded.`);
  return hit.id;
}

/** Database id of a seeded document, by deal handle and file name. */
export async function documentId(dealKey: string, name: string): Promise<number> {
  const [row] = await getDb()
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.dealId, await dealId(dealKey)), eq(documents.name, name)))
    .limit(1);
  if (!row) throw new Error(`Document "${name}" on deal "${dealKey}" is not seeded.`);
  return row.id;
}
