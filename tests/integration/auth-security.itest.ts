import { randomUUID, randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../../api/router";
import { createContext } from "../../api/context";
import { authenticateRequest, buildSessionSetCookie } from "../../api/auth/verify";
import { env } from "../../api/lib/env";
import { getDb } from "../../api/queries/connection";
import { users } from "@db/schema";

const admin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const id = randomUUID();
const email = `security-${id}@example.test`;
let password = `${randomBytes(24).toString("base64url")}!aA1`;
const origin = "http://localhost:3000";
async function cookieFor() {
  const { data, error } = await admin.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(error?.message ?? "No local session");
  return buildSessionSetCookie(new Headers(), data.session).split(";")[0];
}
async function request(path: string, cookie: string, input?: unknown, source = origin) {
  const mutation = input !== undefined;
  const req = new Request(`${origin}/api/trpc/${path}`, {
    method: mutation ? "POST" : "GET",
    headers: { cookie, origin: source, "content-type": "application/json" },
    ...(mutation ? { body: JSON.stringify({ json: input }) } : {}),
  });
  return fetchRequestHandler({ endpoint: "/api/trpc", req, router: appRouter, createContext });
}
beforeAll(async () => {
  const created = await admin.auth.admin.createUser({ id, email, password, email_confirm: true } as never);
  if (created.error) throw created.error;
  await getDb().insert(users).values({ id, email, name: "Local security test", userKind: "member" });
});
afterAll(async () => {
  await getDb().delete(users).where(eq(users.id, id));
  const removed = await admin.auth.admin.deleteUser(id);
  if (removed.error) throw removed.error;
});

describe("real session and HTTP security", () => {
  it("keeps public registration closed while existing email accounts can sign in", async () => {
    const anon = createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false } });
    const signup = await anon.auth.signUp({ email: `blocked-${id}@example.test`, password });
    expect(signup.error?.code).toBe("signup_disabled");
    expect((await request("auth.me", await cookieFor())).status).toBe(200);
  });
  it("blocks foreign-origin writes through the HTTP adapter", async () => {
    expect((await request("auth.updateProfile", await cookieFor(), { name: "forged" }, "https://evil.example")).status).toBe(403);
    const [row] = await getDb().select().from(users).where(eq(users.id, id));
    expect(row.name).toBe("Local security test");
  });
  it("rejects a logged-out cookie immediately while another session stays valid", async () => {
    const first = await cookieFor(); const second = await cookieFor();
    expect((await request("auth.logout", first, {})).status).toBe(200);
    await expect(authenticateRequest(new Headers({ cookie: first }))).rejects.toThrow();
    expect((await request("auth.me", second)).status).toBe(200);
  });
  it("requires the current password and rotates all prior sessions after a change", async () => {
    const first = await cookieFor(); const other = await cookieFor();
    const next = `${randomBytes(24).toString("base64url")}!aA1`;
    expect((await request("auth.changePassword", first, { newPassword: next })).status).toBe(400);
    expect((await request("auth.changePassword", first, { currentPassword: "wrong-password", newPassword: next })).status).toBe(400);
    const response = await request("auth.changePassword", first, { currentPassword: password, newPassword: next });
    expect(response.status).toBe(200);
    password = next;
    const fresh = response.headers.get("set-cookie")?.split(";")[0];
    expect(fresh).toBeTruthy();
    await expect(authenticateRequest(new Headers({ cookie: first }))).rejects.toThrow();
    await expect(authenticateRequest(new Headers({ cookie: other }))).rejects.toThrow();
    expect((await request("auth.me", fresh!)).status).toBe(200);
  });
  it("enforces temporary-password setup on the backend and restores access afterwards", async () => {
    await getDb().update(users).set({ mustChangePassword: true }).where(eq(users.id, id));
    const cookie = await cookieFor();
    expect((await request("auth.updateProfile", cookie, { name: "bypass" })).status).toBe(403);
    expect((await request("auth.me", cookie)).status).toBe(200);
    const next = `${randomBytes(24).toString("base64url")}!aA1`;
    const response = await request("auth.changePassword", cookie, { newPassword: next });
    expect(response.status).toBe(200);
    password = next;
    const fresh = response.headers.get("set-cookie")!.split(";")[0];
    expect((await request("auth.updateProfile", fresh, { name: "Setup completed" })).status).toBe(200);
  });
});
