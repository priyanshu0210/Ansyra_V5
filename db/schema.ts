import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  jsonb,
  numeric,
  date,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { DealStage } from "@contracts/stages";
import type {
  Counterargument,
  RecommendationEvidence,
  RecommendationOwner,
  RecommendationStatus,
} from "@contracts/recommendations";
import type { OutcomeHorizon, OutcomeType } from "@contracts/outcomes";
import type { ScenarioLinkCase, ScenarioRelation } from "@contracts/scenario-links";
import type { AssumptionCategory } from "@contracts/assumption-ledger";

// ─── Organizations ───────────────────────────────────────────────────────────

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = typeof organizations.$inferInsert;

// ─── Users ───────────────────────────────────────────────────────────────────
// NOTE: We intentionally avoid pgEnum here. The Supabase migration uses
// varchar CHECK constraints, not native PostgreSQL ENUM types, so Drizzle
// must match that — otherwise drizzle-kit will try to CREATE TYPE and conflict.

export const USER_ROLES = [
  "private_equity",
  "corporate_development",
  "ma_advisor",
  "freelancer",
  "other",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_KINDS = ["main_admin", "admin", "member"] as const;
export type UserKind = (typeof USER_KINDS)[number];

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: varchar("role", { length: 32 })
    .$type<UserRole>()
    .default("other")
    .notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  // Admin is a permission, not a persona — kept separate from `role` so an
  // admin can still be a PE partner / corp-dev lead in the product.
  // LEGACY: superseded by userKind below; kept in sync but no longer the gate.
  isAdmin: boolean("is_admin").default(false).notNull(),
  // The real authorization model (Phase 7). main_admin/admin are blocked from
  // product features; only members reach the product. adminPermissions is a
  // checklist of granular admin capabilities (main_admin implicitly has all).
  userKind: varchar("user_kind", { length: 16 })
    .$type<UserKind>()
    .default("member")
    .notNull(),
  adminPermissions: jsonb("admin_permissions")
    .$type<Record<string, boolean>>()
    .default({})
    .notNull(),
  // True while a user still holds an admin-issued temporary password; the
  // dashboard forces them through the change-password screen until cleared.
  mustChangePassword: boolean("must_change_password").default(false).notNull(),
  // Phase 8 profile fields.
  title: varchar("title", { length: 120 }),
  phone: varchar("phone", { length: 50 }),
  firm: varchar("firm", { length: 255 }),
  location: varchar("location", { length: 120 }),
  timezone: varchar("timezone", { length: 64 }),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  preferences: jsonb("preferences")
    .$type<Record<string, unknown>>()
    .default({})
    .notNull(),
  // Phase 8.6 data rights: set when the user requests account deletion.
  deletionRequestedAt: timestamp("deletion_requested_at", { withTimezone: true }),
  // Set by admin.removeUser when the account authored records that must stay
  // attributed (decisions carry a FK to users). Sign-in is banned at GoTrue and
  // authenticateRequest refuses the account; reversible via reactivateUser.
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Deals ───────────────────────────────────────────────────────────────────

export const deals = pgTable("deals", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  targetCompany: varchar("targetCompany", { length: 255 }).notNull(),
  stage: varchar("stage", { length: 50 })
    .$type<"sourcing" | "evaluation" | "diligence" | "negotiation" | "closing" | "integration">()
    .default("sourcing")
    .notNull(),
  status: varchar("status", { length: 50 })
    .$type<"active" | "on_hold" | "completed" | "cancelled">()
    .default("active")
    .notNull(),
  value: varchar("value", { length: 50 }),
  // Parsed numeric mirror of `value` (amount in millions + ISO currency),
  // written by the server on create/update so Analytics can sum correctly.
  // NULL when the display string is unparseable — the string is the fallback.
  valueAmount: numeric("value_amount"),
  valueCurrency: varchar("value_currency", { length: 3 }),
  // Sample-portfolio rows (Phase 11.7) — bulk-removable demo data.
  isDemo: boolean("is_demo").default(false).notNull(),
  industry: varchar("industry", { length: 100 }),
  createdBy: uuid("createdBy"),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type Deal = typeof deals.$inferSelect;
export type InsertDeal = typeof deals.$inferInsert;

// ─── Targets ─────────────────────────────────────────────────────────────────

export const targets = pgTable("targets", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  sector: varchar("sector", { length: 100 }).notNull(),
  ebitda: varchar("ebitda", { length: 50 }),
  revenue: varchar("revenue", { length: 50 }),
  // Numeric mirrors of the ebitda/revenue display strings (Phase 15.2), written
  // by the server on create/update so target financials can aggregate. NULL when
  // the display string is unparseable — the string stays the fallback.
  ebitdaAmount: numeric("ebitda_amount"),
  revenueAmount: numeric("revenue_amount"),
  finCurrency: varchar("fin_currency", { length: 3 }),
  // NOTE: was mistakenly `serial` (auto-increment); the real column is a plain
  // integer score 0-100 with DEFAULT 0 — see 20260627194059_create_app_tables.sql
  fitScore: integer("fitScore").default(0).notNull(),
  description: text("description"),
  // Sample-portfolio rows (Phase 11.7) — bulk-removable demo data.
  isDemo: boolean("is_demo").default(false).notNull(),
  status: varchar("status", { length: 50 })
    .$type<"new" | "screened" | "contacted" | "offer" | "declined" | "acquired">()
    .default("new")
    .notNull(),
  createdBy: uuid("createdBy"),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type Target = typeof targets.$inferSelect;
export type InsertTarget = typeof targets.$inferInsert;

// ─── Leads ───────────────────────────────────────────────────────────────────

export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  // FIX: nullable so contact-type leads don't need a company
  company: varchar("company", { length: 255 }),
  role: varchar("role", { length: 255 }),
  type: varchar("type", { length: 50 })
    .$type<"access_request" | "contact">()
    .default("access_request")
    .notNull(),
  subject: varchar("subject", { length: 255 }),
  message: text("message"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

// ─── AI result persistence ───────────────────────────────────────────────────
// Every AI mutation saves its output server-side in the same request, so a
// client remount can never orphan a result. Scoping mirrors deals/targets.

export interface AssumptionResult {
  reviewHistory?: import("../contracts/assumption-gate").AssumptionReview[];
  optimismScore: number;
  confidence: string;
  reasoning: string;
  recommendation: string;
  comparables?: string[];
}

export const assumptions = pgTable("assumptions", {
  id: serial("id").primaryKey(),
  dealId: integer("dealId")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  assumption: text("assumption").notNull(),
  // Closed vocabulary from contracts/assumption-ledger.ts. The axis cross-deal
  // assumption learning folds on — free text cannot be aggregated. NULL means
  // the row predates Phase 15.15 and is read as "other"; deliberately NOT
  // backfilled by guessing at the statement text.
  category: varchar("category", { length: 32 }).$type<AssumptionCategory>(),
  reviewer: varchar("reviewer", { length: 255 }),
  reviewerNote: text("reviewerNote"),
  result: jsonb("result").$type<AssumptionResult>(),
  createdBy: uuid("createdBy"),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
}, (t) => [index("idx_assumptions_organization_id").on(t.organizationId)]);

export type Assumption = typeof assumptions.$inferSelect;

export const culturalScores = pgTable("cultural_scores", {
  id: serial("id").primaryKey(),
  acquirer: varchar("acquirer", { length: 255 }).notNull(),
  target: varchar("target", { length: 255 }).notNull(),
  sector: varchar("sector", { length: 100 }),
  dealId: integer("dealId").references(() => deals.id, { onDelete: "set null" }),
  result: jsonb("result").$type<Record<string, unknown>>().notNull(),
  createdBy: uuid("createdBy"),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_cultural_scores_deal_id").on(t.dealId),
  index("idx_cultural_scores_organization_id").on(t.organizationId),
]);

export type CulturalScore = typeof culturalScores.$inferSelect;

export const regulatoryAnalyses = pgTable("regulatory_analyses", {
  id: serial("id").primaryKey(),
  target: varchar("target", { length: 255 }).notNull(),
  sector: varchar("sector", { length: 100 }).notNull(),
  geography: varchar("geography", { length: 100 }).notNull(),
  combinedMarketShare: varchar("combinedMarketShare", { length: 50 }),
  dealId: integer("dealId").references(() => deals.id, { onDelete: "set null" }),
  result: jsonb("result").$type<Record<string, unknown>>().notNull(),
  createdBy: uuid("createdBy"),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_regulatory_analyses_deal_id").on(t.dealId),
  index("idx_regulatory_analyses_organization_id").on(t.organizationId),
]);

export type RegulatoryAnalysis = typeof regulatoryAnalyses.$inferSelect;

export interface SynergyPeriodEntry {
  quarter: string; // "2026-Q3"
  planned: number;
  actual: number;
}

export interface SynergyCategory {
  category: string;
  planned: number;
  actual: number;
  // Optional quarterly phasing (Phase 15.6). When present these are
  // AUTHORITATIVE and planned/actual above are their server-derived sums;
  // absent means the category is unphased (pre-15.6 behaviour, still valid).
  periods?: SynergyPeriodEntry[];
}

export const synergyPlans = pgTable("synergy_plans", {
  id: serial("id").primaryKey(),
  dealId: integer("dealId")
    .notNull()
    .unique()
    .references(() => deals.id, { onDelete: "cascade" }),
  categories: jsonb("categories").$type<SynergyCategory[]>().default([]).notNull(),
  analysis: jsonb("analysis").$type<Record<string, unknown>>(),
  createdBy: uuid("createdBy"),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
}, (t) => [index("idx_synergy_plans_organization_id").on(t.organizationId)]);

export type SynergyPlan = typeof synergyPlans.$inferSelect;

// ─── Activity log ────────────────────────────────────────────────────────────

export const activityLog = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 20 })
    .$type<"deal" | "target" | "ai" | "admin">()
    .notNull(),
  action: varchar("action", { length: 120 }).notNull(),
  detail: text("detail"),
  dealId: integer("dealId"),
  targetId: integer("targetId"),
  userId: uuid("userId"),
  organizationId: uuid("organization_id"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type ActivityEntry = typeof activityLog.$inferSelect;

// ─── Chat Messages ────────────────────────────────────────────────────────────

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  // FIX: was integer — users.id is uuid
  userId: uuid("userId"),
  role: varchar("role", { length: 20 })
    .$type<"user" | "assistant">()
    .notNull(),
  content: text("content").notNull(),
  sessionId: varchar("sessionId", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

// ─── RBAC: per-user feature grants (Phase 7) ─────────────────────────────────

export const userFeatures = pgTable("user_features", {
  userId: uuid("user_id").notNull(),
  featureKey: varchar("feature_key", { length: 40 }).notNull(),
  grantedBy: uuid("granted_by"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type UserFeature = typeof userFeatures.$inferSelect;
export type InsertUserFeature = typeof userFeatures.$inferInsert;

// ─── Access requests: public intake → admin review → provisioned user ─────────

export const accessRequests = pgTable("access_requests", {
  id: serial("id").primaryKey(),
  requestType: varchar("request_type", { length: 16 })
    .$type<"individual" | "organization">()
    .default("individual")
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  company: varchar("company", { length: 255 }),
  role: varchar("role", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  reason: text("reason"),
  requestedFeatures: text("requested_features").array().notNull().default([]),
  status: varchar("status", { length: 16 })
    .$type<"pending" | "approved" | "declined">()
    .default("pending")
    .notNull(),
  decidedBy: uuid("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decisionNote: text("decision_note"),
  createdUserId: uuid("created_user_id"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type AccessRequest = typeof accessRequests.$inferSelect;
export type InsertAccessRequest = typeof accessRequests.$inferInsert;

// ─── Bug reports (Phase 8.5) ─────────────────────────────────────────────────
// Deliberately deviates from the ownership pattern: `reporter` (not createdBy),
// access is admin-permission-based, and members have no read-back endpoint.

export const bugReports = pgTable("bug_reports", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 200 }),
  description: text("description"),
  page: varchar("page", { length: 120 }),
  severity: varchar("severity", { length: 16 }).$type<"low" | "medium" | "high">(),
  screenshots: text("screenshots").array().notNull().default([]),
  status: varchar("status", { length: 16 })
    .$type<"open" | "triaged" | "fixed" | "closed">()
    .default("open")
    .notNull(),
  reporter: uuid("reporter"),
  organizationId: uuid("organization_id"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type BugReport = typeof bugReports.$inferSelect;
export type InsertBugReport = typeof bugReports.$inferInsert;

// ─── AI Target Discovery runs (Phase 9) ──────────────────────────────────────

// One researched candidate company. Every number is an AI estimate — the
// prompt forbids invented precision; unverifiable ⇒ confidence "Low".
export interface DiscoveryCandidate {
  name: string;
  hq: string;
  website?: string;
  estRevenue: string;
  estEbitda?: string;
  employees?: string;
  description: string;
  whyFit: string;
  fitScore: number; // 0–100
  fitRationale: string;
  risks: string[];
  confidence: "High" | "Medium" | "Low";
  sources: { title: string; url: string }[];
}

export interface DiscoveryInput {
  industries: string[];
  geography: string;
  sizeBuckets: string[];
  mustHaves?: string;
  dealBreakers?: string;
  count: number;
}

export const discoveryRuns = pgTable("discovery_runs", {
  id: serial("id").primaryKey(),
  input: jsonb("input").$type<DiscoveryInput>().notNull(),
  results: jsonb("results").$type<DiscoveryCandidate[]>().notNull(),
  createdBy: uuid("createdBy"),
  organizationId: uuid("organization_id"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type DiscoveryRun = typeof discoveryRuns.$inferSelect;
export type InsertDiscoveryRun = typeof discoveryRuns.$inferInsert;

// ─── Data Room: deal documents + AI analyses (Phase 10) ──────────────────────

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  dealId: integer("dealId")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  path: text("path").notNull(),
  mime: varchar("mime", { length: 120 }).notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdBy: uuid("createdBy"),
  organizationId: uuid("organization_id"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("idx_documents_deal_id").on(t.dealId)]);

export type DealDocument = typeof documents.$inferSelect;
export type InsertDealDocument = typeof documents.$inferInsert;

export const ANALYSIS_KINDS = ["summary", "red_flags", "key_terms", "dd_checklist"] as const;
export type AnalysisKind = (typeof ANALYSIS_KINDS)[number];

export const documentAnalyses = pgTable("document_analyses", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 20 }).$type<AnalysisKind>().notNull(),
  result: jsonb("result").$type<Record<string, unknown>>().notNull(),
  model: varchar("model", { length: 120 }),
  createdBy: uuid("createdBy"),
  organizationId: uuid("organization_id"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("idx_document_analyses_document_id").on(t.documentId)]);

export type DocumentAnalysis = typeof documentAnalyses.$inferSelect;
export type InsertDocumentAnalysis = typeof documentAnalyses.$inferInsert;

// ─── Decision Log & IC Memo (Phase 15.1) ─────────────────────────────────────
// Decisions are the reasoning artifact behind every stage transition — the core
// of the "decision intelligence" thesis. Append-only (never edited; a wrong
// entry is superseded by a new one). Forward stage moves flow THROUGH
// decisions.record so the stage-gate is real (see api/decisions-router.ts).

export const DECISION_TYPES = [
  "advance",
  "hold",
  "pass",
  "approve_loi",
  "approve_binding",
  "kill",
  "other",
] as const;
export type DecisionType = (typeof DECISION_TYPES)[number];

export interface DecisionOutcome {
  votesFor?: number;
  votesAgainst?: number;
  abstain?: number;
  conditions?: string[];
}

export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  decisionType: varchar("decision_type", { length: 24 }).$type<DecisionType>().notNull(),
  fromStage: varchar("from_stage", { length: 24 }),
  toStage: varchar("to_stage", { length: 24 }),
  rationale: text("rationale").notNull(),
  outcome: jsonb("outcome").$type<DecisionOutcome>(),
  decidedBy: uuid("decided_by").notNull(),
  organizationId: uuid("organization_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("decisions_deal_idx").on(t.dealId)]);

export type Decision = typeof decisions.$inferSelect;
export type InsertDecision = typeof decisions.$inferInsert;

// AI-assembled Investment Committee memo — a point-in-time snapshot composed
// from everything Ansyra knows about the deal. Persisted like other AI results.
export interface IcMemoRisk {
  source: "assumptions" | "cultural" | "regulatory" | "synergy" | "documents" | "other";
  risk: string;
  severity: "high" | "medium" | "low";
}

export interface IcMemoResult {
  thesis: string;
  dealSummary: string;
  valuation: { summary: string; keyMultiples: string };
  risks: IcMemoRisk[];
  openItems: string[];
  decisionHistory: string;
  recommendation: {
    verdict: "proceed" | "proceed_with_conditions" | "hold" | "decline";
    conditions: string[];
    reasoning: string;
  };
}

export const icMemos = pgTable("ic_memos", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  result: jsonb("result").$type<IcMemoResult>().notNull(),
  // Which recommendations this memo was composed from (Phase 15.8). Server-
  // written provenance, deliberately NOT inside `result`: that container is the
  // model's output shape, reproduced verbatim in the prompt, so a prompt edit or
  // an inventive AI response could clobber audit data kept there.
  recommendationIds: jsonb("recommendation_ids").$type<number[]>(),
  model: varchar("model", { length: 120 }),
  createdBy: uuid("created_by"),
  organizationId: uuid("organization_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("ic_memos_deal_idx").on(t.dealId)]);

export type IcMemo = typeof icMemos.$inferSelect;
export type InsertIcMemo = typeof icMemos.$inferInsert;

// ─── Deal economics (Phase 15.2) ─────────────────────────────────────────────
// One record per deal (unique deal_id, like synergy_plans). All amounts are in
// MILLIONS of `currency` — the same convention as deals.value_amount. Never mix
// currencies inside a record; portfolio aggregation groups BY currency (no FX
// invention). Derived columns (ev_ebitda, ev_revenue, irr/moic estimates) are
// recomputed SERVER-SIDE on every save from contracts/economics.ts — clients
// preview with the same functions but never supply the stored values.

export interface PeInputs {
  equityPct?: number;
  holdYears?: number;
  exitMultiple?: number;
}

export interface SourcesUsesEntry {
  label: string;
  side: "source" | "use";
  amount: number;
}

/** Closed-deal outcome — the raw material for the comps engine (Phase 15.4). */
export interface RealizedOutcome {
  exitDate?: string;
  exitEv?: number;
  realizedIrr?: number;
  realizedMoic?: number;
}

export const dealEconomics = pgTable("deal_economics", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id")
    .notNull()
    .unique()
    .references(() => deals.id, { onDelete: "cascade" }),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  enterpriseValue: numeric("enterprise_value"),
  equityValue: numeric("equity_value"),
  netDebt: numeric("net_debt"),
  targetEbitda: numeric("target_ebitda"),
  targetRevenue: numeric("target_revenue"),
  // Server-derived — read-only to clients.
  evEbitda: numeric("ev_ebitda"),
  evRevenue: numeric("ev_revenue"),
  peInputs: jsonb("pe_inputs").$type<PeInputs>(),
  irrEstimate: numeric("irr_estimate"),
  moicEstimate: numeric("moic_estimate"),
  sourcesUses: jsonb("sources_uses").$type<SourcesUsesEntry[]>(),
  realized: jsonb("realized").$type<RealizedOutcome>(),
  createdBy: uuid("created_by"),
  organizationId: uuid("organization_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
}, (t) => [index("deal_economics_multiples_idx").on(t.evEbitda)]);

export type DealEconomics = typeof dealEconomics.$inferSelect;
export type InsertDealEconomics = typeof dealEconomics.$inferInsert;

// ─── Deal milestones (Phase 15.3) ────────────────────────────────────────────
// The real clock of a deal: exclusivity windows, regulatory deadlines, signing,
// closing. Many-per-deal rows rather than columns on `deals` — the set varies by
// deal (a corporate buyer may have none of the PE ones). `dueDate` is a DATE
// (no time) because a closing date is a calendar day, not an instant; storing a
// timestamp would shift the date for anyone in another timezone.
// `lastNotified` makes the reminder job idempotent (see contracts/milestones.ts).

export const milestoneKinds = [
  "loi_signed",
  "exclusivity_expiry",
  "filing_submitted",
  "regulatory_deadline",
  "financing_commitment",
  "signing",
  "closing",
  "custom",
] as const;
export type MilestoneKindDb = (typeof milestoneKinds)[number];

export interface MilestoneNotified {
  d7?: string;
  d1?: string;
}

export const dealMilestones = pgTable("deal_milestones", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 32 }).$type<MilestoneKindDb>().notNull(),
  customLabel: varchar("custom_label", { length: 120 }),
  // `date` mode:"string" keeps this a plain "YYYY-MM-DD" end to end.
  dueDate: date("due_date", { mode: "string" }).notNull(),
  note: text("note"),
  completed: boolean("completed").default(false).notNull(),
  lastNotified: jsonb("last_notified").$type<MilestoneNotified>(),
  createdBy: uuid("created_by"),
  organizationId: uuid("organization_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
}, (t) => [
  index("deal_milestones_deal_idx").on(t.dealId),
  index("deal_milestones_due_idx").on(t.dueDate),
]);

export type DealMilestone = typeof dealMilestones.$inferSelect;
export type InsertDealMilestone = typeof dealMilestones.$inferInsert;

// ─── DD tracker (Phase 15.5) ─────────────────────────────────────────────────
// Diligence as a LIVING checklist rather than a one-shot AI report. Seeded from
// DD_CHECKLIST_ITEMS; `manually_set` is the linchpin of the import merge rule —
// once a human rules on an item, an AI analysis may append a note but can never
// restatus it (see contracts/dd-merge.ts).

export const ddStatuses = ["open", "requested", "received", "reviewed", "issue", "n_a"] as const;
export type DdStatusDb = (typeof ddStatuses)[number];

export const ddWorkstreams = [
  "legal", "financial", "tax", "hr", "it", "commercial", "regulatory", "other",
] as const;
export type DdWorkstreamDb = (typeof ddWorkstreams)[number];

export const ddItems = pgTable("dd_items", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  item: text("item").notNull(),
  workstream: varchar("workstream", { length: 24 }).$type<DdWorkstreamDb>().notNull(),
  status: varchar("status", { length: 16 }).$type<DdStatusDb>().default("open").notNull(),
  assigneeId: uuid("assignee_id"),
  note: text("note"),
  // Standard items can't be deleted (they get n_a instead) so the 12-item
  // checklist always stays auditable.
  isStandard: boolean("is_standard").default(false).notNull(),
  manuallySet: boolean("manually_set").default(false).notNull(),
  sourceAnalysisId: integer("source_analysis_id").references(() => documentAnalyses.id, {
    onDelete: "set null",
  }),
  createdBy: uuid("created_by"),
  organizationId: uuid("organization_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
}, (t) => [index("dd_items_deal_idx").on(t.dealId)]);

export type DdItem = typeof ddItems.$inferSelect;
export type InsertDdItem = typeof ddItems.$inferInsert;

// ─── Scenario analysis (Phase 15.6) ──────────────────────────────────────────
// Base/upside/downside cases composed from the deal's stress-tested assumptions.
// No IC accepts a single-point thesis; this is the range-thinking artifact.
// Immutable snapshots (regenerate to update), like ic_memos.

export interface ScenarioCase {
  name: "base" | "upside" | "downside";
  probabilityPct: number;
  narrative: string;
  drivers: { assumption: string; direction: "holds" | "breaks" | "exceeds" }[];
  thesisImpact: string;
  keyMetricDelta?: string;
}

export interface ScenarioResult {
  /** Missing for legacy snapshots; narrative cases have no calibrated probabilities. */
  probabilityBasis?: "not_estimated";
  cases: ScenarioCase[];
  summary: string;
  watchItems: string[];
}

export const scenarioAnalyses = pgTable("scenario_analyses", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  result: jsonb("result").$type<ScenarioResult>().notNull(),
  // How many assumptions fed this snapshot — powers the staleness hint.
  assumptionCount: integer("assumption_count").default(0).notNull(),
  model: varchar("model", { length: 120 }),
  createdBy: uuid("created_by"),
  organizationId: uuid("organization_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("scenario_analyses_deal_idx").on(t.dealId)]);

export type ScenarioAnalysis = typeof scenarioAnalyses.$inferSelect;
export type InsertScenarioAnalysis = typeof scenarioAnalyses.$inferInsert;

// ─── Deal comments (Phase 15.7) ──────────────────────────────────────────────
// The first collaboration primitive: a flat discussion thread per deal so team
// context lives next to the analyses instead of in Slack. Org members read the
// whole thread; edit/delete are own-row-only (enforced in SQL, not after-fetch).
// Deliberately the simplest feature in the codebase — the model blueprint.

export const dealComments = pgTable("deal_comments", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  createdBy: uuid("created_by").notNull(),
  organizationId: uuid("organization_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("deal_comments_deal_idx").on(t.dealId)]);

export type DealComment = typeof dealComments.$inferSelect;
export type InsertDealComment = typeof dealComments.$inferInsert;

// ─── Recommendations (Phase 15.8) ────────────────────────────────────────────
// AI outputs and human conclusions promoted to first-class, persistent records:
// a claim, why, what it rests on, what argues against it, and how sure. Linked
// to a deal AND to the stage the conclusion was reached at, because a conclusion
// drawn at evaluation is not a conclusion about closing.
//
// Accepted, unexpired recommendations are what the stage-gate checks
// (contracts/recommendation-gate.ts) and what the IC memo cites. A recommendation
// is never edited after acceptance — it is superseded, which is why
// `supersedes_id` is a real column and not a note in the rationale.
//
// The shapes of the two jsonb columns live in contracts/recommendations.ts
// rather than here, because the card, the AI drafter and the pure helpers all
// need them; db/schema.ts is the only other consumer.

export const recommendations = pgTable("recommendations", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  stage: varchar("stage", { length: 24 }).$type<DealStage>().notNull(),
  claim: text("claim").notNull(),
  rationale: text("rationale").notNull(),
  supportingEvidence: jsonb("supporting_evidence")
    .$type<RecommendationEvidence[]>()
    .default([])
    .notNull(),
  counterarguments: jsonb("counterarguments").$type<Counterargument[]>().default([]).notNull(),
  // Integer 0-100. The low/medium/high band is DERIVED, never stored — see
  // contracts/recommendations.ts::confidenceBand, the same split as
  // assumptions.result.optimismScore + src/lib/severity.ts. A real column
  // rather than a jsonb field because a human sets it and the panel filters
  // on it; buried in jsonb, every filter becomes a JS-side scan.
  confidence: integer("confidence").default(50).notNull(),
  owner: varchar("owner", { length: 8 }).$type<RecommendationOwner>().notNull(),
  status: varchar("status", { length: 12 })
    .$type<RecommendationStatus>()
    .default("draft")
    .notNull(),
  // NULL = never goes stale. Past = still readable, but stops satisfying the gate.
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  // The row this one replaces. Self-referential, so Drizzle needs the explicit
  // AnyPgColumn return type — without it tsc cannot break the inference cycle.
  supersedesId: integer("supersedes_id").references((): AnyPgColumn => recommendations.id, {
    onDelete: "set null",
  }),
  decidedBy: uuid("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  // Provenance for owner='ai'. NULL on human-authored rows.
  model: varchar("model", { length: 120 }),
  createdBy: uuid("created_by"),
  organizationId: uuid("organization_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
}, (t) => [
  index("recommendations_deal_idx").on(t.dealId),
  // The gate's exact read: accepted recommendations at this deal + stage.
  index("recommendations_gate_idx").on(t.dealId, t.stage, t.status),
  index("recommendations_supersedes_idx").on(t.supersedesId),
]);

export type Recommendation = typeof recommendations.$inferSelect;
export type InsertRecommendation = typeof recommendations.$inferInsert;

// ─── Outcome ledger (Phase 15.9) ─────────────────────────────────────────────
// What actually happened to a conclusion. Append-only, MANY per recommendation:
// the trajectory is the point — being wrong at 30 days and right at 6 months is
// exactly the signal a failure-pattern detector reads, and one editable verdict
// destroys it. There is deliberately no updated_at column and no update/delete
// procedure; the absence of that column IS the rule.
//
// Attaches to any DECIDED recommendation, rejected included. A rejected
// recommendation that turned out true is the highest-signal row in the system.

export const recommendationOutcomes = pgTable("recommendation_outcomes", {
  id: serial("id").primaryKey(),
  recommendationId: integer("recommendation_id")
    .notNull()
    .references(() => recommendations.id, { onDelete: "cascade" }),
  // Denormalised: the panel reads every outcome on a deal in ONE query to render
  // N cards, and ownerScope needs a deal-local read anyway.
  dealId: integer("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  outcomeType: varchar("outcome_type", { length: 24 }).$type<OutcomeType>().notNull(),
  outcomeSummary: text("outcome_summary").notNull(),
  horizon: varchar("horizon", { length: 16 }).$type<OutcomeHorizon>(),
  // Same shape as recommendations.supporting_evidence, so the per-kind resolver
  // in recommendations-router.ts reads it with no new code — and a future AI
  // outcome-suggester inherits the same citation discipline.
  metricLinks: jsonb("metric_links").$type<RecommendationEvidence[]>().default([]).notNull(),
  // The date of the READING, not of the insert. User-settable, because a 30-day
  // read written up in month two is still a 30-day read.
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  // This IS the ledger's "recorded by". It carries the standard name because
  // ownerScope (api/lib/scope.ts) reads `createdBy`/`organizationId`.
  createdBy: uuid("created_by"),
  organizationId: uuid("organization_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // The card's read: this recommendation's trajectory, in order.
  index("recommendation_outcomes_rec_idx").on(t.recommendationId, t.recordedAt),
  // The panel's batch read: every outcome on the deal, one query for N cards.
  index("recommendation_outcomes_deal_idx").on(t.dealId),
]);

export type RecommendationOutcome = typeof recommendationOutcomes.$inferSelect;
export type InsertRecommendationOutcome = typeof recommendationOutcomes.$inferInsert;

// ─── Assumption outcomes (Phase 15.15) ───────────────────────────────────────
// The other half of the learning loop. Since 15.9 a recommendation can be read
// back over time; an assumption could not — even though the assumption is the
// thing that actually turns out to be right or wrong.
//
// A near-exact sibling of recommendation_outcomes and APPEND-ONLY like it: no
// updatedAt, and no update/delete procedure exists anywhere in the API.
// Correcting a read means recording another, because the trajectory (wrong at
// 30 days, right at 6 months) IS the signal this table preserves.
//
// snake_case columns even though `assumptions` itself is camelCase: ownerScope
// reads `createdBy`/`organizationId` off the schema, and the older table simply
// predates the convention.
export const assumptionOutcomes = pgTable("assumption_outcomes", {
  id: serial("id").primaryKey(),
  assumptionId: integer("assumption_id")
    .notNull()
    .references(() => assumptions.id, { onDelete: "cascade" }),
  // Denormalised so the panel reads a deal's whole ledger in one query.
  dealId: integer("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  outcomeType: varchar("outcome_type", { length: 24 }).$type<OutcomeType>().notNull(),
  outcomeSummary: text("outcome_summary").notNull(),
  // NULL = ad-hoc; satisfies no scheduled horizon. Matched on the LABEL, never
  // inferred from recordedAt — recordedAt is user-settable by design.
  horizon: varchar("horizon", { length: 16 }).$type<OutcomeHorizon>(),
  // EXPLICIT, never inferred. When a recommendation outcome implies something
  // about the assumption underneath it, the person filing says so. Nothing
  // mutates an assumption because a recommendation outcome landed — a traceable
  // ledger, not hidden updates.
  recommendationOutcomeId: integer("recommendation_outcome_id").references(
    () => recommendationOutcomes.id,
    { onDelete: "set null" },
  ),
  metricLinks: jsonb("metric_links").$type<RecommendationEvidence[]>().default([]).notNull(),
  // The date of the READING, not of the insert.
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid("created_by"),
  organizationId: uuid("organization_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("assumption_outcomes_assumption_idx").on(t.assumptionId, t.recordedAt),
  index("assumption_outcomes_deal_idx").on(t.dealId),
  index("assumption_outcomes_learning_idx").on(t.organizationId, t.createdBy, t.horizon),
]);

export type AssumptionOutcome = typeof assumptionOutcomes.$inferSelect;
export type InsertAssumptionOutcome = typeof assumptionOutcomes.$inferInsert;

// ─── Recommendation ↔ scenario links (Phase 15.9) ────────────────────────────
// A claim, and the range it was drawn against. The link points at a SPECIFIC
// scenario_analyses snapshot: those rows are immutable and regenerating inserts
// a new one, so this pins what the recommender actually read. It never
// re-points at the latest run — a citation that follows a regeneration is not a
// citation. When a newer snapshot exists the UI says so (contracts/scenario-links).

export const recommendationScenarios = pgTable("recommendation_scenarios", {
  id: serial("id").primaryKey(),
  recommendationId: integer("recommendation_id")
    .notNull()
    .references(() => recommendations.id, { onDelete: "cascade" }),
  scenarioAnalysisId: integer("scenario_analysis_id")
    .notNull()
    .references(() => scenarioAnalyses.id, { onDelete: "cascade" }),
  dealId: integer("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  // NOT NULL with a default so the unique index below actually dedupes —
  // NULLs never collide in Postgres.
  caseName: varchar("case_name", { length: 12 })
    .$type<ScenarioLinkCase>()
    .default("all")
    .notNull(),
  relation: varchar("relation", { length: 24 })
    .$type<ScenarioRelation>()
    .default("supports")
    .notNull(),
  note: text("note"),
  createdBy: uuid("created_by"),
  organizationId: uuid("organization_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("recommendation_scenarios_unique_idx").on(
    t.recommendationId,
    t.scenarioAnalysisId,
    t.caseName,
  ),
  index("recommendation_scenarios_rec_idx").on(t.recommendationId),
  index("recommendation_scenarios_scenario_idx").on(t.scenarioAnalysisId),
  index("recommendation_scenarios_deal_idx").on(t.dealId),
]);

export type RecommendationScenario = typeof recommendationScenarios.$inferSelect;
export type InsertRecommendationScenario = typeof recommendationScenarios.$inferInsert;
