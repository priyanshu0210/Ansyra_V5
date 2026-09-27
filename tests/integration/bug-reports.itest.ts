import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { callerFor, anonCaller, errorCodeFrom, userByEmail, type Caller } from "../support/caller";
import { ADMIN, ASSOCIATE, PARTNER, RIVAL } from "../support/users";
import { scratchName } from "../support/scratch";
import { pngBytes } from "@fixtures/thornevale/binary";
import { env } from "../../api/lib/env";

// Bug reports — the one live surface in the product where an ordinary member
// writes a row that only an ADMIN can read back, and where the payload is a
// private file.
//
// It had no test of any kind. Two of its guards are the only thing standing
// between a triage console and a file-disclosure oracle:
//
//   1. `submit` requires every screenshot path to sit under the CALLER's own
//      id prefix. Without it, A attaches a path belonging to B's report, and an
//      admin opening A's report mints a signed URL for B's private image — the
//      product handing out someone else's screenshot through a legitimate UI.
//   2. `screenshotUrl` requires the path to be listed on the report it names.
//      Without it, the procedure signs ANY path in the private bucket for
//      anyone holding `view_bug_reports` — an arbitrary-read oracle over
//      `bug-screenshots`, addressed by a string the caller controls.
//
// Both are one `if` each, neither has a type to protect it, and either could be
// deleted without a single other test in the repo turning red.
//
// Driven through real tRPC callers against Postgres, with real PNG bytes moving
// through real Storage, so the signed-URL paths under test are the ones the
// admin lightbox actually walks.

let partner: Caller;
let associate: Caller;
let rival: Caller;
let admin: Caller;
let partnerId: string;
let rivalId: string;

const BUCKET = "bug-screenshots";
const PNG = "image/png";

function storage() {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** The client half of the signed-upload handshake — bytes go direct to Storage
 *  and never through the API server. */
async function uploadThroughSignedUrl(path: string, token: string, body: Buffer) {
  const { error } = await storage()
    .storage.from(BUCKET)
    .uploadToSignedUrl(path, token, body, { contentType: PNG });
  if (error) throw new Error(`signed upload failed: ${error.message}`);
}

/** Request a slot, PUT real bytes into it, and hand back the stored path. */
async function uploadScreenshotAs(caller: Caller): Promise<string> {
  const bytes = pngBytes(8, 8);
  const slot = await caller.bugs.requestScreenshotUpload({ mime: PNG, size: bytes.length });
  await uploadThroughSignedUrl(slot.path, slot.token, bytes);
  return slot.path;
}

beforeAll(async () => {
  [partner, associate, rival, admin] = await Promise.all([
    callerFor(PARTNER),
    callerFor(ASSOCIATE),
    callerFor(RIVAL),
    callerFor(ADMIN),
  ]);
  partnerId = (await userByEmail(PARTNER)).id;
  rivalId = (await userByEmail(RIVAL)).id;
});

// ─── Who may file, and who may read ──────────────────────────────────────────

describe("filing is open to every member; reading is not", () => {
  it("refuses an unauthenticated submission", async () => {
    expect(
      await errorCodeFrom(() =>
        anonCaller().bugs.submit({ title: scratchName("anon bug"), severity: "low" }),
      ),
    ).toBe("UNAUTHORIZED");
  });

  it("refuses an unauthenticated upload slot", async () => {
    expect(
      await errorCodeFrom(() =>
        anonCaller().bugs.requestScreenshotUpload({ mime: PNG, size: 128 }),
      ),
    ).toBe("UNAUTHORIZED");
  });

  it("lets a member without documents or economics file anyway", async () => {
    // The associate is seeded WITHOUT those grants. Reporting a bug is
    // deliberately not feature-gated — a member who cannot open the Data Room
    // is exactly the member most likely to be reporting that they cannot.
    const res = await associate.bugs.submit({
      title: scratchName("associate can file"),
      severity: "low",
    });
    expect(typeof res.id).toBe("number");
  });

  for (const [who, get] of [
    ["a member", () => partner],
    ["a member of another organisation", () => rival],
  ] as const) {
    it(`refuses ${who} the triage list`, async () => {
      expect(await errorCodeFrom(() => get().bugs.list())).toBe("FORBIDDEN");
    });
  }

  it("refuses a member the per-report reads and the status write", async () => {
    // Every admin-only procedure, not just the list — a gate applied to the
    // index and forgotten on the item is the ordinary way this leaks.
    expect(await errorCodeFrom(() => partner.bugs.get({ id: 1 }))).toBe("FORBIDDEN");
    expect(await errorCodeFrom(() => partner.bugs.setStatus({ id: 1, status: "closed" }))).toBe(
      "FORBIDDEN",
    );
    expect(await errorCodeFrom(() => partner.bugs.screenshotUrl({ id: 1, path: "x.png" }))).toBe(
      "FORBIDDEN",
    );
  });

  it("refuses an unauthenticated triage list", async () => {
    expect(await errorCodeFrom(() => anonCaller().bugs.list())).toBe("UNAUTHORIZED");
  });

  it("serves the admin holding view_bug_reports", async () => {
    expect(Array.isArray(await admin.bugs.list())).toBe(true);
  });
});

// ─── The upload slot ─────────────────────────────────────────────────────────

describe("the screenshot upload slot", () => {
  it("namespaces the path under the caller's own id", async () => {
    // This prefix is not cosmetic: it is the entire basis on which `submit`
    // later decides a path belongs to the caller.
    const slot = await partner.bugs.requestScreenshotUpload({ mime: PNG, size: 4096 });
    expect(slot.bucket).toBe(BUCKET);
    expect(slot.path.startsWith(`${partnerId}/`)).toBe(true);
    expect(slot.path.endsWith(".png")).toBe(true);
    expect(typeof slot.token).toBe("string");
  });

  it("gives two callers disjoint prefixes", async () => {
    const [mine, theirs] = await Promise.all([
      partner.bugs.requestScreenshotUpload({ mime: PNG, size: 4096 }),
      rival.bugs.requestScreenshotUpload({ mime: PNG, size: 4096 }),
    ]);
    expect(mine.path.startsWith(`${partnerId}/`)).toBe(true);
    expect(theirs.path.startsWith(`${rivalId}/`)).toBe(true);
  });

  it("refuses a mime that is not an image", async () => {
    for (const mime of ["application/pdf", "text/html", "image/svg+xml", "text/plain"]) {
      expect(await errorCodeFrom(() => partner.bugs.requestScreenshotUpload({ mime, size: 128 }))).toBe(
        "BAD_REQUEST",
      );
    }
  });

  it("refuses a file over 5 MB", async () => {
    const fiveMb = 5 * 1024 * 1024;
    expect(
      await errorCodeFrom(() => partner.bugs.requestScreenshotUpload({ mime: PNG, size: fiveMb + 1 })),
    ).toBe("BAD_REQUEST");
    // and accepts one exactly at the limit — the boundary is `>`, not `>=`
    const ok = await partner.bugs.requestScreenshotUpload({ mime: PNG, size: fiveMb });
    expect(ok.path.startsWith(`${partnerId}/`)).toBe(true);
  });
});

// ─── Guard 1: a report may only carry the reporter's own screenshots ─────────

describe("submit refuses screenshots that are not the caller's", () => {
  it("refuses a path under another user's prefix", async () => {
    // The whole attack in one line: the rival really does own this path.
    const theirs = await uploadScreenshotAs(rival);
    expect(
      await errorCodeFrom(() =>
        partner.bugs.submit({
          title: scratchName("claiming another user's screenshot"),
          severity: "high",
          screenshots: [theirs],
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("refuses a bare path with no prefix at all", async () => {
    expect(
      await errorCodeFrom(() =>
        partner.bugs.submit({
          title: scratchName("bare path"),
          severity: "low",
          screenshots: ["screenshot.png"],
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("refuses a batch where only ONE path is foreign", async () => {
    // The guard is a loop over every element. Checking `screenshots[0]` alone
    // would pass this and is the obvious way to write the bug.
    const mine = await uploadScreenshotAs(partner);
    expect(
      await errorCodeFrom(() =>
        partner.bugs.submit({
          title: scratchName("one rotten apple"),
          severity: "medium",
          screenshots: [mine, `${rivalId}/not-mine.png`],
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("refuses a prefix that merely starts with the same characters", async () => {
    // `${id}extra/...` shares a prefix with `${id}` but is a different folder.
    // The guard appends the slash for exactly this reason.
    expect(
      await errorCodeFrom(() =>
        partner.bugs.submit({
          title: scratchName("prefix lookalike"),
          severity: "low",
          screenshots: [`${partnerId}-other/shot.png`],
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("accepts the caller's own paths", async () => {
    const mine = await uploadScreenshotAs(partner);
    const res = await partner.bugs.submit({
      title: scratchName("own screenshot"),
      severity: "low",
      screenshots: [mine],
    });
    const row = await admin.bugs.get({ id: res.id });
    expect(row.screenshots).toEqual([mine]);
  });

  it("caps a report at three screenshots", async () => {
    expect(
      await errorCodeFrom(() =>
        partner.bugs.submit({
          title: scratchName("four screenshots"),
          severity: "low",
          screenshots: [1, 2, 3, 4].map((n) => `${partnerId}/shot-${n}.png`),
        }),
      ),
    ).toBe("BAD_REQUEST");
  });
});

// ─── Guard 2: a signed URL is only ever minted for that report's own file ────

describe("screenshotUrl is not an arbitrary-path oracle", () => {
  let reportA: number;
  let pathA: string;
  let reportB: number;
  let pathB: string;

  beforeAll(async () => {
    pathA = await uploadScreenshotAs(partner);
    reportA = (
      await partner.bugs.submit({
        title: scratchName("report A"),
        severity: "high",
        screenshots: [pathA],
      })
    ).id;
    pathB = await uploadScreenshotAs(partner);
    reportB = (
      await partner.bugs.submit({
        title: scratchName("report B"),
        severity: "low",
        screenshots: [pathB],
      })
    ).id;
  });

  it("mints a short-lived URL for the report's own screenshot", async () => {
    const { url } = await admin.bugs.screenshotUrl({ id: reportA, path: pathA });
    expect(url).toContain(BUCKET);
    expect(url).toContain("token=");
    // and it genuinely resolves to the bytes that were uploaded
    const res = await fetch(url);
    expect(res.status).toBe(200);
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });

  it("refuses a real path that belongs to a DIFFERENT report", async () => {
    // Both files exist, both are readable, both were uploaded by the same
    // person — the only thing wrong is the pairing, and that is the point.
    expect(await errorCodeFrom(() => admin.bugs.screenshotUrl({ id: reportA, path: pathB }))).toBe(
      "FORBIDDEN",
    );
    // Swapped back, the same two arguments succeed. Without this the refusal
    // above would also pass if `screenshotUrl` were simply broken for pathB.
    expect((await admin.bugs.screenshotUrl({ id: reportB, path: pathB })).url).toContain(BUCKET);
  });

  it("refuses a path in the bucket that is on no report at all", async () => {
    const orphan = await uploadScreenshotAs(partner);
    expect(
      await errorCodeFrom(() => admin.bugs.screenshotUrl({ id: reportA, path: orphan })),
    ).toBe("FORBIDDEN");
  });

  it("refuses an invented path", async () => {
    expect(
      await errorCodeFrom(() =>
        admin.bugs.screenshotUrl({ id: reportA, path: `${rivalId}/anything.png` }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("refuses every path on a report that has no screenshots", async () => {
    const bare = await partner.bugs.submit({
      title: scratchName("no screenshots"),
      severity: "low",
    });
    expect(await errorCodeFrom(() => admin.bugs.screenshotUrl({ id: bare.id, path: pathA }))).toBe(
      "FORBIDDEN",
    );
  });

  it("reports an unknown id as missing, not as forbidden", async () => {
    expect(
      await errorCodeFrom(() => admin.bugs.screenshotUrl({ id: 2_000_000_000, path: pathA })),
    ).toBe("NOT_FOUND");
  });
});

// ─── Triage ──────────────────────────────────────────────────────────────────

describe("what a submission stores, and how it is triaged", () => {
  let id: number;
  const title = scratchName("triage subject");

  beforeAll(async () => {
    id = (
      await partner.bugs.submit({
        title,
        description: "The synergy chart renders behind the sidebar at 1280px.",
        page: "/dashboard/economics",
        severity: "medium",
      })
    ).id;
  });

  it("keeps every field it was given, and stamps the reporter", async () => {
    const row = await admin.bugs.get({ id });
    expect(row.title).toBe(title);
    expect(row.description).toContain("renders behind the sidebar");
    expect(row.page).toBe("/dashboard/economics");
    expect(row.severity).toBe("medium");
    // The reporter is taken from the session, never from the input — there is
    // no field to spoof, and this asserts it stays that way.
    expect(row.reporter).toBe(partnerId);
    expect(row.organizationId).toBeTruthy();
  });

  it("opens at `open` without being told to", async () => {
    const row = await admin.bugs.get({ id });
    expect(row.status).toBe("open");
  });

  it("rejects a severity outside the three", async () => {
    expect(
      await errorCodeFrom(() =>
        // @ts-expect-error — the point of the test is the runtime rejection
        partner.bugs.submit({ title: scratchName("bad severity"), severity: "catastrophic" }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("rejects an empty title", async () => {
    expect(
      await errorCodeFrom(() => partner.bugs.submit({ title: "", severity: "low" })),
    ).toBe("BAD_REQUEST");
  });

  it("moves through the statuses and reads back", async () => {
    for (const status of ["triaged", "fixed", "closed"] as const) {
      await admin.bugs.setStatus({ id, status });
      expect((await admin.bugs.get({ id })).status).toBe(status);
    }
  });

  it("filters the list by status without losing the report", async () => {
    // Relative to THIS report only. A count assertion here would pass once and
    // fail on every rerun, because the table is never emptied.
    await admin.bugs.setStatus({ id, status: "triaged" });
    const triaged = await admin.bugs.list({ status: "triaged" });
    expect(triaged.map((r) => r.id)).toContain(id);
    const closed = await admin.bugs.list({ status: "closed" });
    expect(closed.map((r) => r.id)).not.toContain(id);
  });

  it("refuses to set a status outside the four", async () => {
    expect(
      await errorCodeFrom(() =>
        // @ts-expect-error — runtime rejection is the assertion
        admin.bugs.setStatus({ id, status: "wontfix" }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("reports an unknown id as missing on both read and write", async () => {
    expect(await errorCodeFrom(() => admin.bugs.get({ id: 2_000_000_000 }))).toBe("NOT_FOUND");
    expect(
      await errorCodeFrom(() => admin.bugs.setStatus({ id: 2_000_000_000, status: "fixed" })),
    ).toBe("NOT_FOUND");
  });

  it("lists newest first", async () => {
    const rows = await admin.bugs.list();
    const times = rows.map((r) => new Date(r.createdAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });
});
