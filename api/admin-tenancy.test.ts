import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { User } from "@db/schema";

const state = vi.hoisted(() => ({ predicates: [] as unknown[], rows: [] as unknown[] }));
const provision = vi.hoisted(() => vi.fn(async () => ({ userId: "created", temporaryPassword: null, invited: false })));
vi.mock("./lib/env", () => ({ env: { isProduction: false, siteUrl: "" } }));
vi.mock("./lib/provision", () => ({ provisionUser: provision, generateTempPassword: vi.fn() }));
vi.mock("./lib/activity", () => ({ logActivity: vi.fn() }));
vi.mock("./lib/supabase-clients", () => ({ adminClient: vi.fn(() => { throw new Error("Unexpected auth mutation"); }) }));
vi.mock("./queries/connection", () => ({ getDb: () => ({
  select: () => {
    const chain = {
      from: () => chain, leftJoin: () => chain,
      where: (predicate: unknown) => { state.predicates.push(predicate); return chain; },
      orderBy: async () => state.rows, limit: async () => state.rows,
      then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(state.rows).then(resolve),
    };
    return chain;
  },
}) }));
import { adminRouter } from "./admin-router";
import { accessRouter } from "./access-router";

const orgA = "00000000-0000-4000-8000-000000000001";
const orgB = "00000000-0000-4000-8000-000000000002";
const targetId = "00000000-0000-4000-8000-000000000003";
function context(kind = "admin", org: string | null = orgA) {
  return { req: new Request("http://localhost/api"), resHeaders: new Headers(), user: {
    id: "00000000-0000-4000-8000-000000000004", userKind: kind, organizationId: org,
    adminPermissions: { view_user_summaries: true, view_user_details: true, manage_users: true, manage_features: true, manage_access_requests: true },
  } as unknown as User };
}
const predicate = () => new PgDialect().sqlToQuery(state.predicates[0] as SQL);
beforeEach(() => { state.predicates = []; state.rows = []; provision.mockClear(); });

describe("company admin server boundaries", () => {
  it("limits the user directory to the company and excludes platform admins", async () => {
    expect(await adminRouter.createCaller(context()).listUserSummaries()).toEqual([]);
    expect(predicate().sql).toContain('"organization_id" =');
    expect(predicate().sql).toContain('"user_kind" <>');
    expect(predicate().params).toEqual([orgA, "main_admin"]);
  });
  it("limits the organization picker to the admin's company", async () => {
    await adminRouter.createCaller(context()).listOrganizations();
    expect(predicate().params).toEqual([orgA]);
  });
  it.each(["listUserSummaries", "listOrganizations"] as const)("fails closed for an unassigned admin: %s", async (route) => {
    expect(await adminRouter.createCaller(context("admin", null))[route]()).toEqual([]);
    expect(predicate().sql).toBe("false");
  });
  it.each(["getUserDetail", "resetPassword", "removeUser", "reactivateUser", "setUserFeatures"] as const)("scopes direct target requests before side effects: %s", async (route) => {
    await expect(adminRouter.createCaller(context())[route]({ userId: targetId, features: [] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(predicate().params).toEqual([targetId, orgA, "main_admin"]);
    expect(predicate().sql).toContain(" and ");
  });
  it.each([{ organizationId: orgB }, { organizationName: "Other company" }, { isAdmin: true }])("blocks foreign-company creation or privilege escalation: %j", async (extra) => {
    await expect(adminRouter.createCaller(context()).createUser({ name: "Test", email: "test@example.com", role: "other", ...extra })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(provision).not.toHaveBeenCalled();
  });
  it("assigns new members to the caller's company when the client omits it", async () => {
    await adminRouter.createCaller(context()).createUser({ name: "Test", email: "test@example.com", role: "other", sendInvite: false });
    expect(provision).toHaveBeenCalledWith(expect.objectContaining({ organizationId: orgA, isAdmin: false }));
  });
  it("refuses creation by an unassigned admin", async () => {
    await expect(adminRouter.createCaller(context("admin", null)).createUser({ name: "Test", email: "test@example.com", role: "other" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(provision).not.toHaveBeenCalled();
  });
  it("does not allow platform intake to bypass company provisioning", async () => {
    await expect(accessRouter.createCaller(context()).list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(accessRouter.createCaller(context()).approve({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(provision).not.toHaveBeenCalled();
  });
  it("preserves main-admin global directory access", async () => {
    await adminRouter.createCaller(context("main_admin", null)).listUserSummaries();
    expect(state.predicates[0]).toBeUndefined();
  });
  it("allows main admin to provision into another company", async () => {
    await adminRouter.createCaller(context("main_admin", null)).createUser({ name: "Test", email: "test@example.com", role: "other", organizationId: orgB, isAdmin: true });
    expect(provision).toHaveBeenCalledWith(expect.objectContaining({ organizationId: orgB, isAdmin: true }));
  });
  it("preserves same-company detail access", async () => {
    state.rows = [{ id: targetId, organizationId: orgA, userKind: "member" }];
    const result = await adminRouter.createCaller(context()).getUserDetail({ userId: targetId });
    expect(result.user.id).toBe(targetId);
  });
});
