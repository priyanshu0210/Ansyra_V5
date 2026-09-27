import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import { registerExportRoutes } from "../../api/export-routes";
import { getSupabaseCookieName } from "../../api/auth/verify";
import { sessionCookieFor } from "../support/session";
import { ADMIN, ASSOCIATE, PARTNER, RIVAL } from "../support/users";
import { createScratchDeal } from "../support/scratch";
import { callerFor } from "../support/caller";

// The CSV export — the ONLY route in the product that bypasses tRPC.
//
// It had no test of any kind, and it is the highest-risk shape of code in the
// repository for three reasons that compound:
//
//   1. It re-implements `hasFeature` locally rather than using the middleware's,
//      so the feature gate can drift from every other route without anything
//      noticing.
//   2. It hand-writes its ownership predicate in raw SQL rather than calling
//      `ownerScope` — which is exactly the duplication ownerScope was created to
//      end, after three drifting copies caused a real access-control bug.
//   3. It returns a bulk download. A mistake here does not leak one row, it
//      leaks the portfolio.
//
// Driven through a real Hono app with a real session cookie, so the auth path
// under test is the one a browser exercises rather than a fabricated context.

const app = new Hono();
registerExportRoutes(app);

const URL = "http://localhost:3000/api/export/pipeline.csv";
const get = (cookie?: string) =>
  app.request(URL, { headers: cookie ? { cookie } : {} });

let partnerCookie: string;
let associateCookie: string;
let adminCookie: string;
let rivalCookie: string;

beforeAll(async () => {
  partnerCookie = await sessionCookieFor(PARTNER);
  associateCookie = await sessionCookieFor(ASSOCIATE);
  adminCookie = await sessionCookieFor(ADMIN);
  rivalCookie = await sessionCookieFor(RIVAL);
});

describe("the export re-implements the auth wall, so the wall is tested here too", () => {
  it("refuses an unauthenticated request", async () => {
    const res = await get();
    expect(res.status).toBe(401);
  });

  it("refuses a request carrying a junk cookie", async () => {
    // The name is derived, not written out: it encodes the Supabase project ref,
    // so a literal would both hard-code one deployment's identity into the suite
    // and silently stop testing anything the day the project changed — the
    // cookie would no longer be the one the server looks for, and the 401 would
    // be "no cookie at all" rather than "a cookie that does not verify".
    const res = await get(`${getSupabaseCookieName()}=not-a-real-session`);
    expect(res.status).toBe(401);
  });

  it("refuses an admin account, exactly as the tRPC routes do", async () => {
    // The admin holds every feature grant, so a 403 here can only be the
    // member-kind wall — the same one api/middleware.ts enforces.
    const res = await get(adminCookie);
    expect(res.status).toBe(403);
  });

  it("refuses a member who lacks the economics grant", async () => {
    // The associate is seeded without `economics`. If this route's local copy of
    // hasFeature ever drifts from the middleware's, this is what catches it.
    const res = await get(associateCookie);
    expect(res.status).toBe(403);
  });

  it("serves a member who holds the grant", async () => {
    const res = await get(partnerCookie);
    expect(res.status).toBe(200);
  });
});

describe("what it serves", () => {
  it("is a CSV attachment, not cached", async () => {
    const res = await get(partnerCookie);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("opens with a byte-order mark so Excel reads it as UTF-8", async () => {
    // Without the BOM, Excel mis-renders every non-ASCII character in the file —
    // and this corpus is full of them (Wrocław, €312M).
    //
    // Asserted on the RAW BYTES. `Response.text()` decodes with a TextDecoder
    // that strips a leading BOM by spec, so reading the string back makes a
    // correctly-BOM'd file look like it has none — which is how the first
    // version of this test "found" a bug that was not there.
    const buf = Buffer.from(await (await get(partnerCookie)).arrayBuffer());
    expect([buf[0], buf[1], buf[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("carries the economics columns, not just the deal columns", async () => {
    const text = await (await get(partnerCookie)).text();
    const header = text.replace(/^\uFEFF/, "").split("\n")[0];
    for (const col of ["Deal", "Target", "Stage", "EV/EBITDA", "Est. IRR", "Est. MOIC"]) {
      expect(header).toContain(col);
    }
  });

  it("includes the caller's own deals", async () => {
    const text = await (await get(partnerCookie)).text();
    expect(text).toContain("Project Anvil");
  });

  it("renders a deal's derived multiples rather than leaving them blank", async () => {
    const text = await (await get(partnerCookie)).text();
    // Matched on an exact field boundary rather than a quoted prefix: the CSV
    // writer follows RFC 4180 and only quotes a value that needs it, so
    // "Project Anvil" is emitted bare. It is also a PREFIX of
    // "Project Anvil-Carve", which is why the comma matters here.
    const anvilRow = text.split("\n").find((l) => l.startsWith("Project Anvil,"));
    expect(anvilRow).toBeDefined();
    // 8.0x EV/EBITDA is the corpus's headline number; a blank here would mean
    // the LEFT JOIN onto deal_economics silently stopped matching.
    expect(anvilRow).toContain("8");
  });
});

describe("scoping — the part that leaks a portfolio if it is wrong", () => {
  it("shows another firm none of this firm's deals", async () => {
    const text = await (await get(rivalCookie)).text();
    expect(text).not.toContain("Project Anvil");
    expect(text).not.toContain("Thornevale Industrial Group");
  });

  it("excludes demo rows, because an export is a record and not a sandbox", async () => {
    // Scratch deals are flagged as demo. They are visible through deals.list but
    // must never reach an export a person files.
    const partner = await callerFor(PARTNER);
    const scratch = await createScratchDeal(partner, "Export exclusion", { stage: "sourcing" });
    const text = await (await get(partnerCookie)).text();
    expect(text).not.toContain(scratch.name);
  });

  it("still shows the caller their non-demo deals alongside", async () => {
    // Guards against the previous test passing because the export is empty.
    const text = await (await get(partnerCookie)).text();
    const dataRows = text.replace(/^\uFEFF/, "").trim().split("\n").length - 1;
    expect(dataRows).toBeGreaterThanOrEqual(8);
  });
});
