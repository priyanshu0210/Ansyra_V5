import { randomBytes, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { anonClient, adminClient } from "../../api/lib/supabase-clients";
import { assertActiveSession } from "../../api/lib/active-session";
import { authRouter } from "../../api/auth-router";
import { getSupabaseCookieName } from "../../api/auth/verify";
import { encodeSession } from "../../api/lib/session";
import type { User } from "../../db/schema";

it("revokes local, other and global sessions using the real isolated Supabase Auth service", async () => {
  const email = `session-scopes-${randomUUID()}@example.test`;
  const password = `${randomBytes(24).toString("base64url")}!Aa1`;
  const admin = adminClient();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Could not create isolated session fixture");
  const id = created.data.user.id;
  async function session() {
    const result = await anonClient().auth.signInWithPassword({ email, password });
    if (result.error || !result.data.session) throw new Error("Could not sign in isolated session fixture");
    return result.data.session;
  }
  try {
    const [a, b, c] = await Promise.all([session(), session(), session()]);
    const caller = (s: typeof a) => authRouter.createCaller({
      req: new Request("http://localhost/api", { headers: { cookie: `${getSupabaseCookieName()}=${encodeSession(s)}` } }),
      resHeaders: new Headers(), user: { id, userKind: "member" } as User,
    });
    await caller(a).logout({ scope: "local" });
    await expect(assertActiveSession(a.access_token, id)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await assertActiveSession(b.access_token, id); await assertActiveSession(c.access_token, id);
    await caller(b).logout({ scope: "others" });
    await assertActiveSession(b.access_token, id);
    await expect(assertActiveSession(c.access_token, id)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const d = await session();
    await caller(b).logout({ scope: "global" });
    await expect(assertActiveSession(b.access_token, id)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(assertActiveSession(d.access_token, id)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  } finally {
    const deleted = await admin.auth.admin.deleteUser(id);
    expect(deleted.error, "Isolated session fixture cleanup").toBeNull();
  }
});
