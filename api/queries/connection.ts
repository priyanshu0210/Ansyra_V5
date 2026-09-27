import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { assertVerifiedTlsStream, databaseConnectionOptions } from "../lib/database-tls";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

let instance: ReturnType<typeof drizzle<typeof fullSchema>> | null = null;
let poolInstance: Pool | null = null;

export function getDb() {
  if (!instance) {
    const pool = new Pool({
      ...databaseConnectionOptions(env.databaseUrl, env.databaseSsl),
      // Supabase's transaction pooler (Supavisor, port 6543) closes idle
      // server-side connections. Keep our client pool lean and recycle idle
      // clients quickly so we hold fewer connections that can be reaped.
      max: 10,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: env.databaseConnectionTimeoutMs,
      statement_timeout: env.databaseStatementTimeoutMs,
      query_timeout: env.databaseStatementTimeoutMs + 5_000,
      keepAlive: true,
      application_name: "ansyra-api",
    });
    // CRITICAL: pg re-throws an `error` event that has NO listener as an
    // uncaught exception — which exits the whole Node process. Idle pooled
    // clients emit this whenever the pooler drops a connection (very common
    // with Supavisor). Swallow + log so a routine idle reset can't crash the
    // server; the pool transparently opens a fresh connection on next use.
    pool.on("error", (err) => {
      console.warn("[db] idle client error (recovered):", err.message);
    });
    poolInstance = pool;
    instance = drizzle(pool, { schema: fullSchema });
  }
  return instance;
}

export async function closeDb(): Promise<void> {
  const pool = poolInstance;
  poolInstance = null;
  instance = null;
  if (pool) await pool.end();
}

/** Check our client socket; pg_stat_ssl behind a pooler describes a different connection. */
export async function assertVerifiedDatabaseConnection() {
  getDb();
  const client = await poolInstance!.connect();
  try {
    // `client.connection.stream` is a pg internal, not a public API. Feature-
    // detect it so a pg upgrade that moves it fails with a message that names
    // the cause instead of a TypeError, and never passes the check by accident.
    const connection = client as unknown as { connection?: { stream?: { encrypted?: boolean; authorized?: boolean } } };
    const stream = connection.connection?.stream;
    if (!stream || typeof stream !== "object") {
      throw new Error(
        "Could not inspect the database client socket to verify TLS (pg internals changed). " +
          "Pin the pg version or update assertVerifiedDatabaseConnection before deploying.",
      );
    }
    assertVerifiedTlsStream(stream);
    await client.query("SELECT 1");
  } finally {
    client.release();
  }
}
