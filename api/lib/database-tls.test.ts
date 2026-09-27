import { describe, expect, it } from "vitest";
import { assertVerifiedTlsStream, databaseConnectionOptions } from "./database-tls";
describe("database TLS", () => {
  it("verifies Supabase using its public CA and normal hostname validation", () => {
    const options = databaseConnectionOptions("postgres://user:secret@aws-0-region.pooler.supabase.com:6543/postgres", true);
    expect(options.ssl).toMatchObject({ rejectUnauthorized: true });
    expect(options.ssl && options.ssl.ca?.some(c => c.includes("BEGIN CERTIFICATE"))).toBe(true);
  });
  it("prevents URL parameters from silently weakening certificate verification", () => {
    const options = databaseConnectionOptions("postgres://user:secret@db.example/postgres?sslmode=no-verify&ssl=false&uselibpqcompat=true&application_name=test", true);
    expect(options.connectionString).not.toMatch(/ssl|libpq/);
    expect(options.connectionString).toContain("application_name=test");
    expect(options.ssl).toEqual({ rejectUnauthorized: true });
  });
  it("refuses unencrypted remote database connections", () => {
    expect(() => databaseConnectionOptions("postgres://db.example/postgres", false)).toThrow("verified TLS");
  });
  it("allows isolated loopback database tests", () => {
    expect(databaseConnectionOptions("postgres://localhost:54322/postgres", false).ssl).toBe(false);
  });
});

it("checks the application TLS socket, including certificate authorization", () => {
  expect(() => assertVerifiedTlsStream({ encrypted: true, authorized: true })).not.toThrow();
  expect(() => assertVerifiedTlsStream({ encrypted: true, authorized: false })).toThrow();
  expect(() => assertVerifiedTlsStream({ encrypted: false })).toThrow();
});
