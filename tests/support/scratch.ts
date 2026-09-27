// ─────────────────────────────────────────────────────────────────────────────
// Scratch deals for tests that mutate or delete.
//
// THE RULE THIS FILE EXISTS TO ENFORCE: no test asserts on a global count, and
// no test deletes anything it did not create in the same test.
//
// Both halves matter. Global counts would make the suite pass once and fail on
// the second run, which is the opposite of a golden baseline. And the Thornevale
// corpus is explicitly retained for a person to inspect afterwards, so a test
// that deletes a corpus row to prove `documents.delete` works would be
// destroying the deliverable to test a feature.
//
// So: mutating tests create their own deal, prefixed and timestamped, inside the
// sandbox organisation. Those rows are ALSO retained — they cost nothing, they
// are obviously named, and a cleanup step is one more thing that can go wrong
// while holding a delete statement.
// ─────────────────────────────────────────────────────────────────────────────
import "./env";
import { eq } from "drizzle-orm";
import { getDb } from "../../api/queries/connection";
import { deals } from "@db/schema";
import { ORG_A_ID, USER_PARTNER } from "@fixtures/thornevale/ids";
import type { Caller } from "./caller";

/** Distinguishes one run's scratch rows from another's in the dashboard. */
export const RUN_ID = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");

let counter = 0;

export function scratchName(label: string): string {
  counter += 1;
  return `[test ${RUN_ID}] ${label} #${counter}`;
}

export interface ScratchDeal {
  id: number;
  name: string;
}

/**
 * A deal created through the REAL `deals.create` procedure, so it passes through
 * the same feature gate, the same value parsing and the same activity logging a
 * user's deal would.
 *
 * `deals.create` always starts a deal at `sourcing` (or an explicit stage), and
 * the stage-gate refuses bare forward moves — so a test that needs a deal at a
 * later stage passes `stage` here rather than trying to walk it forward.
 */
export async function createScratchDeal(
  caller: Caller,
  label: string,
  opts: { stage?: "sourcing" | "evaluation" | "diligence" | "negotiation" | "closing" | "integration"; value?: string; industry?: string } = {},
): Promise<ScratchDeal> {
  const name = scratchName(label);
  const deal = await caller.deals.create({
    name,
    targetCompany: `${label} Holdings`,
    stage: opts.stage ?? "sourcing",
    value: opts.value,
    industry: opts.industry ?? "Industrials & Manufacturing",
  });

  // Mark it demo data AFTER creation, which is what it is.
  //
  // Not cosmetic. The learning read models — assumption-learning,
  // outcomes-owed, forecast-benchmark, comps — all filter `is_demo = false`,
  // and they scan the caller's whole portfolio. Because nothing here is ever
  // deleted, scratch deals accumulate at roughly fifty per full pass; by the
  // 400-mark those queries were slow enough to hit read timeouts against the
  // Supabase pooler and fail tests that had nothing wrong with them.
  //
  // Flagging scratch rows as demo means the read models skip them for free, so
  // the suite stops degrading itself as it is re-run. It also makes them
  // removable through the product's own `deals.removeSamples`.
  await getDb().update(deals).set({ isDemo: true }).where(eq(deals.id, deal.id));

  return { id: deal.id, name: deal.name };
}

/**
 * Move a scratch deal straight to a stage, bypassing the gate.
 *
 * Used ONLY to set up a starting position — never to test advancement, which
 * must go through `decisions.record` like the product requires. Written as a
 * direct update precisely so it cannot be mistaken for the thing under test.
 */
export async function forceStage(dealId: number, stage: string): Promise<void> {
  await getDb()
    .update(deals)
    .set({ stage: stage as "sourcing" })
    .where(eq(deals.id, dealId));
}

/** Rows a test needs to place directly, tagged into the sandbox org so they are
 *  scoped to the seeded users exactly like the corpus is. */
export const SCRATCH_OWNER = {
  createdBy: USER_PARTNER.id,
  organizationId: ORG_A_ID,
} as const;

/**
 * Upload a small real document to a scratch deal, through the product's own
 * signed-URL handshake, and return its id.
 *
 * Exists so destructive document tests have a disposable target. Scratch deals
 * start with no documents, which is why an earlier version of the isolation
 * suite aimed its cross-tenant DELETE at a corpus file — and deleted it the
 * moment a mutation test disabled the wall meant to refuse it.
 */
export async function uploadScratchDocument(
  caller: Caller,
  dealId: number,
  name: string,
): Promise<number> {
  const body = Buffer.from(
    `Disposable fixture uploaded by the test suite (${RUN_ID}). Safe to delete.`,
    "utf8",
  );
  const req = await caller.documents.requestUpload({
    dealId,
    name,
    mime: "text/plain",
    size: body.length,
  });

  const { createClient } = await import("@supabase/supabase-js");
  const { env } = await import("../../api/lib/env");
  const storage = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await storage.storage
    .from("deal-documents")
    .uploadToSignedUrl(req.path, req.token, body, { contentType: "text/plain" });
  if (error) throw new Error(`scratch document upload failed: ${error.message}`);

  const row = await caller.documents.confirm({
    dealId,
    path: req.path,
    name,
    mime: "text/plain",
    size: body.length,
  });
  return row.id;
}
