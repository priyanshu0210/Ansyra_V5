import { sql } from "drizzle-orm";
import { getDb } from "../../api/queries/connection";
import { localTestEnvironment } from "./local-environment";

/** Browser login scenarios must not inherit another suite's persistent limits.
 * Rate-limit behavior is independently covered by the integration suite. */
export async function resetLocalLoginLimits() {
  const expected = localTestEnvironment(process.env);
  if (process.env.ANSYRA_LOCAL_TEST !== "true" || process.env.DATABASE_URL !== expected.DATABASE_URL || process.env.SUPABASE_URL !== expected.SUPABASE_URL) {
    throw new Error("Login test reset requires the isolated local stack.");
  }
  await getDb().execute(sql`delete from public.rate_limits where bucket in ('login','login-account')`);
}
