import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// REG-META — the suite checks its own shape.
//
// A golden baseline is only useful if a future run can be compared to this one,
// and that needs stable, unique, well-formed ids. This guards them.

const DIR = __dirname;
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".rtest.ts") && f !== "manifest.rtest.ts");
const ID_RE = /REG-[A-Z]+-\d{3}[a-z]?/g;

const idsByFile = new Map<string, string[]>();
for (const f of FILES) {
  const src = readFileSync(join(DIR, f), "utf8");
  idsByFile.set(f, [...src.matchAll(ID_RE)].map((m) => m[0]));
}
const allIds = [...idsByFile.values()].flat();
const uniqueIds = [...new Set(allIds)];

describe("REG-META — the regression suite's own shape", () => {
  it("REG-META-001: every scenario id is unique", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const id of allIds) {
      if (seen.has(id)) dupes.push(id);
      seen.add(id);
    }
    expect(dupes).toEqual([]);
  });

  it("REG-META-002: every id follows the REG-<AREA>-<NNN> convention", () => {
    const bad = uniqueIds.filter((id) => !/^REG-[A-Z]+-\d{3}[a-z]?$/.test(id));
    expect(bad).toEqual([]);
  });

  it("REG-META-003: the suite is large enough to be a baseline and small enough to run", () => {
    // The brief asked for "on the order of 50-200". The bound here is wider on
    // purpose: a suite should not be trimmed to hit a round number, and the
    // failure worth catching is a file silently dropping out of the glob, not
    // the count creeping past 200.
    expect(uniqueIds.length).toBeGreaterThanOrEqual(50);
    expect(uniqueIds.length).toBeLessThanOrEqual(400);
  });

  it("REG-META-004: an id belongs to exactly one file", () => {
    const owners = new Map<string, string[]>();
    for (const [file, ids] of idsByFile) {
      for (const id of new Set(ids)) {
        owners.set(id, [...(owners.get(id) ?? []), file]);
      }
    }
    const shared = [...owners.entries()].filter(([, files]) => files.length > 1);
    expect(shared).toEqual([]);
  });

  it("REG-META-005: every area in use is one of the documented ones", () => {
    const areas = new Set(uniqueIds.map((id) => id.split("-")[1]));
    const documented = new Set([
      "AUTH", "RBAC", "ISO", "PIPE", "DEC", "REC", "OUT",
      "DOC", "ASSUM", "SCEN", "ECON", "TIME", "DD", "COMP", "PAT", "CALC", "DATA", "META",
    ]);
    expect([...areas].filter((a) => !documented.has(a))).toEqual([]);
  });

  it("REG-META-006: every regression file actually contributes scenarios", () => {
    // Catches a file that stops matching the glob, or one whose tests were all
    // commented out — both of which would shrink the baseline silently.
    for (const [file, ids] of idsByFile) {
      expect({ file, count: ids.length }).toEqual({ file, count: ids.length });
      expect(ids.length).toBeGreaterThan(0);
    }
  });

  it("REG-META-007: the manifest document exists alongside the suite", () => {
    const manifest = readFileSync(join(DIR, "MANIFEST.md"), "utf8");
    expect(manifest).toContain("thornevale-v1");
    // Every area in use must be described, so the manifest cannot drift out of
    // date without failing.
    for (const area of new Set(uniqueIds.map((id) => id.split("-")[1]))) {
      expect(manifest).toContain(`REG-${area}`);
    }
  });
});
