// ─────────────────────────────────────────────────────────────────────────────
// One-off bootstrap: create (or promote) the first platform admin.
//
//   npx tsx scripts/bootstrap-admin.ts <email> [--name "Full Name"]
//
// - If no Supabase auth user exists for <email>, one is created with a
//   generated temporary password (printed once — change it after first login).
// - The public.users profile row is created/updated as the main_admin.
// Idempotent: safe to re-run; an existing user is simply promoted.
//
// This is the ONLY way to get a working admin into a fresh deployment. Nothing
// else in the schema or the seeder produces one: `user_kind` defaults to
// 'member', and every admin route gates on it (api/middleware.ts → requireAdmin
// → isAdminKind). Creating further admins is a main_admin-only action in the
// admin console, so without this script the console is unreachable forever.
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
import { users } from "../db/schema";
import { upsertUserWithProfile } from "../api/queries/users";

const email = process.argv[2];
const nameIdx = process.argv.indexOf("--name");
const name = nameIdx > -1 ? process.argv[nameIdx + 1] : email?.split("@")[0];

if (!email || !email.includes("@")) {
  console.error("Usage: npx tsx scripts/bootstrap-admin.ts <email> [--name \"Full Name\"]");
  process.exit(1);
}

const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function main() {
  // Find an existing auth user by email (paginate defensively)
  let authUserId: string | null = null;
  for (let page = 1; page <= 10 && !authUserId; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    authUserId = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
    if (data.users.length < 200) break;
  }

  let tempPassword: string | null = null;
  if (!authUserId) {
    tempPassword = crypto.randomBytes(9).toString("base64url") + "!A1";
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { name },
    });
    if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
    authUserId = data.user.id;
    console.log(`Created auth user ${email} (${authUserId})`);
  } else {
    console.log(`Auth user already exists for ${email} (${authUserId})`);
  }

  await upsertUserWithProfile({
    id: authUserId,
    name: name ?? email,
    email,
    avatar: null,
    role: "other",
    organizationId: null,
  });
  // BOTH fields, deliberately.
  //
  // `user_kind` is the authoritative one — requireAdmin/requirePerm read it and
  // nothing reads `is_admin` for access any more (the RBAC migration kept the
  // column but demoted it to legacy). Setting only `is_admin`, as this script
  // used to, produced an account that every admin route rejected: the column
  // said admin, the gate asked user_kind, and user_kind still said 'member'.
  //
  // `main_admin` rather than `admin` because a plain admin needs a permission
  // checklist that only a main_admin can grant — bootstrapping to 'admin' would
  // leave the first account unable to grant itself anything.
  await getDb()
    .update(users)
    .set({ isAdmin: true, userKind: "main_admin" })
    .where(eq(users.id, authUserId));
  console.log(`✔ ${email} is now the main platform admin (user_kind=main_admin).`);
  if (tempPassword) {
    console.log(`\nTemporary password: ${tempPassword}`);
    console.log("Log in and change it immediately.");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
