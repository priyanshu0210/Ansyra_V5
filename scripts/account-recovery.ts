// ─────────────────────────────────────────────────────────────────────────────
// Account recovery via the Supabase Admin API. Sends NO email, so it is not
// affected by the "email rate limit exceeded" error on /auth/v1/recover.
//
// Supabase's built-in SMTP is heavily throttled (a few messages per hour), and
// "Send password recovery" in the dashboard goes through it. Setting a password
// with the service role key is a direct admin write and bypasses that entirely.
//
//   List accounts (no secrets printed):
//     npx tsx scripts/account-recovery.ts list
//
//   Set a password (you choose it; it is read from the environment, never argv,
//   because CLI arguments leak into shell history and `ps` output):
//     read -rs NEW_PASSWORD && export NEW_PASSWORD
//     npx tsx scripts/account-recovery.ts set-password you@example.com
//     unset NEW_PASSWORD
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env. The service role
// key bypasses RLS: run this locally, never ship it to a browser.
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
import { users } from "../db/schema";

const cmd = process.argv[2];
const email = process.argv[3];

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Paginate defensively; the project may grow past one page. */
async function findAuthUser(target: string) {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === target.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

async function list() {
  const rows = await getDb()
    .select({
      email: users.email,
      name: users.name,
      userKind: users.userKind,
      isAdmin: users.isAdmin,
      mustChange: users.mustChangePassword,
    })
    .from(users);

  if (rows.length === 0) {
    console.log("No rows in public.users.");
    return;
  }
  // Admins first, so the account you are locked out of is at the top.
  rows.sort((a, b) => Number(b.userKind === "main_admin") - Number(a.userKind === "main_admin"));
  console.log("\nemail".padEnd(42) + "kind".padEnd(14) + "admin".padEnd(8) + "must_change");
  console.log("-".repeat(78));
  for (const r of rows) {
    console.log(
      String(r.email ?? "(none)").padEnd(42) +
        String(r.userKind).padEnd(14) +
        String(r.isAdmin).padEnd(8) +
        String(r.mustChange),
    );
  }
  console.log(
    "\nNote: main_admin and admin are blocked from product features by design;" +
      "\nonly `member` accounts reach the instruments.\n",
  );
}

async function setPassword() {
  const pw = process.env.NEW_PASSWORD;
  if (!email || !email.includes("@")) {
    console.error("Usage: npx tsx scripts/account-recovery.ts set-password <email>");
    process.exit(1);
  }
  if (!pw) {
    console.error(
      "NEW_PASSWORD is not set.\n" +
        "Set it without putting it in shell history:\n" +
        "  read -rs NEW_PASSWORD && export NEW_PASSWORD",
    );
    process.exit(1);
  }
  if (pw.length < 8) {
    console.error("Supabase requires at least 8 characters. Pick a longer one.");
    process.exit(1);
  }

  const user = await findAuthUser(email);
  if (!user) {
    console.error(`No Supabase auth user for ${email}. Run scripts/bootstrap-admin.ts first.`);
    process.exit(1);
  }

  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password: pw,
    email_confirm: true, // an unconfirmed address cannot sign in
  });
  if (error) throw new Error(`updateUserById failed: ${error.message}`);

  // Clear the forced-change flag so the app does not bounce you straight back
  // to the change-password screen with a password you just chose deliberately.
  await getDb().update(users).set({ mustChangePassword: false }).where(eq(users.id, user.id));

  console.log(`\n✔ Password updated for ${email} (${user.id}).`);
  console.log("  No email was sent, so the rate limit does not apply.");
  console.log("  The password is not printed or stored anywhere by this script.\n");
}

async function main() {
  if (cmd === "list") return list();
  if (cmd === "set-password") return setPassword();
  console.error(
    "Usage:\n" +
      "  npx tsx scripts/account-recovery.ts list\n" +
      "  npx tsx scripts/account-recovery.ts set-password <email>",
  );
  process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
