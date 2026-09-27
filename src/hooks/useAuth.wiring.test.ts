import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Source assertions: vitest runs environment "node" with no jsdom, so the hook
// itself cannot be rendered here. The decision rule is unit-tested in
// contracts/auth-resolution.test.ts; what these pin is that the hook wires that
// rule in without weakening the sticky-session guarantee, and that every page
// which routes on a rejection also routes on a non-answer.

const read = (p: string) => readFileSync(join(__dirname, p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const hook = strip(read("useAuth.ts"));
const page = (f: string) => strip(readFileSync(join(__dirname, "../pages", f), "utf8"));

describe("the wait is bounded", () => {
  it("delegates the decision to contracts rather than inlining it", () => {
    expect(hook).toMatch(/from "@contracts\/auth-resolution"/);
    expect(hook).toMatch(/shouldGiveUpWaiting\(/);
    // A literal timeout here would be a second definition of the bound.
    expect(hook).not.toMatch(/setTimeout\([^,]+,\s*\d{3,}\)/);
    expect(hook).toMatch(/AUTH_SETTLE_TIMEOUT_MS/);
  });

  it("clears the timer so an unmount cannot fire it", () => {
    expect(hook).toMatch(/clearTimeout\(/);
  });

  it("asks contracts whether the clock may run at all", () => {
    expect(hook).toMatch(/shouldArmGiveUpTimer\(/);
  });

  it("spends patience only while the tab is visible", () => {
    // query-core parks retries on a hidden document and resumes them on
    // visibilitychange. A timer that ignored that would send a background tab
    // to login and greet the returning user with a sign-in form.
    expect(hook).toMatch(/documentHidden: document\.hidden/);
    expect(hook).toMatch(/addEventListener\("visibilitychange"/);
    expect(hook).toMatch(/removeEventListener\("visibilitychange"/);
  });
});

describe("a non-answer is never recorded as a rejection", () => {
  it("keeps the two flags distinct", () => {
    // "The server said no" and "we never got an answer" are different facts.
    // Collapsing them would let a stall be reported as proof of logout.
    expect(hook).toMatch(/isAuthoritativelyUnauthenticated: explicitAuthFailure/);
    expect(hook).not.toMatch(/isAuthoritativelyUnauthenticated:\s*explicitAuthFailure\s*\|\|/);
    expect(hook).toMatch(/\bisUnresolved,/);
  });

  it("still derives the rejection from an explicit 401/403 only", () => {
    // The two codes used to be inline string literals here. They moved into
    // `isAuthoritativeRejection` so the RETRY policy could read the same list —
    // a query that keeps asking about a session this hook has already called
    // rejected is a contradiction, and two copies of the list is how you get
    // one. The literals themselves are pinned in
    // contracts/auth-resolution.test.ts.
    expect(hook).toMatch(/isAuthoritativeRejection\(query\.error\.data\?\.code\)/);
    expect(hook).toMatch(/explicitAuthFailure\s*=\s*\n?\s*!!query\.error &&/);
  });

  it("does not retry a rejection, so the verdict lands on the first answer", () => {
    // The landing calls auth.me on every anonymous visit; a blanket `retry: 1`
    // made that two 401s per visitor for a nav label. An inline literal here
    // would re-open exactly that gap.
    expect(hook).toMatch(/retry: retryQuery/);
    expect(hook).not.toMatch(/retry:\s*\d/);
  });
});

describe("sticky auth still wins", () => {
  it("passes the remembered user into the give-up decision", () => {
    // Without this the timeout would log out a mid-session user on any stall —
    // the exact regression the remembered ref exists to prevent.
    expect(hook).toMatch(/hasRememberedUser:\s*!!effectiveUser/);
  });

  it("keeps the remembered-user ref", () => {
    expect(hook).toMatch(/rememberedUser/);
    expect(hook).toMatch(/query\.data \?\? rememberedUser\.current/);
  });
});

describe("every guarded page can escape", () => {
  // A page that routes on a rejection but not on a non-answer still hangs.
  const guarded = ["Dashboard.tsx", "DealDetail.tsx", "Profile.tsx", "ReportBug.tsx"];

  for (const f of guarded) {
    it(`${f} routes to login on both`, () => {
      const src = page(f);
      expect(src, `${f} should read isUnresolved`).toMatch(/isUnresolved/);
      expect(
        src,
        `${f} must redirect on a non-answer, not only on a rejection`,
      ).toMatch(/isAuthoritativelyUnauthenticated \|\| isUnresolved/);
    });
  }
});
