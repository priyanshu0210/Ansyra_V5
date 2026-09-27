// ─────────────────────────────────────────────────────────────────────────────
// The newest migration this build of the code requires.
//
// The runtime image ships only dist/, so the server cannot read
// supabase/migrations/ to discover what "current" means. The version is pinned
// here instead and checked at boot against supabase_migrations.schema_migrations
// (api/lib/deployment-check.ts): a deploy whose database has not been migrated
// refuses to start, rather than passing /health and then failing every query
// that touches a column the schema does not have yet.
//
// migrations-manifest.test.ts fails the unit suite — and therefore CI — whenever
// a new file lands in supabase/migrations/ without this constant moving with it.
// ─────────────────────────────────────────────────────────────────────────────
export const LATEST_MIGRATION_VERSION = "20260910120000";
