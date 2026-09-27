// ─────────────────────────────────────────────────────────────────────────────
// Opens one database connection before any test runs.
//
// Supabase's transaction pooler can take several seconds to hand back the first
// connection to a cold process — and whichever test happened to query first paid
// that cost out of its own timeout. In a fresh working copy that was enough to
// time out a 60-second test that normally finishes in under a second, producing
// a failure with nothing wrong with it. The suite passed on the next two runs,
// which is the signature of exactly this problem.
//
// Paying the cost here means it is charged to the run, not to a test. Runs once
// per suite, not once per file.
// ─────────────────────────────────────────────────────────────────────────────
import "./env";
import { sql } from "drizzle-orm";
import { getDb } from "../../api/queries/connection";

export default async function warmDatabaseConnection() {
  const started = Date.now();
  await getDb().execute(sql`select 1`);
  const ms = Date.now() - started;
  if (ms > 2_000) {
    console.log(`[test-setup] first database connection took ${ms}ms (cold pooler)`);
  }
}
