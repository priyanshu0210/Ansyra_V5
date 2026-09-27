import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { LATEST_MIGRATION_VERSION } from "./migrations-manifest";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "supabase", "migrations");

describe("migration manifest", () => {
  it("pins exactly the newest migration file, so the boot gate covers every schema change", () => {
    const versions = readdirSync(MIGRATIONS_DIR)
      .filter((f) => /^\d{14}_.+\.sql$/.test(f))
      .map((f) => f.slice(0, 14))
      .sort();
    expect(versions.length).toBeGreaterThan(0);
    expect(
      LATEST_MIGRATION_VERSION,
      "A migration was added without updating api/lib/migrations-manifest.ts; a deploy would boot against a stale schema.",
    ).toBe(versions[versions.length - 1]);
  });

  it("is a 14-digit Supabase migration version", () => {
    expect(LATEST_MIGRATION_VERSION).toMatch(/^\d{14}$/);
  });
});
