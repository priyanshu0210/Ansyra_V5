import { beforeEach, expect, it, vi } from "vitest";
import type { User } from "@db/schema";
const signOut = vi.hoisted(() => vi.fn());
vi.mock("./lib/env", () => ({ env: { isProduction: false, siteUrl: "", supabaseUrl: "https://example.supabase.co" } }));
vi.mock("./lib/supabase-clients", () => ({ adminClient: () => ({ auth: { admin: { signOut } } }), anonClient: vi.fn() }));
import { authRouter } from "./auth-router";
import { encodeSession } from "./lib/session";
const cookie = `sb-example-auth-token=${encodeSession({ access_token: "verified-token", refresh_token: "refresh" })}`;
const context = () => ({ req: new Request("http://localhost/api", { headers: { cookie } }), resHeaders: new Headers(), user: { id: "user", userKind: "member" } as User });
beforeEach(() => signOut.mockReset().mockResolvedValue({ error: null }));
it.each(["local", "others", "global"] as const)("uses %s scope and only clears the current cookie when appropriate", async (scope) => {
  const ctx = context(); await authRouter.createCaller(ctx).logout({ scope });
  expect(signOut).toHaveBeenCalledWith("verified-token", scope);
  expect(ctx.resHeaders.has("set-cookie")).toBe(scope !== "others");
});
it("defaults ordinary logout to this session", async () => {
  await authRouter.createCaller(context()).logout(); expect(signOut).toHaveBeenCalledWith("verified-token", "local");
});
it("does not report success or clear the cookie if revocation fails", async () => {
  signOut.mockResolvedValue({ error: { message: "private upstream detail" } });
  const ctx = context(); await expect(authRouter.createCaller(ctx).logout({ scope: "global" })).rejects.toThrow("Sign-out could not be completed");
  expect(ctx.resHeaders.has("set-cookie")).toBe(false);
});
it("uses the refreshed token rather than an expired request token", async () => {
  const ctx = context(); ctx.resHeaders.set("set-cookie", `sb-example-auth-token=${encodeSession({ access_token: "fresh", refresh_token: "new" })}; HttpOnly`);
  await authRouter.createCaller(ctx).logout({ scope: "local" }); expect(signOut).toHaveBeenCalledWith("fresh", "local");
});
it("rejects unauthenticated callers", async () => {
  const ctx = { ...context(), user: undefined };
  await expect(authRouter.createCaller(ctx).logout({ scope: "global" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  expect(signOut).not.toHaveBeenCalled();
});
