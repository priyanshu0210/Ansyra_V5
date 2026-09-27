// Notify the admins holding a given permission (main_admin implicitly holds
// all). Fire-and-forget — callers never await failure.
import { sql, eq, or, and, ne } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { users } from "@db/schema";
import { sendEmail } from "./email";
import type { AdminPermission } from "@contracts/constants";

/**
 * @param exceptUserId  The actor who triggered the notification. Admins can use
 *   the same channels members do (an admin filing a bug report is the ordinary
 *   case — the admin surfaces are where admin-only bugs get found), and without
 *   this a sole main_admin emails themselves their own report. Pass the actor's
 *   id from any route where the actor could also be a recipient.
 */
export function notifyAdmins(
  perm: AdminPermission,
  subject: string,
  text: string,
  exceptUserId?: string,
): void {
  (async () => {
    const isRecipient = perm === "manage_access_requests" ? eq(users.userKind, "main_admin") : or(
      eq(users.userKind, "main_admin"),
      and(
        eq(users.userKind, "admin"),
        sql`(${users.adminPermissions} ->> ${perm})::boolean IS TRUE`,
      ),
    );
    const rows = await getDb()
      .select({ email: users.email })
      .from(users)
      .where(exceptUserId ? and(isRecipient, ne(users.id, exceptUserId)) : isRecipient);

    const to = rows.map((r) => r.email).filter((e): e is string => !!e);
    // A lone admin acting on their own report leaves nobody to tell. Sending to
    // an empty recipient list is an error in most providers, so stop here.
    if (to.length === 0) return;
    await sendEmail({ to, subject, text });
  })().catch((err) => {
    console.warn("[notify] failed:", err instanceof Error ? err.message : err);
  });
}
