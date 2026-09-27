// ─────────────────────────────────────────────────────────────────────────────
// Stable identity for the `thornevale-v1` synthetic dataset.
//
// Every id in here is a LITERAL, never generated. That is the whole point: the
// corpus has to be re-seedable, diffable and inspectable months from now, and a
// random uuid makes all three impossible. The two organisation ids are also the
// only namespace the dataset has — Postgres has no "dataset" column, so
// `organization_id IN (ORG_A, ORG_B)` is what identifies a seeded row, what the
// seeder's --reset scopes itself to, and what you filter on to inspect it.
//
// Pure data. No imports, no I/O — the unit layer pulls this in with no database.
// ─────────────────────────────────────────────────────────────────────────────

/** Bump when the shape of the corpus changes incompatibly, and seed alongside
 *  rather than over the previous version so the two can be diffed. */
export const DATASET_VERSION = "thornevale-v1";

/**
 * The clock the whole dataset is written against. Everything relative — a
 * milestone "in 12 days", a 90-day outcome read — is derived from this, so the
 * corpus does not silently drift into a different shape when re-seeded later.
 */
export const DATASET_EPOCH = new Date("2026-08-20T00:00:00.000Z");

/** Days from the epoch, as an ISO instant. Negative reaches into the past. */
export function epochPlusDays(days: number): Date {
  return new Date(DATASET_EPOCH.getTime() + days * 86_400_000);
}

/** Days from the epoch as a plain calendar day — for `date` columns, which are
 *  deliberately not timestamps (a closing date is a day, not an instant). */
export function epochPlusDaysIso(days: number): string {
  return epochPlusDays(days).toISOString().slice(0, 10);
}

// ─── Organisations ───────────────────────────────────────────────────────────
// ORG_A holds the entire corpus. ORG_B exists for one reason: to prove that a
// member of another firm cannot see any of it. Nothing is ever seeded into ORG_B
// beyond its single user, because a control that carries data is not a control.

export const ORG_A_ID = "b1f0a7c2-3d54-4e18-9a6b-0c7d2e5f8a10";
export const ORG_A_NAME = "Thornevale Diligence Sandbox";

export const ORG_B_ID = "c2e1b8d3-4a65-4f29-8b7c-1d8e3f6a9b21";
export const ORG_B_NAME = "Bellhaven Capital (Isolation Control)";

export const SANDBOX_ORG_IDS = [ORG_A_ID, ORG_B_ID] as const;

// ─── Users ───────────────────────────────────────────────────────────────────
// `users.id` IS the Supabase auth user id — the seeder creates the auth user
// with these exact ids rather than letting Supabase mint them, so a re-seed
// against a wiped auth schema still produces the same corpus.
//
// PASSWORDS ARE NOT HERE. Each user names the environment variable its password
// comes from; `credentials.ts` resolves it at runtime and generates one into a
// gitignored file if it is unset. Everything else about these accounts is public
// on purpose — a fixture you cannot read is a fixture nobody can debug — but a
// committed password becomes a working login for a stranger the moment the repo
// is public and the app is deployed.

export interface SeedUser {
  id: string;
  email: string;
  /** NAME of the environment variable holding this account's password — never
   *  the password itself. Resolved by credentials.ts::passwordFor. */
  passwordEnv: string;
  name: string;
  title: string;
  role: "private_equity" | "corporate_development" | "ma_advisor" | "freelancer" | "other";
  userKind: "main_admin" | "admin" | "member";
  organizationId: string | null;
  firm: string;
  /** null = every feature in FEATURE_KEYS. An explicit list = exactly those. */
  features: string[] | null;
  /** Granular admin capabilities. Meaningless on a member; main_admin gets all
   *  of them implicitly regardless of what is set here. */
  adminPermissions?: Record<string, boolean>;
}

export const USER_PARTNER: SeedUser = {
  id: "d3a2c9e4-5b76-4a3b-9c8d-2e9f4a7b0c32",
  email: "anvil.partner@thornevale.example.invalid",
  passwordEnv: "SEED_PARTNER_PASSWORD",
  name: "Rosalind Achterberg",
  title: "Partner, Industrials",
  role: "private_equity",
  userKind: "member",
  organizationId: ORG_A_ID,
  firm: "Thornevale Diligence Sandbox",
  features: null,
};

/** Deliberately short of `documents` and `economics`. The Data Room and the
 *  economics panel are the two surfaces most likely to leak past a feature gate,
 *  and a member who legitimately lacks them is the only way to prove they do not. */
export const USER_ASSOCIATE: SeedUser = {
  id: "e4b3d0f5-6c87-4b4c-8d9e-3f0a5b8c1d43",
  email: "anvil.associate@thornevale.example.invalid",
  passwordEnv: "SEED_ASSOCIATE_PASSWORD",
  name: "Tobias Lindqvist",
  title: "Associate",
  role: "private_equity",
  userKind: "member",
  organizationId: ORG_A_ID,
  firm: "Thornevale Diligence Sandbox",
  features: [
    "pipeline",
    "targets",
    "genome",
    "assumptions",
    "cultural",
    "regulatory",
    "synergy",
    "analytics",
    "decisions",
    "timeline",
    "comps",
    "dd_tracker",
    "scenarios",
    "comments",
    "recommendations",
  ],
};

/** A fully-featured member of a DIFFERENT organisation. Full grants on purpose:
 *  if isolation held only because this user lacked the feature, the test would
 *  be proving the wrong wall. */
export const USER_RIVAL: SeedUser = {
  id: "f5c4e1a6-7d98-4c5d-9e0f-4a1b6c9d2e54",
  email: "rival.partner@bellhaven.example.invalid",
  passwordEnv: "SEED_RIVAL_PASSWORD",
  name: "Marguerite Osei-Bonsu",
  title: "Managing Director",
  role: "private_equity",
  userKind: "member",
  organizationId: ORG_B_ID,
  firm: "Bellhaven Capital",
  features: null,
};

/** Admin kind, inside ORG_A, holding every feature grant. The grants are the
 *  point: they make `adminNoProduct` the only thing that can be rejecting them. */
export const USER_ADMIN: SeedUser = {
  id: "a6d5f2b7-8e09-4d6e-8f1a-5b2c7d0e3f65",
  email: "anvil.admin@thornevale.example.invalid",
  passwordEnv: "SEED_ADMIN_PASSWORD",
  name: "Halvard Ceaușescu-Reyes",
  title: "Platform Administrator",
  role: "other",
  userKind: "admin",
  organizationId: ORG_A_ID,
  firm: "Thornevale Diligence Sandbox",
  features: null,
  // A deliberately PARTIAL checklist. A plain admin needs each capability set
  // explicitly, and granting all of them would make the per-permission wall
  // untestable — `manage_admins` is withheld precisely so a refusal can be
  // observed on an account that is otherwise fully privileged.
  adminPermissions: {
    manage_users: true,
    manage_features: true,
    view_user_summaries: true,
    view_user_details: true,
    manage_access_requests: true,
    view_bug_reports: true,
  },
};

export const SEED_USERS: SeedUser[] = [USER_PARTNER, USER_ASSOCIATE, USER_RIVAL, USER_ADMIN];

// ─── Determinism ─────────────────────────────────────────────────────────────

/**
 * mulberry32 — 32-bit, seedable, and four lines long. Inlined rather than
 * depended on: the corpus must reproduce byte-for-byte on a machine that has
 * never run `npm install` against a lockfile we control, and a PRNG is the one
 * thing you cannot afford to have silently change under you.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A named stream, so adding values to one part of the corpus cannot shift the
 *  numbers in another. Each caller takes its own generator from its own seed. */
export function streamFor(name: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return mulberry32(h);
}

/** Round to `dp` decimals. Money in this corpus is millions, so 1 dp is the
 *  grain everything is authored at. */
export function round(n: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
