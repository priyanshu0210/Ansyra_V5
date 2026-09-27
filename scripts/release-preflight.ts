// Read-only hosted/local release checks. No migrations, repairs, or data writes.
// Output contains schema/configuration metadata, never credentials or user rows.
import "dotenv/config";
import { readdirSync } from "node:fs";
import { Pool } from "pg";
import { is, Table } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../db/schema";
import { databaseConnectionOptions, assertVerifiedTlsStream } from "../api/lib/database-tls";
import { LATEST_MIGRATION_VERSION } from "../api/lib/migrations-manifest";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!connectionString || !supabaseUrl || !anonKey) throw new Error("DATABASE_URL, SUPABASE_URL and SUPABASE_ANON_KEY are required.");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(new URL(connectionString).hostname);
  const timeout = Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS || 30_000);
  if (!Number.isSafeInteger(timeout) || timeout < 1) throw new Error("DATABASE_STATEMENT_TIMEOUT_MS must be a positive integer.");
  const pool = new Pool({ ...databaseConnectionOptions(connectionString, !local), max: 1,
    connectionTimeoutMillis: 10_000, statement_timeout: timeout, query_timeout: timeout + 5_000 });
  try {
    const client = await pool.connect();
    let database;
    try {
      if (!local) {
        const stream = (client as unknown as { connection?: { stream?: { encrypted?: boolean; authorized?: boolean } } }).connection?.stream;
        if (!stream) throw new Error("Cannot verify the database TLS socket.");
        assertVerifiedTlsStream(stream);
      }
      await client.query("BEGIN READ ONLY");
      const columns = await client.query<{ table_name: string; column_name: string }>(
        "select table_name, column_name from information_schema.columns where table_schema='public'",
      );
      const actual = new Set(columns.rows.map((r) => `${r.table_name}.${r.column_name}`));
      const missingColumns = Object.values(schema).filter((v) => is(v, Table)).flatMap((t) => {
        const c = getTableConfig(t);
        return c.columns.map((column) => `${c.name}.${column.name}`).filter((key) => !actual.has(key));
      });
      const history = await client.query<{ version: string; name: string }>("select version, name from supabase_migrations.schema_migrations order by version");
      const files = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
      const versions = new Set(history.rows.map((r) => r.version));
      const localVersions = new Set(files.map((f) => f.slice(0, 14)));
      const inventory = await client.query(`select json_build_object(
        'tablesWithoutRls', (select coalesce(json_agg(c.relname), '[]'::json) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity),
        'browserTableGrants', (select coalesce(json_agg(row_to_json(g)), '[]'::json) from (select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated') and privilege_type in ('SELECT','INSERT','UPDATE','DELETE')) g),
        'buckets', (select json_agg(json_build_object('id',id,'public',public,'fileSizeLimit',file_size_limit,'allowedMimeTypes',allowed_mime_types)) from storage.buckets),
        'storagePolicyCount', (select count(*) from pg_policies where schemaname='storage' and tablename='objects')
      ) as checks`);
      const statementTimeout = await client.query("SHOW statement_timeout");
      database = { transport: local ? "local loopback" : "verified TLS", missingColumns,
        repositoryMigrationCount: files.length, hostedMigrationCount: history.rows.length,
        latestMigrationRecorded: versions.has(LATEST_MIGRATION_VERSION),
        repositoryVersionsNotRecorded: files.filter((f) => !versions.has(f.slice(0, 14))),
        remoteOnlyHistory: history.rows.filter((r) => !localVersions.has(r.version)),
        statementTimeout: statementTimeout.rows[0].statement_timeout, ...inventory.rows[0].checks };
      await client.query("ROLLBACK");
    } finally { client.release(); }
    const response = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: anonKey }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Auth settings request failed (${response.status}).`);
    const auth = await response.json() as { disable_signup?: boolean; external?: { anonymous_users?: boolean } };
    const result = { checkedAt: new Date().toISOString(), database,
      auth: { signupDisabled: auth.disable_signup === true, anonymousSignInEnabled: auth.external?.anonymous_users === true } };
    console.log(JSON.stringify(result, null, 2));
    if (database.missingColumns.length || !database.latestMigrationRecorded || database.repositoryVersionsNotRecorded.length ||
      database.remoteOnlyHistory.length || database.tablesWithoutRls.length || database.browserTableGrants.length ||
      result.auth.signupDisabled !== true || result.auth.anonymousSignInEnabled) process.exitCode = 1;
  } finally { await pool.end(); }
}
main().catch(() => {
  // Driver/provider exceptions can embed connection details; keep output safe.
  console.error("Release preflight could not complete. Check database connectivity, credentials, migration-history permissions and Supabase Auth availability. No writes were performed.");
  process.exitCode = 1;
});
