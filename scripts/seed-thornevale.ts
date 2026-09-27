// ─────────────────────────────────────────────────────────────────────────────
// Seeder for the `thornevale-v1` synthetic dataset.
//
//   npm run seed:thornevale            idempotent upsert — safe to re-run
//   npm run seed:thornevale -- --check report what exists, write nothing
//   npm run seed:thornevale:verify     validate the fixture AND what landed
//   npm run seed:thornevale -- --clear-scratch
//                                      delete ONLY the `[test …]` deals the
//                                      suites create, leaving the corpus alone
//   npm run seed:thornevale -- --reset DESTRUCTIVE: delete the two sandbox
//                                      organisations' rows, then reseed
//
// --reset and --clear-scratch are the only destructive paths, both are opt-in,
// both are scoped to the sandbox organisations, and no test calls either.
//
// --clear-scratch exists because the suites deliberately never delete what they
// create: a cleanup step is one more thing that can go wrong while holding a
// delete statement, and the whole point of this dataset is that it survives the
// run. The cost is that scratch deals accumulate — a few dozen per full pass —
// and eventually clutter the pipeline. This prunes them by NAME PREFIX, which
// cannot reach a corpus deal because none of them starts with "[test ".
//
// WHY THIS WRITES TO THE DATABASE DIRECTLY rather than driving the tRPC API:
// most of this corpus describes history. Deals sit at stages the stage-gate
// would refuse to move them to in one hop, assumptions carry AI results from
// months ago, and outcomes were recorded before the recommendations they read
// on had aged. An API-only seeder would have to fake a time machine.
//
// It does NOT, however, reimplement the app's arithmetic. Every derived value —
// deal value_amount/value_currency, the economics multiples, IRR and MOIC, the
// DD workstream mapping — is computed by importing the SAME pure functions the
// routers import. If those change, this corpus changes with them, which is the
// only way a fixture stays honest about the product it is fixture for.
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import { and, eq, inArray, sql } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";

import { getDb } from "../api/queries/connection";
import { env } from "../api/lib/env";
import {
  activityLog,
  assumptionOutcomes,
  assumptions,
  culturalScores,
  ddItems,
  dealComments,
  dealEconomics,
  dealMilestones,
  deals,
  decisions,
  documents,
  icMemos,
  organizations,
  recommendationOutcomes,
  recommendationScenarios,
  recommendations,
  regulatoryAnalyses,
  scenarioAnalyses,
  synergyPlans,
  targets,
  userFeatures,
  users,
} from "@db/schema";
import { parseDealValue } from "@contracts/value";
import { computeMultiples, deriveEv, quickIrrMoic } from "@contracts/economics";
import { DD_CHECKLIST_ITEMS, FEATURE_KEYS } from "@contracts/constants";
import { workstreamFor } from "@contracts/dd-merge";
import type { RecommendationEvidence } from "@contracts/recommendations";

import * as F from "../tests/fixtures/thornevale/index";
import {
  LOCAL_CREDENTIALS_FILE,
  credentialsFileExists,
  resolveSeedPasswords,
} from "../tests/fixtures/thornevale/credentials";

// ─── Mode ────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

/**
 * --check is evaluated FIRST, and that ordering is the whole point.
 *
 * It used to be third, behind --reset and --clear-scratch, which meant
 * `--reset --check` did not describe a reset — it performed one. The flag whose
 * entire job is "tell me what you would do" has to beat every destructive mode,
 * not lose to whichever branch happens to be listed above it.
 */
const DRY_RUN = argv.includes("--check");

/** Which destructive action a dry run is being asked to describe, if any. */
const DRY_RUN_TARGET: "reset" | "clear-scratch" | null = !DRY_RUN
  ? null
  : argv.includes("--reset")
    ? "reset"
    : argv.includes("--clear-scratch")
      ? "clear-scratch"
      : null;

const MODE = DRY_RUN
  ? "check"
  : argv.includes("--reset")
    ? "reset"
    : argv.includes("--clear-scratch")
      ? "clear-scratch"
      : argv.includes("--verify")
        ? "verify"
        : "seed";

/**
 * Resolved once per run. Missing passwords are generated and written to a
 * gitignored file, so a fresh clone can seed without anyone inventing a
 * credential and without one ever reaching git.
 */
const hadCredentialsFile = credentialsFileExists();
const SEED_PASSWORDS = resolveSeedPasswords();

let writes = 0;
let skips = 0;
const log = (s: string) => console.log(s);
const step = (s: string) => console.log(`\n── ${s} ${"─".repeat(Math.max(0, 60 - s.length))}`);

function supabase() {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Node 20/22 has no global WebSocket; the Supabase client builds a Realtime
 *  client at construction whether or not you use it. Same polyfill as boot.ts. */
async function polyfillWebSocket() {
  if (typeof globalThis.WebSocket === "undefined") {
    const wsMod = await import("ws");
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = wsMod.WebSocket;
  }
}

const at = (daysAgo: number) => new Date(F.DATASET_EPOCH.getTime() - daysAgo * 86_400_000);
const inDays = (days: number | null) =>
  days === null ? null : new Date(F.DATASET_EPOCH.getTime() + days * 86_400_000);

// ─── Handle → id maps, built as we go ────────────────────────────────────────

const dealIds = new Map<string, number>();
const assumptionIds = new Map<string, number>();
const scenarioIds = new Map<string, number>();
const recommendationIds = new Map<string, number>();
const recOutcomeIds = new Map<string, number>();

function userIdFor(which: "partner" | "associate"): string {
  return which === "partner" ? F.USER_PARTNER.id : F.USER_ASSOCIATE.id;
}

// ─── Reset ───────────────────────────────────────────────────────────────────

async function reset() {
  const db = getDb();
  const orgIds = [...F.SANDBOX_ORG_IDS];
  step("RESET — deleting the sandbox organisations' rows");

  const dealRows = await db
    .select({ id: deals.id })
    .from(deals)
    .where(inArray(deals.organizationId, orgIds));
  const ids = dealRows.map((d) => d.id);
  log(`  ${ids.length} deals in scope`);
  if (DRY_RUN) {
    log("  --check: NOTHING WAS DELETED.");
    return;
  }

  // Most children cascade from deals. The ones that do not are deleted by org.
  if (ids.length > 0) await db.delete(deals).where(inArray(deals.id, ids));
  await db.delete(targets).where(inArray(targets.organizationId, orgIds));
  await db.delete(activityLog).where(inArray(activityLog.organizationId, orgIds));

  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.organizationId, orgIds));
  for (const u of userRows) {
    await db.delete(userFeatures).where(eq(userFeatures.userId, u.id));
  }
  await db.delete(users).where(inArray(users.organizationId, orgIds));
  await db.delete(organizations).where(inArray(organizations.id, orgIds));

  const sb = supabase();
  for (const u of F.SEED_USERS) {
    const { error } = await sb.auth.admin.deleteUser(u.id);
    if (error && !/not found/i.test(error.message)) log(`  auth delete ${u.email}: ${error.message}`);
  }
  log("  reset complete");
}

/**
 * Delete only the scratch deals the test suites create.
 *
 * Scoped by NAME PREFIX inside the sandbox organisation. No corpus deal begins
 * with "[test ", so this physically cannot reach one — which is the property
 * that makes it safe to offer at all.
 */
async function clearScratch() {
  const db = getDb();
  step("CLEAR SCRATCH — removing test-created deals, leaving the corpus intact");

  const rows = await db
    .select({ id: deals.id, name: deals.name })
    .from(deals)
    .where(and(eq(deals.organizationId, F.ORG_A_ID), sql`${deals.name} like '[test %'`));

  log(`  ${rows.length} scratch deals in scope`);
  const corpusNames = new Set(F.SEED_DEALS.map((d) => d.name));
  const wouldHitCorpus = rows.filter((r) => corpusNames.has(r.name));
  if (wouldHitCorpus.length > 0) {
    throw new Error(
      `Refusing to delete: ${wouldHitCorpus.length} corpus deal(s) matched the scratch prefix. ` +
        `This should be impossible and means the naming convention has been broken.`,
    );
  }

  if (DRY_RUN) {
    log(`  --check: NOTHING WAS DELETED. ${rows.length} scratch deals would be removed.`);
    return;
  }

  if (rows.length > 0) {
    // Children cascade from deals.
    await db.delete(deals).where(inArray(deals.id, rows.map((r) => r.id)));
  }

  const remaining = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(deals)
    .where(eq(deals.organizationId, F.ORG_A_ID));
  log(`  ${rows.length} deleted; ${remaining[0].n} deals remain in the sandbox`);
  log(`  the ${F.SEED_DEALS.length} corpus deals are untouched`);
}

// ─── Organisations & users ───────────────────────────────────────────────────

async function seedOrganizations() {
  step("Organisations");
  const db = getDb();
  for (const [id, name] of [
    [F.ORG_A_ID, F.ORG_A_NAME],
    [F.ORG_B_ID, F.ORG_B_NAME],
  ] as const) {
    const [existing] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    if (existing) {
      log(`  = ${name}`);
      skips++;
      continue;
    }
    if (MODE === "check") {
      log(`  + ${name} (would create)`);
      continue;
    }
    await db.insert(organizations).values({ id, name });
    log(`  + ${name}`);
    writes++;
  }
}

async function seedUsers() {
  step("Users (Supabase auth + public.users + feature grants)");
  const db = getDb();
  const sb = supabase();

  for (const u of F.SEED_USERS) {
    // 1. The auth account. Supabase accepts an explicit id, which is what makes
    //    the whole corpus reproducible against a wiped auth schema.
    const { data: existingAuth } = await sb.auth.admin.getUserById(u.id);
    if (!existingAuth?.user) {
      if (MODE === "check") {
        log(`  + ${u.email} (would create auth account)`);
      } else {
        const { error } = await sb.auth.admin.createUser({
          id: u.id,
          email: u.email,
          password: SEED_PASSWORDS.get(u.email)!,
          email_confirm: true,
          user_metadata: { name: u.name, role: u.role },
        } as never);
        if (error) {
          // An account with this email but a different id is the one case we
          // cannot resolve automatically — say so loudly rather than limping on
          // with a corpus whose users do not match its fixture.
          throw new Error(
            `Could not create auth account for ${u.email}: ${error.message}\n` +
              `If an account with this email already exists under a different id, delete it in the ` +
              `Supabase dashboard (Authentication → Users) and re-run.`,
          );
        }
        writes++;
      }
    } else {
      // Keep synthetic fixture identity and locally generated credentials in sync.
      if (MODE === "seed" || MODE === "reset") {
        const { error } = await sb.auth.admin.updateUserById(u.id, { email: u.email, password: SEED_PASSWORDS.get(u.email)! });
        if (error) throw new Error(`Could not update fixture account: ${error.message}`);
      }
      skips++;
    }

    if (MODE === "check") continue;

    // 2. The application row.
    await db
      .insert(users)
      .values({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        userKind: u.userKind,
        organizationId: u.organizationId,
        title: u.title,
        firm: u.firm,
        isAdmin: u.userKind !== "member",
        adminPermissions: u.adminPermissions ?? {},
        mustChangePassword: false,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: u.email,
          name: u.name,
          role: u.role,
          userKind: u.userKind,
          organizationId: u.organizationId,
          title: u.title,
          firm: u.firm,
          isAdmin: u.userKind !== "member",
          adminPermissions: u.adminPermissions ?? {},
          mustChangePassword: false,
          updatedAt: new Date(),
        },
      });

    // 3. Feature grants. null in the fixture means "every feature".
    const wanted = u.features ?? [...FEATURE_KEYS];
    const held = await db
      .select({ k: userFeatures.featureKey })
      .from(userFeatures)
      .where(eq(userFeatures.userId, u.id));
    const heldSet = new Set(held.map((h) => h.k));
    const missing = wanted.filter((k) => !heldSet.has(k));
    if (missing.length > 0) {
      await db
        .insert(userFeatures)
        .values(missing.map((k) => ({ userId: u.id, featureKey: k })))
        .onConflictDoNothing();
    }
    // Revoke anything the fixture says they should NOT hold — the associate's
    // missing `documents`/`economics` grants are load-bearing for the RBAC
    // tests, so a stale grant from an earlier run has to be taken away.
    const extra = [...heldSet].filter((k) => !wanted.includes(k));
    if (extra.length > 0) {
      await db
        .delete(userFeatures)
        .where(and(eq(userFeatures.userId, u.id), inArray(userFeatures.featureKey, extra)));
    }

    log(`  ${u.email.padEnd(48)} ${u.userKind.padEnd(7)} ${wanted.length} features` +
      (missing.length ? ` (+${missing.length})` : "") +
      (extra.length ? ` (-${extra.length})` : ""));
  }
}

// ─── Deals, targets, economics, milestones ───────────────────────────────────

async function seedDeals() {
  step("Deals");
  const db = getDb();
  for (const d of F.SEED_DEALS) {
    const [existing] = await db
      .select()
      .from(deals)
      .where(and(eq(deals.name, d.name), eq(deals.organizationId, F.ORG_A_ID)))
      .limit(1);
    if (existing) {
      dealIds.set(d.key, existing.id);
      log(`  = ${d.name} (#${existing.id})`);
      skips++;
      continue;
    }
    if (MODE === "check") {
      log(`  + ${d.name} (would create)`);
      continue;
    }
    // The numeric mirror is derived by the SAME parse the router uses.
    const parsed = d.value ? parseDealValue(d.value) : null;
    const [row] = await db
      .insert(deals)
      .values({
        name: d.name,
        targetCompany: d.targetCompany,
        stage: d.stage,
        status: d.status,
        value: d.value ?? undefined,
        valueAmount: parsed ? String(parsed.amount) : null,
        valueCurrency: parsed ? parsed.currency : null,
        industry: d.industry ?? undefined,
        // NOT a demo row. `deals.removeSamples` deletes is_demo rows in bulk,
        // and comps/failure-patterns/CSV export all exclude them — so the
        // corpus must be non-demo both to survive and to be visible.
        isDemo: false,
        createdBy: F.USER_PARTNER.id,
        organizationId: F.ORG_A_ID,
        createdAt: at(d.milestones.length ? 200 : 60),
      })
      .returning();
    dealIds.set(d.key, row.id);
    log(`  + ${d.name} (#${row.id}) ${d.stage}/${d.status}`);
    writes++;
  }
}

async function seedTargets() {
  step("Targets");
  const db = getDb();
  let created = 0;
  let present = 0;
  for (const t of F.SEED_TARGETS) {
    const [existing] = await db
      .select({ id: targets.id })
      .from(targets)
      .where(and(eq(targets.name, t.name), eq(targets.organizationId, F.ORG_A_ID)))
      .limit(1);
    if (existing) {
      present++;
      skips++;
      continue;
    }
    if (MODE === "check") {
      created++;
      continue;
    }
    const eb = t.ebitda ? parseDealValue(t.ebitda) : null;
    const rev = t.revenue ? parseDealValue(t.revenue) : null;
    await db.insert(targets).values({
      name: t.name,
      sector: t.sector,
      ebitda: t.ebitda ?? undefined,
      revenue: t.revenue ?? undefined,
      ebitdaAmount: eb ? String(eb.amount) : null,
      revenueAmount: rev ? String(rev.amount) : null,
      finCurrency: (eb ?? rev)?.currency ?? null,
      fitScore: t.fitScore,
      description: t.description,
      status: t.status,
      isDemo: false,
      createdBy: F.USER_PARTNER.id,
      organizationId: F.ORG_A_ID,
    });
    created++;
    writes++;
  }
  log(`  ${created} ${MODE === "check" ? "to create" : "created"}, ${present} already present`);
}

async function seedEconomics() {
  step("Deal economics");
  const db = getDb();
  for (const d of F.SEED_DEALS) {
    if (!d.economics) continue;
    const dealId = dealIds.get(d.key);
    if (!dealId) continue;
    const e = d.economics;

    // Exactly the router's derivation, via the router's own functions.
    const ev = e.enterpriseValue ?? deriveEv({ equityValue: e.equityValue, netDebt: e.netDebt });
    const { evEbitda, evRevenue } = computeMultiples({
      ev,
      ebitda: e.targetEbitda,
      revenue: e.targetRevenue,
    });
    const { irr, moic } = quickIrrMoic({
      ev,
      ebitda: e.targetEbitda,
      equityPct: e.peInputs?.equityPct,
      holdYears: e.peInputs?.holdYears,
      exitMultiple: e.peInputs?.exitMultiple,
    });
    const str = (n: number | null | undefined) => (n == null ? null : String(n));

    if (MODE === "check") {
      log(`  ? ${d.name}: EV ${ev} · ${evEbitda ?? "n.m."}× · MOIC ${moic ?? "n.m."}`);
      continue;
    }
    const values = {
      dealId,
      currency: e.currency,
      enterpriseValue: str(ev),
      equityValue: str(e.equityValue),
      netDebt: str(e.netDebt),
      targetEbitda: str(e.targetEbitda),
      targetRevenue: str(e.targetRevenue),
      evEbitda: str(evEbitda),
      evRevenue: str(evRevenue),
      peInputs: e.peInputs,
      irrEstimate: str(irr),
      moicEstimate: str(moic),
      sourcesUses: e.sourcesUses,
      realized: e.realized,
      createdBy: F.USER_PARTNER.id,
      organizationId: F.ORG_A_ID,
    };
    await db
      .insert(dealEconomics)
      .values(values)
      .onConflictDoUpdate({
        target: dealEconomics.dealId,
        set: { ...values, createdBy: undefined, updatedAt: new Date() },
      });
    log(`  ${d.name.padEnd(24)} EV ${String(ev).padStart(8)} · ${evEbitda ?? "n.m."}× EBITDA · MOIC ${moic ?? "n.m."} · IRR ${irr ?? "n.m."}`);
    writes++;
  }
}

async function seedMilestones() {
  step("Milestones");
  const db = getDb();
  let created = 0;
  for (const d of F.SEED_DEALS) {
    const dealId = dealIds.get(d.key);
    if (!dealId) continue;
    for (const m of d.milestones) {
      const dueDate = F.milestoneDueDate(m);
      const [existing] = await db
        .select({ id: dealMilestones.id })
        .from(dealMilestones)
        .where(
          and(
            eq(dealMilestones.dealId, dealId),
            eq(dealMilestones.kind, m.kind),
            eq(dealMilestones.dueDate, dueDate),
          ),
        )
        .limit(1);
      if (existing) {
        skips++;
        continue;
      }
      if (MODE === "check") {
        created++;
        continue;
      }
      await db.insert(dealMilestones).values({
        dealId,
        kind: m.kind,
        customLabel: m.customLabel ?? null,
        dueDate,
        note: m.note ?? null,
        completed: m.completed,
        createdBy: F.USER_PARTNER.id,
        organizationId: F.ORG_A_ID,
      });
      created++;
      writes++;
    }
  }
  log(`  ${created} created`);
}

// ─── Documents ───────────────────────────────────────────────────────────────

async function seedDocuments() {
  step("Documents (real bytes → deal-documents bucket)");
  const db = getDb();
  const sb = supabase();
  const BUCKET = "deal-documents";
  let created = 0;
  let present = 0;
  let bytes = 0;

  for (const doc of F.SEED_DOCUMENTS) {
    const dealId = dealIds.get(doc.dealKey);
    if (!dealId) continue;
    const [existing] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.dealId, dealId), eq(documents.name, doc.name)))
      .limit(1);
    if (existing) {
      present++;
      skips++;
      continue;
    }
    if (MODE === "check") {
      created++;
      continue;
    }

    const data = doc.build();
    const ext = doc.mime === F.PDF_MIME ? "pdf" : doc.mime === F.DOCX_MIME ? "docx" : "txt";
    // Deterministic path, so a re-seed after a reset overwrites rather than
    // orphaning the previous object. The router's own paths are random uuids;
    // this one has to be reproducible, and it still satisfies the router's
    // `path.startsWith(dealId + "/")` rule.
    const slug = doc.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const path = `${dealId}/${slug}.${ext}`;

    const { error } = await sb.storage.from(BUCKET).upload(path, data, {
      contentType: doc.mime,
      upsert: true,
    });
    if (error) throw new Error(`storage upload failed for ${doc.name}: ${error.message}`);

    await db.insert(documents).values({
      dealId,
      name: doc.name,
      path,
      mime: doc.mime,
      sizeBytes: data.length,
      createdBy: F.USER_PARTNER.id,
      organizationId: F.ORG_A_ID,
      createdAt: at(30),
    });
    created++;
    bytes += data.length;
    writes++;
  }
  log(`  ${created} ${MODE === "check" ? "to upload" : "uploaded"} (${(bytes / 1024).toFixed(1)} kB), ${present} already present`);
}

// ─── Assumptions & scenarios ─────────────────────────────────────────────────

async function seedAssumptions() {
  step("Assumptions");
  const db = getDb();
  let created = 0;
  let present = 0;
  for (const a of F.SEED_ASSUMPTIONS) {
    const dealId = dealIds.get(a.dealKey);
    if (!dealId) continue;
    const [existing] = await db
      .select({ id: assumptions.id })
      .from(assumptions)
      .where(and(eq(assumptions.dealId, dealId), eq(assumptions.assumption, a.assumption)))
      .limit(1);
    if (existing) {
      assumptionIds.set(a.key, existing.id);
      // Re-sync the fields the fixture owns rather than skipping outright. The
      // fixture is the source of truth, and a corrected category or a newly
      // written reviewer response has to reach a corpus that already exists —
      // otherwise the only way to apply a fix is --reset, which throws away the
      // whole dataset to change one column.
      if (MODE !== "check") {
        await db
          .update(assumptions)
          .set({
            category: a.category,
            reviewer: a.reviewer,
            reviewerNote: a.reviewerNote,
            result: a.result,
            updatedAt: new Date(),
          })
          .where(eq(assumptions.id, existing.id));
      }
      present++;
      skips++;
      continue;
    }
    if (MODE === "check") {
      created++;
      continue;
    }
    const [row] = await db
      .insert(assumptions)
      .values({
        dealId,
        assumption: a.assumption,
        category: a.category,
        reviewer: a.reviewer,
        reviewerNote: a.reviewerNote,
        result: a.result,
        createdBy: F.USER_PARTNER.id,
        organizationId: F.ORG_A_ID,
        createdAt: at(40),
      })
      .returning({ id: assumptions.id });
    assumptionIds.set(a.key, row.id);
    created++;
    writes++;
  }
  log(`  ${created} ${MODE === "check" ? "to create" : "created"}, ${present} already present`);
}

async function seedScenarios() {
  step("Scenario snapshots");
  const db = getDb();
  let created = 0;
  let present = 0;
  for (const s of F.SEED_SCENARIOS) {
    const dealId = dealIds.get(s.dealKey);
    if (!dealId) continue;
    // Matched on the summary rather than on a natural key: scenario_analyses is
    // an immutable snapshot table with no unique constraint, and the summary is
    // the one field guaranteed distinct between the fixture's runs.
    const all = await db
      .select({ id: scenarioAnalyses.id, result: scenarioAnalyses.result })
      .from(scenarioAnalyses)
      .where(eq(scenarioAnalyses.dealId, dealId));
    const match = all.find((r) => r.result?.summary === s.result.summary);
    if (match) {
      scenarioIds.set(s.key, match.id);
      present++;
      skips++;
      continue;
    }
    if (MODE === "check") {
      created++;
      continue;
    }
    const [row] = await db
      .insert(scenarioAnalyses)
      .values({
        dealId,
        result: s.result,
        assumptionCount: s.assumptionCount,
        model: "thornevale-fixture/v1",
        createdBy: F.USER_PARTNER.id,
        organizationId: F.ORG_A_ID,
        createdAt: at(s.ageDays),
      })
      .returning({ id: scenarioAnalyses.id });
    scenarioIds.set(s.key, row.id);
    created++;
    writes++;
  }
  log(`  ${created} ${MODE === "check" ? "to create" : "created"}, ${present} already present`);
}

// ─── Recommendations, evidence, links, outcomes ──────────────────────────────

/** Resolve a fixture evidence handle into the shape the column actually holds.
 *  Returns null when the referenced row was not seeded, rather than writing a
 *  citation that points at nothing. */
function resolveEvidence(ref: F.EvidenceRef, dealKey: string): RecommendationEvidence | null {
  switch (ref.kind) {
    case "assumption": {
      const id = assumptionIds.get(ref.assumptionKey);
      return id ? { kind: "assumption", id, label: ref.label } : null;
    }
    case "scenario": {
      const id = scenarioIds.get(ref.scenarioKey);
      return id ? { kind: "scenario", id, label: ref.label } : null;
    }
    case "economics":
    case "cultural":
    case "regulatory":
    case "synergy":
    case "ic_memo": {
      // These are one-per-deal analyses; the deal id is the addressable handle
      // the seeder has at this point, and the label carries the meaning.
      const id = dealIds.get(ref.dealKey) ?? dealIds.get(dealKey);
      return id ? { kind: ref.kind, id, label: ref.label } : null;
    }
    default:
      return null;
  }
}

async function seedRecommendations() {
  step("Recommendations");
  const db = getDb();
  let created = 0;
  let present = 0;

  // Pass 1 — insert every row without supersedes_id, because a row cannot
  // reference a sibling that does not exist yet.
  for (const r of F.SEED_RECOMMENDATIONS) {
    const dealId = dealIds.get(r.dealKey);
    if (!dealId) continue;
    const [existing] = await db
      .select({ id: recommendations.id })
      .from(recommendations)
      .where(and(eq(recommendations.dealId, dealId), eq(recommendations.claim, r.claim)))
      .limit(1);
    if (existing) {
      recommendationIds.set(r.key, existing.id);
      // Re-sync the fields the fixture owns, exactly as seedAssumptions does.
      //
      // These are STATUS changes rather than new rows, so an author-scoped
      // cleanup cannot find them. A mutation test that disabled the tenancy wall
      // let another account accept a draft on a corpus deal, and nothing short of
      // this restored it — the row was already there, it was simply wrong.
      if (MODE !== "check") {
        const decided = r.status !== "draft";
        await db
          .update(recommendations)
          .set({
            stage: r.stage,
            status: r.status,
            confidence: r.confidence,
            owner: r.owner,
            expiresAt: inDays(r.expiresInDays),
            decidedBy: decided ? F.USER_PARTNER.id : null,
            decidedAt: decided ? at(r.ageDays - 1) : null,
            counterarguments: r.counterarguments,
            updatedAt: new Date(),
          })
          .where(eq(recommendations.id, existing.id));
      }
      present++;
      skips++;
      continue;
    }
    if (MODE === "check") {
      created++;
      continue;
    }
    const evidence = r.evidence
      .map((e) => resolveEvidence(e, r.dealKey))
      .filter((e): e is RecommendationEvidence => e !== null);
    const decided = r.status !== "draft";
    const [row] = await db
      .insert(recommendations)
      .values({
        dealId,
        stage: r.stage,
        claim: r.claim,
        rationale: r.rationale,
        supportingEvidence: evidence,
        counterarguments: r.counterarguments,
        confidence: r.confidence,
        owner: r.owner,
        status: r.status,
        expiresAt: inDays(r.expiresInDays),
        decidedBy: decided ? F.USER_PARTNER.id : null,
        decidedAt: decided ? at(r.ageDays - 1) : null,
        model: r.owner === "ai" ? "thornevale-fixture/v1" : null,
        createdBy: r.owner === "ai" ? F.USER_ASSOCIATE.id : F.USER_PARTNER.id,
        organizationId: F.ORG_A_ID,
        createdAt: at(r.ageDays),
      })
      .returning({ id: recommendations.id });
    recommendationIds.set(r.key, row.id);
    created++;
    writes++;
  }

  // Pass 2 — wire the supersede chains now that both ends exist.
  if (MODE !== "check") {
    for (const r of F.SEED_RECOMMENDATIONS) {
      if (!r.supersedesKey) continue;
      const id = recommendationIds.get(r.key);
      const target = recommendationIds.get(r.supersedesKey);
      if (!id || !target) continue;
      await db.update(recommendations).set({ supersedesId: target }).where(eq(recommendations.id, id));
    }
  }
  log(`  ${created} ${MODE === "check" ? "to create" : "created"}, ${present} already present`);
}

async function seedScenarioLinks() {
  step("Recommendation ↔ scenario links");
  const db = getDb();
  let created = 0;
  for (const l of F.SEED_SCENARIO_LINKS) {
    const recommendationId = recommendationIds.get(l.recommendationKey);
    const scenarioAnalysisId = scenarioIds.get(l.scenarioKey);
    if (!recommendationId || !scenarioAnalysisId) continue;
    const rec = F.SEED_RECOMMENDATIONS.find((r) => r.key === l.recommendationKey)!;
    const dealId = dealIds.get(rec.dealKey);
    if (!dealId) continue;
    if (MODE === "check") {
      created++;
      continue;
    }
    const res = await db
      .insert(recommendationScenarios)
      .values({
        recommendationId,
        scenarioAnalysisId,
        dealId,
        caseName: l.caseName,
        relation: l.relation,
        note: l.note ?? null,
        createdBy: F.USER_PARTNER.id,
        organizationId: F.ORG_A_ID,
      })
      // The table carries UNIQUE(recommendation_id, scenario_analysis_id,
      // case_name), which is exactly what makes re-seeding safe here.
      .onConflictDoNothing()
      .returning({ id: recommendationScenarios.id });
    if (res.length > 0) {
      created++;
      writes++;
    } else {
      skips++;
    }
  }
  log(`  ${created} created`);
}

async function seedOutcomes() {
  step("Outcome ledgers (append-only)");
  const db = getDb();
  let recCreated = 0;
  let asmCreated = 0;

  for (const o of F.SEED_RECOMMENDATION_OUTCOMES) {
    const recommendationId = recommendationIds.get(o.subjectKey);
    if (!recommendationId) continue;
    const rec = F.SEED_RECOMMENDATIONS.find((r) => r.key === o.subjectKey)!;
    const dealId = dealIds.get(rec.dealKey);
    if (!dealId) continue;
    const [existing] = await db
      .select({ id: recommendationOutcomes.id })
      .from(recommendationOutcomes)
      .where(
        and(
          eq(recommendationOutcomes.recommendationId, recommendationId),
          eq(recommendationOutcomes.outcomeSummary, o.outcomeSummary),
        ),
      )
      .limit(1);
    if (existing) {
      recOutcomeIds.set(`${o.subjectKey}|${o.horizon}`, existing.id);
      skips++;
      continue;
    }
    if (MODE === "check") {
      recCreated++;
      continue;
    }
    const [row] = await db
      .insert(recommendationOutcomes)
      .values({
        recommendationId,
        dealId,
        outcomeType: o.outcomeType,
        outcomeSummary: o.outcomeSummary,
        horizon: o.horizon,
        recordedAt: at(o.recordedDaysAgo),
        createdBy: F.USER_PARTNER.id,
        organizationId: F.ORG_A_ID,
        createdAt: at(o.recordedDaysAgo),
      })
      .returning({ id: recommendationOutcomes.id });
    recOutcomeIds.set(`${o.subjectKey}|${o.horizon}`, row.id);
    recCreated++;
    writes++;
  }

  for (const o of F.SEED_ASSUMPTION_OUTCOMES) {
    const assumptionId = assumptionIds.get(o.subjectKey);
    if (!assumptionId) continue;
    const asm = F.SEED_ASSUMPTIONS.find((a) => a.key === o.subjectKey)!;
    const dealId = dealIds.get(asm.dealKey);
    if (!dealId) continue;
    const [existing] = await db
      .select({ id: assumptionOutcomes.id })
      .from(assumptionOutcomes)
      .where(
        and(
          eq(assumptionOutcomes.assumptionId, assumptionId),
          eq(assumptionOutcomes.outcomeSummary, o.outcomeSummary),
        ),
      )
      .limit(1);
    if (existing) {
      skips++;
      continue;
    }
    if (MODE === "check") {
      asmCreated++;
      continue;
    }
    await db.insert(assumptionOutcomes).values({
      assumptionId,
      dealId,
      outcomeType: o.outcomeType,
      outcomeSummary: o.outcomeSummary,
      horizon: o.horizon,
      recordedAt: at(o.recordedDaysAgo),
      createdBy: F.USER_PARTNER.id,
      organizationId: F.ORG_A_ID,
      createdAt: at(o.recordedDaysAgo),
    });
    asmCreated++;
    writes++;
  }
  log(`  ${recCreated} recommendation outcomes, ${asmCreated} assumption outcomes`);
}

// ─── Decision log, diligence, comments ───────────────────────────────────────

async function seedDecisions() {
  step("Decision log");
  const db = getDb();
  let created = 0;
  let present = 0;
  for (const d of F.SEED_DECISIONS) {
    const dealId = dealIds.get(d.dealKey);
    if (!dealId) continue;
    const [existing] = await db
      .select({ id: decisions.id })
      .from(decisions)
      .where(and(eq(decisions.dealId, dealId), eq(decisions.rationale, d.rationale)))
      .limit(1);
    if (existing) {
      present++;
      skips++;
      continue;
    }
    if (MODE === "check") {
      created++;
      continue;
    }
    await db.insert(decisions).values({
      dealId,
      decisionType: d.decisionType,
      fromStage: d.fromStage,
      toStage: d.toStage,
      rationale: d.rationale,
      outcome: d.outcome,
      decidedBy: F.USER_PARTNER.id,
      organizationId: F.ORG_A_ID,
      createdAt: at(d.ageDays),
    });
    created++;
    writes++;
  }
  log(`  ${created} ${MODE === "check" ? "to create" : "created"}, ${present} already present`);
}

async function seedDdItems() {
  step("Diligence tracker");
  const db = getDb();
  let created = 0;

  // The twelve standard items, on every deal that has any diligence at all.
  // Exactly the router's seed: the same list, the same workstream mapping, and
  // the same reliance on UNIQUE(deal_id, item) for idempotency.
  const dealsWithDd = new Set(F.SEED_DD_OVERRIDES.map((o) => o.dealKey));
  for (const dealKey of dealsWithDd) {
    const dealId = dealIds.get(dealKey);
    if (!dealId || MODE === "check") continue;
    await db
      .insert(ddItems)
      .values(
        DD_CHECKLIST_ITEMS.map((item) => ({
          dealId,
          item,
          workstream: workstreamFor(item),
          isStandard: true,
          createdBy: F.USER_PARTNER.id,
          organizationId: F.ORG_A_ID,
        })),
      )
      .onConflictDoNothing();
  }

  // Then the deviations: statuses a human set, notes, and the extra items.
  for (const o of F.SEED_DD_OVERRIDES) {
    const dealId = dealIds.get(o.dealKey);
    if (!dealId) continue;
    if (MODE === "check") {
      created++;
      continue;
    }
    const [existing] = await db
      .select({ id: ddItems.id })
      .from(ddItems)
      .where(and(eq(ddItems.dealId, dealId), eq(ddItems.item, o.item)))
      .limit(1);
    if (existing) {
      await db
        .update(ddItems)
        .set({
          status: o.status,
          workstream: o.workstream,
          note: o.note,
          manuallySet: o.manuallySet,
          updatedAt: new Date(),
        })
        .where(eq(ddItems.id, existing.id));
      skips++;
    } else {
      await db.insert(ddItems).values({
        dealId,
        item: o.item,
        workstream: o.workstream,
        status: o.status,
        note: o.note,
        isStandard: o.isStandard,
        manuallySet: o.manuallySet,
        createdBy: F.USER_PARTNER.id,
        organizationId: F.ORG_A_ID,
      });
      created++;
      writes++;
    }
  }
  const total = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ddItems)
    .where(eq(ddItems.organizationId, F.ORG_A_ID));
  log(`  ${created} non-standard created; ${total[0]?.n ?? 0} items total in the sandbox`);
}

async function seedComments() {
  step("Deal comments");
  const db = getDb();
  let created = 0;
  let present = 0;
  for (const c of F.SEED_COMMENTS) {
    const dealId = dealIds.get(c.dealKey);
    if (!dealId) continue;
    const [existing] = await db
      .select({ id: dealComments.id })
      .from(dealComments)
      .where(and(eq(dealComments.dealId, dealId), eq(dealComments.body, c.body)))
      .limit(1);
    if (existing) {
      present++;
      skips++;
      continue;
    }
    if (MODE === "check") {
      created++;
      continue;
    }
    await db.insert(dealComments).values({
      dealId,
      body: c.body,
      editedAt: c.edited ? at(c.ageDays - 0.5) : null,
      createdBy: userIdFor(c.author),
      organizationId: F.ORG_A_ID,
      createdAt: at(c.ageDays),
    });
    created++;
    writes++;
  }
  log(`  ${created} ${MODE === "check" ? "to create" : "created"}, ${present} already present`);
}

// ─── Persisted AI results ────────────────────────────────────────────────────

async function seedAiResults() {
  step("Persisted analyses (synergy, cultural, regulatory, IC memo)");
  const db = getDb();

  // Synergy plan — one per deal, unique on deal_id.
  const kestrelId = dealIds.get("kestrel_retro");
  if (kestrelId && MODE !== "check") {
    const values = {
      dealId: kestrelId,
      categories: F.SEED_SYNERGY_CATEGORIES,
      analysis: {
        realisationPct: F.SYNERGY_REALISATION_PCT,
        summary:
          "Cost workstreams with a named owner and a dated plan delivered. Both revenue-linked workstreams did not, at 22% and 60% of case. This is the third time this group has underwritten revenue synergy and the third time it has come in around a quarter of case.",
        recommendation:
          "Apply a 25% realisation factor to revenue synergies in all future acquisition cases unless a named customer commitment exists at signing.",
      },
      createdBy: F.USER_PARTNER.id,
      organizationId: F.ORG_A_ID,
    };
    await db
      .insert(synergyPlans)
      .values(values)
      .onConflictDoUpdate({
        target: synergyPlans.dealId,
        set: { ...values, createdBy: undefined, updatedAt: new Date() },
      });
    log(`  synergy plan: ${F.SEED_SYNERGY_CATEGORIES.length} categories, ${F.SYNERGY_REALISATION_PCT}% realisation`);
    writes++;
  }

  for (const c of F.SEED_CULTURAL_SCORES) {
    const dealId = dealIds.get(c.dealKey);
    if (!dealId || MODE === "check") continue;
    const [existing] = await db
      .select({ id: culturalScores.id })
      .from(culturalScores)
      .where(eq(culturalScores.dealId, dealId))
      .limit(1);
    if (existing) {
      skips++;
      continue;
    }
    await db.insert(culturalScores).values({
      acquirer: c.acquirer,
      target: c.target,
      sector: c.sector,
      dealId,
      result: c.result,
      createdBy: F.USER_PARTNER.id,
      organizationId: F.ORG_A_ID,
      createdAt: at(21),
    });
    log(`  cultural score: ${c.target}`);
    writes++;
  }

  for (const r of F.SEED_REGULATORY_ANALYSES) {
    const dealId = dealIds.get(r.dealKey);
    if (!dealId || MODE === "check") continue;
    const [existing] = await db
      .select({ id: regulatoryAnalyses.id })
      .from(regulatoryAnalyses)
      .where(eq(regulatoryAnalyses.dealId, dealId))
      .limit(1);
    if (existing) {
      skips++;
      continue;
    }
    await db.insert(regulatoryAnalyses).values({
      target: r.target,
      sector: r.sector,
      geography: r.geography,
      combinedMarketShare: r.combinedMarketShare,
      dealId,
      result: r.result,
      createdBy: F.USER_PARTNER.id,
      organizationId: F.ORG_A_ID,
      createdAt: at(18),
    });
    log(`  regulatory analysis: ${r.target}`);
    writes++;
  }

  for (const m of F.SEED_IC_MEMOS) {
    const dealId = dealIds.get(m.dealKey);
    if (!dealId || MODE === "check") continue;
    const [existing] = await db
      .select({ id: icMemos.id })
      .from(icMemos)
      .where(eq(icMemos.dealId, dealId))
      .limit(1);
    if (existing) {
      skips++;
      continue;
    }
    const ids = m.recommendationKeys
      .map((k) => recommendationIds.get(k))
      .filter((x): x is number => typeof x === "number");
    await db.insert(icMemos).values({
      dealId,
      result: m.result,
      recommendationIds: ids,
      model: "thornevale-fixture/v1",
      createdBy: F.USER_PARTNER.id,
      organizationId: F.ORG_A_ID,
      createdAt: at(4),
    });
    log(`  IC memo: ${m.result.recommendation.verdict}, citing ${ids.length} recommendations`);
    writes++;
  }
}

// ─── Activity feed ───────────────────────────────────────────────────────────

async function seedActivity() {
  step("Activity feed");
  const db = getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(activityLog)
    .where(eq(activityLog.organizationId, F.ORG_A_ID));
  if (n > 0) {
    log(`  ${n} entries already present`);
    skips++;
    return;
  }
  if (MODE === "check") return;

  const entries: (typeof activityLog.$inferInsert)[] = [];
  for (const d of F.SEED_DEALS) {
    const dealId = dealIds.get(d.key);
    if (!dealId) continue;
    entries.push({
      type: "deal",
      action: "Deal created",
      detail: `${d.name} — ${d.targetCompany}`,
      dealId,
      userId: F.USER_PARTNER.id,
      organizationId: F.ORG_A_ID,
      createdAt: at(200),
    });
  }
  for (const dec of F.SEED_DECISIONS) {
    const dealId = dealIds.get(dec.dealKey);
    if (!dealId) continue;
    const deal = F.SEED_DEALS.find((x) => x.key === dec.dealKey)!;
    entries.push({
      type: "deal",
      action: dec.toStage && dec.toStage !== dec.fromStage ? "Stage updated" : "Decision recorded",
      detail: `${deal.name} → ${dec.toStage ?? dec.decisionType}`,
      dealId,
      userId: F.USER_PARTNER.id,
      organizationId: F.ORG_A_ID,
      createdAt: at(dec.ageDays),
    });
  }
  for (const doc of F.SEED_DOCUMENTS) {
    const dealId = dealIds.get(doc.dealKey);
    if (!dealId) continue;
    const deal = F.SEED_DEALS.find((x) => x.key === doc.dealKey)!;
    entries.push({
      type: "deal",
      action: "Document uploaded",
      detail: `${deal.name} · ${doc.name}`,
      dealId,
      userId: F.USER_PARTNER.id,
      organizationId: F.ORG_A_ID,
      createdAt: at(30),
    });
  }
  for (const a of F.SEED_ASSUMPTIONS) {
    const dealId = dealIds.get(a.dealKey);
    if (!dealId || !a.result) continue;
    entries.push({
      type: "ai",
      action: "Assumption stress-tested",
      detail: a.assumption.slice(0, 110),
      dealId,
      userId: F.USER_ASSOCIATE.id,
      organizationId: F.ORG_A_ID,
      createdAt: at(40),
    });
  }
  for (const r of F.SEED_RECOMMENDATIONS) {
    const dealId = dealIds.get(r.dealKey);
    if (!dealId) continue;
    entries.push({
      type: "ai",
      action: r.status === "draft" ? "Recommendation drafted" : `Recommendation ${r.status}`,
      detail: r.claim.slice(0, 110),
      dealId,
      userId: F.USER_PARTNER.id,
      organizationId: F.ORG_A_ID,
      createdAt: at(r.ageDays),
    });
  }

  await db.insert(activityLog).values(entries);
  log(`  ${entries.length} entries created`);
  writes += entries.length;
}

// ─── Verification ────────────────────────────────────────────────────────────

async function verify() {
  step("Verifying what landed in the database");
  const db = getDb();
  const problems: string[] = [];

  const count = async (label: string, q: Promise<{ n: number }[]>, expected: number) => {
    const [{ n }] = await q;
    const ok = n >= expected;
    log(`  ${ok ? "OK  " : "FAIL"} ${label.padEnd(28)} ${String(n).padStart(5)} (expected >= ${expected})`);
    if (!ok) problems.push(`${label}: ${n} rows, expected at least ${expected}`);
    return n;
  };
  const m = F.datasetManifest();

  await count("organizations", db.select({ n: sql<number>`count(*)::int` }).from(organizations).where(inArray(organizations.id, [...F.SANDBOX_ORG_IDS])), 2);
  await count("users", db.select({ n: sql<number>`count(*)::int` }).from(users).where(inArray(users.organizationId, [...F.SANDBOX_ORG_IDS])), m.users);
  await count("deals", db.select({ n: sql<number>`count(*)::int` }).from(deals).where(eq(deals.organizationId, F.ORG_A_ID)), m.deals);
  await count("targets", db.select({ n: sql<number>`count(*)::int` }).from(targets).where(eq(targets.organizationId, F.ORG_A_ID)), m.targets);
  await count("documents", db.select({ n: sql<number>`count(*)::int` }).from(documents).where(eq(documents.organizationId, F.ORG_A_ID)), m.documents);
  await count("assumptions", db.select({ n: sql<number>`count(*)::int` }).from(assumptions).where(eq(assumptions.organizationId, F.ORG_A_ID)), m.assumptions);
  await count("assumption outcomes", db.select({ n: sql<number>`count(*)::int` }).from(assumptionOutcomes).where(eq(assumptionOutcomes.organizationId, F.ORG_A_ID)), m.assumptionOutcomes);
  await count("scenario snapshots", db.select({ n: sql<number>`count(*)::int` }).from(scenarioAnalyses).where(eq(scenarioAnalyses.organizationId, F.ORG_A_ID)), m.scenarioSnapshots);
  await count("recommendations", db.select({ n: sql<number>`count(*)::int` }).from(recommendations).where(eq(recommendations.organizationId, F.ORG_A_ID)), m.recommendations);
  await count("recommendation outcomes", db.select({ n: sql<number>`count(*)::int` }).from(recommendationOutcomes).where(eq(recommendationOutcomes.organizationId, F.ORG_A_ID)), m.recommendationOutcomes);
  await count("scenario links", db.select({ n: sql<number>`count(*)::int` }).from(recommendationScenarios).where(eq(recommendationScenarios.organizationId, F.ORG_A_ID)), m.scenarioLinks);
  await count("decisions", db.select({ n: sql<number>`count(*)::int` }).from(decisions).where(eq(decisions.organizationId, F.ORG_A_ID)), m.decisions);
  await count("dd items", db.select({ n: sql<number>`count(*)::int` }).from(ddItems).where(eq(ddItems.organizationId, F.ORG_A_ID)), 24);
  await count("comments", db.select({ n: sql<number>`count(*)::int` }).from(dealComments).where(eq(dealComments.organizationId, F.ORG_A_ID)), m.comments);
  await count("economics", db.select({ n: sql<number>`count(*)::int` }).from(dealEconomics).where(eq(dealEconomics.organizationId, F.ORG_A_ID)), 7);
  await count("milestones", db.select({ n: sql<number>`count(*)::int` }).from(dealMilestones).where(eq(dealMilestones.organizationId, F.ORG_A_ID)), 26);
  await count("activity entries", db.select({ n: sql<number>`count(*)::int` }).from(activityLog).where(eq(activityLog.organizationId, F.ORG_A_ID)), 50);

  // Relational spot-checks that a row count cannot catch.
  step("Relational checks");
  const orphanEvidence = await db
    .select({ id: recommendations.id, claim: recommendations.claim })
    .from(recommendations)
    .where(
      and(
        eq(recommendations.organizationId, F.ORG_A_ID),
        sql`jsonb_array_length(${recommendations.supportingEvidence}) = 0`,
        eq(recommendations.owner, "ai"),
      ),
    );
  log(`  AI recommendations with no evidence: ${orphanEvidence.length}`);

  const supersedeChain = await db
    .select({ id: recommendations.id, supersedesId: recommendations.supersedesId })
    .from(recommendations)
    .where(and(eq(recommendations.organizationId, F.ORG_A_ID), sql`${recommendations.supersedesId} is not null`));
  log(`  supersede links wired: ${supersedeChain.length}`);
  if (supersedeChain.length < 1) problems.push("no supersede chain was wired");

  const superseded = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(recommendations)
    .where(and(eq(recommendations.organizationId, F.ORG_A_ID), eq(recommendations.status, "superseded")));
  log(`  superseded recommendations: ${superseded[0].n}`);

  const expired = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(recommendations)
    .where(
      and(
        eq(recommendations.organizationId, F.ORG_A_ID),
        eq(recommendations.status, "accepted"),
        sql`${recommendations.expiresAt} < now()`,
      ),
    );
  log(`  accepted-but-expired recommendations: ${expired[0].n}`);
  if (expired[0].n < 1) problems.push("no expired-but-accepted recommendation — the expiry path is untested");

  const blocking = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(assumptions)
    .where(
      and(
        eq(assumptions.organizationId, F.ORG_A_ID),
        sql`(${assumptions.result} -> 'optimismScore')::numeric > 80`,
        sql`coalesce(trim(${assumptions.reviewerNote}), '') = ''`,
      ),
    );
  log(`  assumptions currently blocking advancement: ${blocking[0].n}`);
  if (blocking[0].n < 1) problems.push("no blocking assumption — the assumption gate is untested");

  const nullCategory = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(assumptions)
    .where(and(eq(assumptions.organizationId, F.ORG_A_ID), sql`${assumptions.category} is null`));
  log(`  assumptions with a null category (pre-15.15 shape): ${nullCategory[0].n}`);

  const realised = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(dealEconomics)
    .where(and(eq(dealEconomics.organizationId, F.ORG_A_ID), sql`${dealEconomics.realized} is not null`));
  log(`  deals with a realised outcome (comps input): ${realised[0].n}`);
  if (realised[0].n < 1) problems.push("no realised outcome — the comps engine has nothing to compute against");

  return problems;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  await polyfillWebSocket();

  console.log(`\n╔══ Thornevale seeder — dataset "${F.DATASET_VERSION}" — mode: ${MODE} ══`);
  console.log(`║  Organisation A (the corpus):  ${F.ORG_A_ID}  ${F.ORG_A_NAME}`);
  console.log(`║  Organisation B (isolation):   ${F.ORG_B_ID}  ${F.ORG_B_NAME}`);
  console.log("╚" + "═".repeat(78));

  // Validate the FIXTURE before touching the database. A corpus that does not
  // satisfy its own rules should never reach Postgres.
  const fixtureProblems = F.validateDataset();
  if (fixtureProblems.length > 0) {
    console.error(`\nFixture failed validation with ${fixtureProblems.length} problem(s):`);
    for (const p of fixtureProblems) console.error(`  - ${p}`);
    process.exit(1);
  }
  log("\nFixture validation: clean");

  // A dry run of a destructive flag describes it and stops. It must never fall
  // through into the seeding path.
  if (DRY_RUN_TARGET === "reset") {
    await reset();
    process.exit(0);
  }
  if (DRY_RUN_TARGET === "clear-scratch") {
    await clearScratch();
    process.exit(0);
  }

  if (MODE === "reset") await reset();

  if (MODE === "clear-scratch") {
    await clearScratch();
    process.exit(0);
  }

  if (MODE === "verify") {
    // Rebuild the handle maps from what is already in the database so the
    // relational checks can resolve.
    const db = getDb();
    const rows = await db.select({ id: deals.id, name: deals.name }).from(deals).where(eq(deals.organizationId, F.ORG_A_ID));
    for (const d of F.SEED_DEALS) {
      const hit = rows.find((r) => r.name === d.name);
      if (hit) dealIds.set(d.key, hit.id);
    }
    const problems = await verify();
    console.log(
      problems.length === 0
        ? "\n✓ Dataset verified — fixture is self-consistent and the database matches it.\n"
        : `\n✗ ${problems.length} problem(s):\n${problems.map((p) => "  - " + p).join("\n")}\n`,
    );
    process.exit(problems.length === 0 ? 0 : 1);
  }

  await seedOrganizations();
  await seedUsers();
  await seedDeals();
  await seedTargets();
  await seedEconomics();
  await seedMilestones();
  await seedDocuments();
  await seedAssumptions();
  await seedScenarios();
  await seedRecommendations();
  await seedScenarioLinks();
  await seedOutcomes();
  await seedDecisions();
  await seedDdItems();
  await seedComments();
  await seedAiResults();
  await seedActivity();

  step("Summary");
  log(`  ${writes} rows written, ${skips} already present`);
  if (MODE === "check") {
    log("  (--check: nothing was written)");
  } else {
    const problems = await verify();
    if (problems.length > 0) {
      console.error(`\n✗ Seed completed but verification found ${problems.length} problem(s):`);
      for (const p of problems) console.error(`  - ${p}`);
      process.exit(1);
    }
    // Print the password ONLY on the run that generated it. Echoing a
    // credential on every seed is how it ends up in a terminal scrollback, a
    // screen recording, or a pasted log.
    const credentialLine = hadCredentialsFile
      ? `║    ${F.USER_PARTNER.email}\n║    (password in ${LOCAL_CREDENTIALS_FILE})`
      : `║    ${F.USER_PARTNER.email}\n║    ${SEED_PASSWORDS.get(F.USER_PARTNER.email)}\n║\n║  ^ GENERATED THIS RUN and saved to .env.seed.local (gitignored).\n║    This is the only copy. Back it up if you care about it.`;

    console.log(`
╔══ Seed complete ═══════════════════════════════════════════════════════════
║  Log in at http://localhost:3000/login as:
${credentialLine}
║  Then open Project Anvil from the pipeline.
║
║  The data is RETAINED. Nothing here is cleaned up by any test.
║  To remove it deliberately:  npm run seed:thornevale -- --reset
╚════════════════════════════════════════════════════════════════════════════
`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("\nSeeder failed:", err);
  process.exit(1);
});
