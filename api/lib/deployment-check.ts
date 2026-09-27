import { sql } from "drizzle-orm";
import { env } from "./env";
import { assertVerifiedDatabaseConnection, getDb } from "../queries/connection";
import { LATEST_MIGRATION_VERSION } from "./migrations-manifest";

interface AuthSettings {
  disable_signup?: boolean;
}

export async function assertDeploymentReady(): Promise<void> {
  if (!env.isProduction) return;

  const response = await fetch(`${env.supabaseUrl}/auth/v1/settings`, {
    headers: { apikey: env.supabaseAnonKey },
    signal: AbortSignal.timeout(env.externalRequestTimeoutMs),
  });
  if (!response.ok) throw new Error(`Could not verify Supabase Auth settings (${response.status}).`);
  const auth = await response.json() as AuthSettings;
  if (auth.disable_signup !== true) {
    throw new Error("Supabase self-signup is enabled. Disable 'Allow new users to sign up' before deployment.");
  }

  await assertVerifiedDatabaseConnection();

  // The schema must be at least as new as this build. Every migration the code
  // depends on is recorded by `supabase db push` in schema_migrations; the newest
  // version is pinned in migrations-manifest.ts (kept in step with the directory
  // by a unit test). Without this, a deploy that skipped `npm run db:migrate`
  // passes /health and then fails every query that names a newer column.
  let recorded: boolean;
  try {
    const history = await getDb().execute<{ present: boolean }>(sql`
      select exists (
        select 1 from supabase_migrations.schema_migrations
        where version = ${LATEST_MIGRATION_VERSION}
      ) as present
    `);
    recorded = history.rows[0]?.present === true;
  } catch (cause) {
    throw new Error(
      "Migration history is not readable (supabase_migrations.schema_migrations). " +
        "Apply migrations with `npm run db:migrate`, which records them.",
      { cause },
    );
  }
  if (!recorded) {
    throw new Error(
      `Migration ${LATEST_MIGRATION_VERSION} is not recorded on this database. ` +
        "Run `npm run db:status`, then `npm run db:migrate` (or `supabase migration repair --status applied " +
        `${LATEST_MIGRATION_VERSION}\` if it was applied by hand) before starting the server.`,
    );
  }

  const migrations = await getDb().execute<{ rate_limits: string | null }>(sql`
    select to_regclass('public.rate_limits')::text as rate_limits
  `);
  if (!migrations.rows[0]?.rate_limits) {
    throw new Error("Deployment-hardening migrations are missing. Run npm run db:migrate first.");
  }

  const buckets = await getDb().execute<{
    id: string;
    file_size_limit: number | null;
    allowed_mime_types: string[] | null;
  }>(sql`
    select id, file_size_limit, allowed_mime_types
    from storage.buckets
    where id in ('avatars', 'bug-screenshots', 'deal-documents')
  `);
  if (buckets.rows.length !== 3 || buckets.rows.some((bucket) => !bucket.file_size_limit || !bucket.allowed_mime_types?.length)) {
    throw new Error("Supabase Storage bucket limits are not configured. Apply the latest migration.");
  }
}
