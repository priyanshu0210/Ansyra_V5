import { TRPCError } from "@trpc/server";
import { adminClient, anonClient } from "./supabase-clients";

/** Password changes revoke all prior sessions before a fresh browser session is issued. */
export async function revokeSessionsWithPassword(email: string, newPassword: string) {
  const login = await anonClient().auth.signInWithPassword({ email, password: newPassword });
  if (login.error || !login.data.session) {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "The password changed, but session cleanup could not finish. Please use password recovery before continuing." });
  }
  const revoked = await adminClient().auth.admin.signOut(login.data.session.access_token, "global");
  if (revoked.error) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Session cleanup could not finish. Please use password recovery before continuing." });
}
