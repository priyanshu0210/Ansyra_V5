// ─────────────────────────────────────────────────────────────────────────────
// Shared user-provisioning core, used by admin.createUser and access.approve.
// Creates the Supabase auth user (invite when possible, temp-password fallback
// when SMTP is absent), upserts the public.users profile, sets kind/legacy
// is_admin/forced-change, and grants member features. Callers own permission
// checks and activity logging.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { users, userFeatures } from "@db/schema";
import type { Organization, UserRole } from "@db/schema";
import { createOrganization, findOrganizationById } from "../queries/users";
import { adminClient } from "./supabase-clients";

export function generateTempPassword(): string {
  return crypto.randomBytes(9).toString("base64url") + "!A1";
}

export interface ProvisionInput {
  name: string;
  email: string;
  role: UserRole;
  /** Join an EXISTING organisation (validated to exist). Membership is the
   *  tenant boundary, so it is only ever assigned by id, never by name match. */
  organizationId?: string | null;
  /** Create a NEW organisation; a name that already exists is a CONFLICT. */
  organizationName?: string | null;
  isAdmin?: boolean;
  sendInvite?: boolean;
  password?: string;
  features?: string[];
  origin: string;
  grantedBy: string;
}

export interface ProvisionResult {
  userId: string;
  temporaryPassword: string | null;
  invited: boolean;
}

export async function provisionUser(input: ProvisionInput): Promise<ProvisionResult> {
  const admin = adminClient();
  const isAdmin = input.isAdmin ?? false;

  let org: Organization | null = null;
  if (input.organizationId) {
    org = await findOrganizationById(input.organizationId);
    if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "That organisation no longer exists." });
  } else if (input.organizationName?.trim()) {
    org = await createOrganization(input.organizationName);
  }
  const metadata = {
    name: input.name,
    role: input.role,
    organization_id: org?.id ?? null,
    organization_name: org?.name ?? null,
  };

  const conflict = () =>
    new TRPCError({ code: "CONFLICT", message: "An account with this email already exists." });
  const isConflict = (msg: string) => /already.*registered|already.*exists/i.test(msg);

  let userId: string;
  let temporaryPassword: string | null = null;
  let invited = false;
  let mustChangePassword = false;

  const wantInvite = (input.sendInvite ?? true) && !input.password;
  if (wantInvite) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
      data: metadata,
      redirectTo: `${input.origin}/welcome`,
    });
    if (!error && data.user) {
      userId = data.user.id;
      invited = true;
    } else if (error && isConflict(error.message)) {
      throw conflict();
    } else {
      const password = generateTempPassword();
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: input.email,
        password,
        email_confirm: true,
        user_metadata: metadata,
      });
      if (createErr || !created.user) {
        const msg = createErr?.message ?? "Failed to create account.";
        if (isConflict(msg)) throw conflict();
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
      userId = created.user.id;
      temporaryPassword = password;
      mustChangePassword = true;
    }
  } else {
    const password = input.password ?? generateTempPassword();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: input.email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (createErr || !created.user) {
      const msg = createErr?.message ?? "Failed to create account.";
      if (isConflict(msg)) throw conflict();
      throw new TRPCError({ code: "BAD_REQUEST", message: msg });
    }
    userId = created.user.id;
    temporaryPassword = input.password ? null : password;
    mustChangePassword = !input.password;
  }

  const db = getDb();
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(users)
        .values({
          id: userId,
          name: input.name,
          email: input.email,
          avatar: null,
          role: input.role,
          organizationId: org?.id ?? null,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            name: input.name,
            email: input.email,
            lastSignInAt: new Date(),
            role: sql`CASE WHEN ${users.role} = 'other' THEN ${input.role} ELSE ${users.role} END`,
            organizationId: sql`COALESCE(${users.organizationId}, ${org?.id ?? null})`,
          },
        });
      await tx
        .update(users)
        .set({
          isAdmin,
          userKind: isAdmin ? "admin" : "member",
          mustChangePassword,
        })
        .where(eq(users.id, userId));

      // Members get the selected feature grants; admins get none (blocked).
      await tx.delete(userFeatures).where(eq(userFeatures.userId, userId));
      const keys = isAdmin ? [] : (input.features ?? []);
      if (keys.length > 0) {
        await tx
          .insert(userFeatures)
          .values(keys.map((featureKey) => ({ userId, featureKey, grantedBy: input.grantedBy })))
          .onConflictDoNothing();
      }
    });
  } catch (cause) {
    // Supabase Auth and Postgres cannot share one transaction. Compensate the
    // external identity if the application-side transaction fails so retries
    // do not collide with an orphaned account.
    await db.delete(users).where(eq(users.id, userId)).catch(() => undefined);
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Account provisioning could not be completed. No account was kept; please retry.",
      cause,
    });
  }

  return { userId, temporaryPassword, invited };
}
