export const ErrorMessages = {
  unauthenticated: "Authentication required",
  insufficientRole: "Insufficient permissions",
  // Admins (any kind) are blocked from product features by owner decision.
  adminNoProduct: "Admin accounts can't use product features — create a member account.",
  featureLocked: "You don't have access to this feature. Ask your admin to enable it.",
} as const;

export const Paths = {
  login: "/login",
} as const;

// ─── RBAC feature catalog (single source of truth) ───────────────────────────
// Every product tab/route maps to one of these keys. A member reaches a feature
// only if they hold a matching row in public.user_features. The first 8 are the
// features live today; target_discovery (Phase 9) and documents (Phase 10) are
// reserved so grants can be issued before the features ship.
export const FEATURE_KEYS = [
  "pipeline",
  "targets",
  "genome",
  "assumptions",
  "cultural",
  "regulatory",
  "synergy",
  "analytics",
  "target_discovery",
  "documents",
  "decisions",
  "economics",
  "timeline",
  "comps",
  "dd_tracker",
  "scenarios",
  "comments",
  "recommendations",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

// The 8 features an existing/typical member gets by default (matches the
// migration backfill). Discovery + documents are opt-in, granted explicitly.
export const DEFAULT_MEMBER_FEATURES: FeatureKey[] = [
  "pipeline",
  "targets",
  "genome",
  "assumptions",
  "cultural",
  "regulatory",
  "synergy",
  "analytics",
  "decisions",
  "economics",
  "timeline",
  "comps",
  "dd_tracker",
  "scenarios",
  "comments",
  "recommendations",
];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  pipeline: "Deal Pipeline",
  targets: "Target Screening",
  genome: "Deal Genome",
  assumptions: "Assumption Ledger",
  cultural: "People & Integration Review",
  regulatory: "Regulatory Review",
  synergy: "Synergy Reality Engine",
  analytics: "Analytics",
  target_discovery: "AI Target Discovery",
  documents: "Document Intelligence",
  decisions: "Decision Log & Committee Memo",
  economics: "Deal Economics",
  timeline: "Deal Timeline & Deadlines",
  comps: "Comps Engine",
  dd_tracker: "DD Tracker",
  scenarios: "Scenario Analysis",
  comments: "Deal Comments",
  recommendations: "Recommendations",
};

// ─── Admin permission checklist ──────────────────────────────────────────────
// Granular admin capabilities. main_admin implicitly has all of these; a plain
// admin has only the ones set true in users.admin_permissions.
export const ADMIN_PERMISSION_KEYS = [
  "manage_users",
  "manage_admins",
  "manage_features",
  "view_user_summaries",
  "view_user_details",
  "manage_access_requests",
  "view_bug_reports",
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSION_KEYS)[number];

// ─── Due-diligence checklist (Document Intelligence, Phase 10) ───────────────
// The standard M&A DD checklist the dd_checklist analysis compares a document
// against — one output row per item, same order, item text matched verbatim.
export const DD_CHECKLIST_ITEMS: string[] = [
  "Corporate structure & cap table",
  "Material contracts",
  "Financial statements (3 years)",
  "Tax filings & liabilities",
  "IP ownership & licenses",
  "Employment agreements & benefits",
  "Litigation & disputes history",
  "Regulatory & compliance filings",
  "Real property & leases",
  "Insurance policies",
  "Environmental liabilities",
  "Change-of-control / consent requirements",
];

export const ADMIN_PERMISSION_LABELS: Record<AdminPermission, string> = {
  manage_users: "Create, reset & delete users",
  manage_admins: "Create & edit other admins",
  manage_features: "Grant & revoke member features",
  view_user_summaries: "View user summaries",
  view_user_details: "View full user details",
  manage_access_requests: "Review access requests",
  view_bug_reports: "View bug reports",
};
