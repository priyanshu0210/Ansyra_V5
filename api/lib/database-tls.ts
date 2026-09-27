import { rootCertificates } from "node:tls";
import { SUPABASE_ROOT_CA } from "./supabase-ca";

/** pg URL SSL options otherwise override the explicit TLS object, including verification. */
export function databaseConnectionOptions(connectionString: string, sslEnabled: boolean) {
  const url = new URL(connectionString);
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert", "ssl", "uselibpqcompat"]) url.searchParams.delete(key);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!sslEnabled && !local) throw new Error("Remote database connections require verified TLS.");
  const supabase = /\.(supabase\.co|supabase\.com)$/.test(url.hostname);
  return {
    connectionString: url.toString(),
    ssl: sslEnabled ? {
      rejectUnauthorized: true,
      ...(supabase ? { ca: [...rootCertificates, SUPABASE_ROOT_CA] } : {}),
    } : false as const,
  };
}

export function assertVerifiedTlsStream(stream: { encrypted?: boolean; authorized?: boolean }) {
  if (stream.encrypted !== true || stream.authorized !== true) {
    throw new Error("The database connection must use TLS with a verified server certificate.");
  }
}
