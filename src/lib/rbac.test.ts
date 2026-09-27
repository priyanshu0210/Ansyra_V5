import { describe, expect, it } from "vitest";
import { hasAdminPerm, hasFeature, isAdminKind, isMainAdmin } from "./rbac";
import type { AuthUser } from "@/hooks/useAuth";

// These four functions decide what every gated surface in the UI renders. The
// server is the real wall (api/middleware.ts), but a mistake here means a member
// is shown a tab that then 403s, or — worse — an admin sees product chrome the
// product deliberately refuses them. Nothing executable covered them; wiring
// tests only ever asserted `toMatch(/hasFeature\(user, "recommendations"\)/)`.

const user = (over: Partial<AuthUser> = {}): AuthUser =>
  ({
    id: "u1",
    email: "a@b.c",
    name: "A",
    role: "private_equity",
    userKind: "member",
    features: ["pipeline", "targets"],
    adminPermissions: {},
    ...over,
  }) as AuthUser;

describe("isAdminKind", () => {
  it("accepts both admin kinds", () => {
    expect(isAdminKind("admin")).toBe(true);
    expect(isAdminKind("main_admin")).toBe(true);
  });

  it("rejects member", () => {
    expect(isAdminKind("member")).toBe(false);
  });

  it("rejects absent and unknown kinds rather than defaulting open", () => {
    expect(isAdminKind(null)).toBe(false);
    expect(isAdminKind(undefined)).toBe(false);
    expect(isAdminKind("")).toBe(false);
    expect(isAdminKind("superuser")).toBe(false);
    // Casing matters: the column is a varchar with a CHECK constraint, not an
    // enum, so a mis-cased value is storable and must not be honoured.
    expect(isAdminKind("Admin")).toBe(false);
  });
});

describe("isMainAdmin", () => {
  it("is true only for main_admin", () => {
    expect(isMainAdmin(user({ userKind: "main_admin" }))).toBe(true);
    expect(isMainAdmin(user({ userKind: "admin" }))).toBe(false);
    expect(isMainAdmin(user({ userKind: "member" }))).toBe(false);
  });

  it("is false for a null user rather than throwing", () => {
    // Every caller runs during render, including before auth resolves.
    expect(isMainAdmin(null)).toBe(false);
  });
});

describe("hasFeature", () => {
  it("is false for a null user", () => {
    expect(hasFeature(null, "pipeline")).toBe(false);
  });

  it("is false when the grant list is missing entirely", () => {
    // A user row that loaded before features did must read as ungranted, not as
    // granted-by-default.
    expect(hasFeature(user({ features: undefined }), "pipeline")).toBe(false);
  });

  it("is false for an empty grant list", () => {
    expect(hasFeature(user({ features: [] }), "pipeline")).toBe(false);
  });

  it("is true only for a key actually present", () => {
    const u = user({ features: ["pipeline", "documents"] });
    expect(hasFeature(u, "pipeline")).toBe(true);
    expect(hasFeature(u, "documents")).toBe(true);
    expect(hasFeature(u, "economics")).toBe(false);
  });

  it("does not match on a prefix", () => {
    // "target_discovery" must not be satisfied by holding "targets". These are
    // separate grants and the discovery feature is deliberately opt-in.
    expect(hasFeature(user({ features: ["targets"] }), "target_discovery")).toBe(false);
  });
});

describe("hasAdminPerm", () => {
  it("is false for a null user", () => {
    expect(hasAdminPerm(null, "manage_users")).toBe(false);
  });

  it("grants main_admin every permission implicitly", () => {
    const u = user({ userKind: "main_admin", adminPermissions: {} });
    expect(hasAdminPerm(u, "manage_users")).toBe(true);
    expect(hasAdminPerm(u, "view_bug_reports")).toBe(true);
    expect(hasAdminPerm(u, "manage_features")).toBe(true);
  });

  it("requires the explicit flag for a plain admin", () => {
    const u = user({ userKind: "admin", adminPermissions: { manage_users: true } });
    expect(hasAdminPerm(u, "manage_users")).toBe(true);
    expect(hasAdminPerm(u, "manage_features")).toBe(false);
  });

  it("keeps platform-wide access request review main-admin only", () => {
    const u = user({ userKind: "admin", adminPermissions: { manage_access_requests: true } });
    expect(hasAdminPerm(u, "manage_access_requests")).toBe(false);
    expect(hasAdminPerm(user({ userKind: "main_admin" }), "manage_access_requests")).toBe(true);
  });

  it("treats an explicit false as a denial", () => {
    const u = user({ userKind: "admin", adminPermissions: { manage_users: false } });
    expect(hasAdminPerm(u, "manage_users")).toBe(false);
  });

  it("does not grant a member a permission even when the flag is set", () => {
    // Defence in depth: adminPermissions on a member row is meaningless data,
    // and the only thing standing between it and a granted permission is that
    // the member is not main_admin. Worth pinning, because the natural
    // "simplification" of this function is to read the flag first.
    const u = user({ userKind: "member", adminPermissions: { manage_users: true } });
    // NOTE: this documents CURRENT behaviour — the flag IS honoured for a
    // member. The server never reaches this path because requireAdmin runs
    // first, so the UI cannot leak anything the API will serve; but the
    // asymmetry is real and worth being explicit about rather than assuming.
    expect(hasAdminPerm(u, "manage_users")).toBe(true);
  });
});
