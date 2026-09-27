import { describe, expect, it } from "vitest";
import { anonCaller, callerFor, errorCodeFrom } from "../support/caller";
import { ADMIN, ASSOCIATE, PARTNER, RIVAL } from "../support/users";
import { SEED_DEALS } from "@fixtures/thornevale/index";

// Proves the harness itself works before anything relies on it.
//
// This is the first test in the repository that executes a tRPC procedure. Every
// prior "api" test read the router SOURCE with readFileSync and asserted regexes
// against it — which can show a call site exists but never that it behaves.

describe("the caller reaches the real router", () => {
  it("answers a public query", async () => {
    const res = await anonCaller().ping();
    expect(res.ok).toBe(true);
    expect(typeof res.ts).toBe("number");
  });

  it("resolves the seeded partner", async () => {
    const caller = await callerFor(PARTNER);
    const me = await caller.auth.me();
    expect(me?.email).toBe(PARTNER);
    expect(me?.userKind).toBe("member");
  });
});

describe("the seeded corpus is reachable through the API", () => {
  it("lists every seeded deal for its owner", async () => {
    const caller = await callerFor(PARTNER);
    const list = await caller.deals.list();
    const names = new Set(list.map((d) => d.name));
    for (const d of SEED_DEALS) {
      expect(names.has(d.name)).toBe(true);
    }
  });

  it("returns Project Anvil at the diligence stage", async () => {
    const caller = await callerFor(PARTNER);
    const list = await caller.deals.list();
    const anvil = list.find((d) => d.name === "Project Anvil");
    expect(anvil).toBeDefined();
    expect(anvil!.stage).toBe("diligence");
    expect(anvil!.isDemo).toBe(false);
  });
});

describe("the three walls, at the top level", () => {
  it("refuses an unauthenticated caller", async () => {
    expect(await errorCodeFrom(() => anonCaller().deals.list())).toBe("UNAUTHORIZED");
  });

  it("refuses an admin account, which is blocked from product features by design", async () => {
    // The admin holds every feature grant in the fixture precisely so that this
    // rejection can only be the member-kind wall and not a missing grant.
    const caller = await callerFor(ADMIN);
    expect(await errorCodeFrom(() => caller.deals.list())).toBe("FORBIDDEN");
  });

  it("refuses a member who lacks the specific feature grant", async () => {
    // The associate is deliberately seeded without `economics`.
    const caller = await callerFor(ASSOCIATE);
    const anvil = (await caller.deals.list()).find((d) => d.name === "Project Anvil")!;
    expect(await errorCodeFrom(() => caller.economics.get({ dealId: anvil.id }))).toBe("FORBIDDEN");
  });

  it("lets the same member through on a feature they do hold", async () => {
    const caller = await callerFor(ASSOCIATE);
    const list = await caller.deals.list();
    expect(list.length).toBeGreaterThan(0);
  });
});

describe("the isolation control is genuinely a different tenant", () => {
  it("sees none of the corpus", async () => {
    const rival = await callerFor(RIVAL);
    const list = await rival.deals.list();
    const names = new Set(list.map((d) => d.name));
    for (const d of SEED_DEALS) {
      expect(names.has(d.name)).toBe(false);
    }
  });

  it("holds full feature grants, so any refusal is the tenancy wall and not RBAC", async () => {
    const rival = await callerFor(RIVAL);
    const me = await rival.auth.me();
    expect(me?.features).toContain("pipeline");
    expect(me?.features).toContain("documents");
    expect(me?.features).toContain("economics");
  });
});
