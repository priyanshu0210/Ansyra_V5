import { and, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import * as schema from "@db/schema";
import type { InsertUser, UserRole } from "@db/schema";
import { getDb } from "./connection";

export async function findUserById(id: string) {
  const rows = await getDb()
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);
  return rows.at(0);
}

export async function upsertUser(data: InsertUser) {
  const db = getDb();
  const [row] = await db
    .insert(schema.users)
    .values(data)
    .onConflictDoUpdate({
      target: schema.users.id,
      set: {
        name: data.name,
        email: data.email,
        avatar: data.avatar,
        lastSignInAt: new Date(),
      },
    })
    .returning();
  return row;
}

// Upsert user record and set role + organization only when they weren't
// already populated (so we don't overwrite a real M&A Advisor with 'other'
// on a subsequent refresh).
export async function upsertUserWithProfile(data: {
  id: string;
  name: string | null;
  email: string | null;
  avatar: string | null;
  role: UserRole;
  organizationId: string | null;
}) {
  const db = getDb();
  const [row] = await db
    .insert(schema.users)
    .values({
      id: data.id,
      name: data.name,
      email: data.email,
      avatar: data.avatar,
      role: data.role,
      organizationId: data.organizationId,
    })
    .onConflictDoUpdate({
      target: schema.users.id,
      set: {
        name: data.name,
        email: data.email,
        avatar: data.avatar,
        lastSignInAt: new Date(),
        // Only overwrite role / organization if the current value is null-ish
        // or the default 'other' — otherwise leave the user's real profile alone.
        role: sql`CASE WHEN ${schema.users.role} IN ('other') THEN ${data.role} ELSE ${schema.users.role} END`,
        organizationId: sql`COALESCE(${schema.users.organizationId}, ${data.organizationId})`,
      },
    })
    .returning();
  return row;
}

/**
 * Create a NEW organisation, refusing a name that already exists.
 *
 * Replaces the old find-or-create-by-name helper, which was the one path that
 * could turn a typed string into membership of an existing tenant.
 *
 * Organisation membership is the tenant boundary, so it is never inferred from
 * a free-text match: an admin either selects an existing organisation by id
 * (validated in provisionUser) or creates a new one here — and a name that
 * already exists is a CONFLICT, never a silent join.
 */
export async function createOrganization(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new TRPCError({ code: "BAD_REQUEST", message: "Give the organisation a name." });
  const db = getDb();
  const [existing] = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(sql`lower(${schema.organizations.name}) = lower(${trimmed})`)
    .limit(1);
  if (existing) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `An organisation named "${trimmed}" already exists. Select it instead of creating a new one.`,
    });
  }
  const [row] = await db.insert(schema.organizations).values({ name: trimmed }).returning();
  return row;
}

export async function findOrganizationById(id: string) {
  const [row] = await getDb().select().from(schema.organizations).where(eq(schema.organizations.id, id)).limit(1);
  return row ?? null;
}

// Ambient re-export so we don't shadow `and` in call sites
export { and };
