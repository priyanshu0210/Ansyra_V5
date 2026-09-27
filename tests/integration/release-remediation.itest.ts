import { randomBytes, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import { appRouter } from "../../api/router";
import { authenticateRequest, buildSessionSetCookie } from "../../api/auth/verify";
import { env } from "../../api/lib/env";
import { getDb } from "../../api/queries/connection";
import { accessRequests, deals, decisions, users, userFeatures, type User } from "@db/schema";
import { callerFor, type Caller } from "../support/caller";
import { USER_ADMIN } from "../fixtures/thornevale/ids";

// All identities and records belong to this isolated run. Existing fixture
// accounts and deal records are never changed by these tests.
const run = randomUUID();
const password = `${randomBytes(24).toString("base64url")}!aA1`;
const db = getDb();
const auth = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const signIn = (email: string) => createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
}).auth.signInWithPassword({ email, password });
function asUser(user: User) {
  return appRouter.createCaller({
    req: new Request("http://localhost:3000/api/trpc", { headers: { origin: "http://localhost:3000" } }),
    resHeaders: new Headers(), user,
  });
}
async function profile(id: string) {
  const [row] = await db.select().from(users).where(eq(users.id, id));
  if (!row) throw new Error("Missing scratch profile");
  return row;
}
let owner: Caller;
const orgName = `[test ${run}] release verification`;
let orgId: string;
async function member(label: string, isAdmin = false) {
  const email = `${label}-${randomUUID()}@example.test`;
  const created = await owner.admin.createUser({ name: `[test ${run}] ${label}`, email, password,
    role: "other", organizationId: orgId, sendInvite: false, isAdmin, features: ["pipeline", "documents"] });
  return { ...created, email, caller: asUser(await profile(created.userId)) };
}
beforeAll(async () => {
  const email = `release-owner-${run}@example.test`;
  const { data, error } = await auth.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error("Could not create isolated release test administrator");
  const [row] = await db.insert(users).values({ id: data.user.id, email, name: `[test ${run}] owner`, userKind: "main_admin", isAdmin: true }).returning();
  owner = asUser(row);
  const first = await owner.admin.createUser({ name: `[test ${run}] first`, email: `first-${run}@example.test`, password,
    role: "other", organizationName: orgName, sendInvite: false, features: ["pipeline", "documents"] });
  orgId = (await profile(first.userId)).organizationId!;
});

describe("release remediation against real local Auth, Postgres and Storage", () => {
  it("joins an organization only by explicit id and rejects an existing name", async () => {
    const created = await member("explicit-org");
    expect((await profile(created.userId)).organizationId).toBe(orgId);
    await expect(owner.admin.createUser({ name: "Duplicate organization", email: `duplicate-${run}@example.test`,
      password, role: "other", organizationName: orgName, sendInvite: false })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("deactivates a decision author, rejects old sessions and admin edits, and can reactivate", async () => {
    const created = await member("offboard");
    const deal = await created.caller.deals.create({ name: `[test ${run}] retained audit`, targetCompany: "Synthetic target" });
    await db.update(deals).set({ isDemo: true }).where(eq(deals.id, deal.id));
    await db.insert(decisions).values({ dealId: deal.id, decisionType: "hold", rationale: "Synthetic retention test", decidedBy: created.userId, organizationId: orgId });
    const signed = await signIn(created.email);
    expect(signed.error).toBeNull();
    const cookie = buildSessionSetCookie(new Headers(), signed.data.session!).split(";")[0];
    expect((await owner.admin.removeUser({ userId: created.userId })).mode).toBe("deactivated");
    expect((await profile(created.userId)).deactivatedAt).not.toBeNull();
    expect(await db.select().from(userFeatures).where(eq(userFeatures.userId, created.userId))).toHaveLength(0);
    await expect(authenticateRequest(new Headers({ cookie }))).rejects.toThrow();
    for (const attempt of [
      () => owner.admin.setUserKind({ userId: created.userId, kind: "admin" }),
      () => owner.admin.setUserFeatures({ userId: created.userId, features: ["pipeline"] }),
      () => owner.admin.resetPassword({ userId: created.userId }),
    ]) await expect(attempt()).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await db.select().from(decisions).where(eq(decisions.dealId, deal.id))).toHaveLength(1);
    await owner.admin.reactivateUser({ userId: created.userId });
    expect((await profile(created.userId)).deactivatedAt).toBeNull();
    expect((await signIn(created.email)).error).toBeNull();
  });

  it("deletes a member without authored records from both profile and Auth", async () => {
    const created = await member("empty");
    expect((await owner.admin.removeUser({ userId: created.userId })).mode).toBe("deleted");
    expect(await db.select().from(users).where(eq(users.id, created.userId))).toHaveLength(0);
    expect((await auth.auth.admin.getUserById(created.userId)).error).not.toBeNull();
  });

  it("does not let a delegated administrator remove another administrator", async () => {
    const created = await member("protected-admin", true);
    const delegated = await callerFor(USER_ADMIN.email);
    // Foreign-company identities are hidden before role checks.
    await expect(delegated.admin.removeUser({ userId: created.userId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const peer = await member("same-company-admin", true);
    await owner.admin.setAdminPermissions({ userId: peer.userId, permissions: { manage_users: true } });
    await expect(asUser(await profile(peer.userId)).admin.removeUser({ userId: created.userId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await profile(created.userId)).userKind).toBe("admin");
  });

  it("concurrent approvals provision once and never join the self-reported company", async () => {
    const email = `approve-${run}@example.test`;
    const [request] = await db.insert(accessRequests).values({ name: `[test ${run}] applicant`, email, company: orgName,
      reason: "Synthetic concurrency and tenant-assignment verification", requestedFeatures: ["pipeline"] }).returning();
    const results = await Promise.allSettled([0, 1].map(() => owner.access.approve({ id: request.id, features: ["pipeline"], sendInvite: false })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const [saved] = await db.select().from(accessRequests).where(eq(accessRequests.id, request.id));
    expect(saved.status).toBe("approved");
    expect((await profile(saved.createdUserId!)).organizationId).toBeNull();
    expect(await db.select().from(users).where(eq(users.email, email))).toHaveLength(1);
  });

  it("only the main administrator can reactivate an admin and deactivated permissions stay frozen", async () => {
    const created = await member("retained-admin", true);
    await db.insert(deals).values({ name: `[test ${run}] historical admin record`, targetCompany: "Synthetic target",
      createdBy: created.userId, organizationId: orgId, isDemo: true });
    expect((await owner.admin.removeUser({ userId: created.userId })).mode).toBe("deactivated");
    const delegated = await callerFor(USER_ADMIN.email);
    await expect(delegated.admin.reactivateUser({ userId: created.userId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const peer = await member("same-company-reactivator", true);
    await owner.admin.setAdminPermissions({ userId: peer.userId, permissions: { manage_users: true } });
    await expect(asUser(await profile(peer.userId)).admin.reactivateUser({ userId: created.userId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(owner.admin.setAdminPermissions({ userId: created.userId, permissions: { manage_users: true } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await owner.admin.reactivateUser({ userId: created.userId });
    expect((await profile(created.userId)).deactivatedAt).toBeNull();
  });

  it("restores a failed approval to pending without changing the existing account", async () => {
    const created = await member("conflict");
    const [request] = await db.insert(accessRequests).values({ name: `[test ${run}] conflict`, email: created.email,
      reason: "Synthetic duplicate identity recovery verification" }).returning();
    await expect(owner.access.approve({ id: request.id, features: [], sendInvite: false })).rejects.toMatchObject({ code: "CONFLICT" });
    const [saved] = await db.select().from(accessRequests).where(eq(accessRequests.id, request.id));
    expect(saved.status).toBe("pending");
    expect(saved.createdUserId).toBeNull();
    expect((await profile(created.userId)).organizationId).toBe(orgId);
  });

  it("deleting a deal removes its real Storage document and metadata", async () => {
    const created = await member("document-owner");
    const deal = await created.caller.deals.create({ name: `[test ${run}] document cleanup`, targetCompany: "Synthetic target" });
    await db.update(deals).set({ isDemo: true }).where(eq(deals.id, deal.id));
    const body = Buffer.from("Synthetic release-gate document. No confidential data.");
    const upload = await created.caller.documents.requestUpload({ dealId: deal.id, name: "release.txt", mime: "text/plain", size: body.length });
    const stored = await auth.storage.from(upload.bucket).uploadToSignedUrl(upload.path, upload.token, body, { contentType: "text/plain" });
    expect(stored.error).toBeNull();
    await created.caller.documents.confirm({ dealId: deal.id, path: upload.path, name: "release.txt", mime: "text/plain", size: body.length });
    expect((await auth.storage.from(upload.bucket).info(upload.path)).error).toBeNull();
    await created.caller.deals.delete({ id: deal.id });
    expect((await auth.storage.from(upload.bucket).info(upload.path)).error).not.toBeNull();
    expect(await db.select().from(deals).where(eq(deals.id, deal.id))).toHaveLength(0);
  });
});
