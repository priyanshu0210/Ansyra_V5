import type React from "react";
import { type AuthUser } from "@/hooks/useAuth";
import { type FeatureKey } from "@contracts/constants";
import { isAdminKind, hasAdminPerm } from "@/lib/rbac";
import {
  IconHome,
  IconGrid,
  IconSearch,
  IconBook,
  IconLedger,
  IconPeople,
  IconRadar,
  IconChart,
  IconGraph,
  IconClock,
  IconShield,
  IconInbox,
  IconBug,
} from "./dashboard-tab-icons";

// The sidebar's tab model, split out of DashboardSidebar.tsx so that file
// exports a component and nothing else (react-refresh/only-export-components).
// The nav icons moved with it and are deliberately NOT exported: they render
// only through GROUPS below, so this module exports no component at all and
// the rule is satisfied on both sides of the split. Logic is unchanged.

export const DASH_TAB_IDS = [
  "home",
  "pipeline",
  "targets",
  "genome",
  "assumptions",
  "cultural",
  "regulatory",
  "synergy",
  "analytics",
  "comps",
  "activity",
  "admin",
  "access-requests",
  "bugs",
  "admin-activity",
] as const;

export type DashTabId = (typeof DASH_TAB_IDS)[number];

// Product tabs that require a specific feature grant to appear for a member.
// Tabs not listed here (e.g. "activity") are visible to every member.
const TAB_FEATURE: Partial<Record<DashTabId, FeatureKey>> = {
  pipeline: "pipeline",
  targets: "targets",
  genome: "genome",
  assumptions: "assumptions",
  cultural: "cultural",
  regulatory: "regulatory",
  synergy: "synergy",
  analytics: "analytics",
  comps: "comps",
};

type Group = { label: string; items: { id: DashTabId; label: string; icon: IconComponent }[] };
type IconComponent = () => React.ReactElement;

const GROUPS: Group[] = [
  {
    label: "Overview",
    items: [
      { id: "home", label: "Home", icon: IconHome },
    ],
  },
  {
    label: "Deal Flow",
    items: [
      { id: "pipeline", label: "Deal Pipeline", icon: IconGrid },
      { id: "targets", label: "Target Screening", icon: IconSearch },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { id: "genome", label: "Deal Genome", icon: IconBook },
      { id: "assumptions", label: "Assumption Ledger", icon: IconLedger },
      { id: "cultural", label: "People & Integration Review", icon: IconPeople },
      { id: "regulatory", label: "Regulatory Review", icon: IconRadar },
      { id: "synergy", label: "Synergy Engine", icon: IconChart },
      { id: "comps", label: "Precedent Comps", icon: IconLedger },
    ],
  },
  {
    label: "Reporting",
    items: [
      { id: "analytics", label: "Analytics", icon: IconGraph },
      { id: "activity", label: "Recent Activity", icon: IconClock },
    ],
  },
];

// Which groups/items to show given the caller. Admins (any kind) see ONLY the
// admin group; members see product tabs whose feature they've been granted.
export function visibleGroups(user: AuthUser | null): Group[] {
  if (!user) return [];
  if (isAdminKind(user.userKind)) {
    const items: Group["items"] = [
      { id: "admin", label: "User Management", icon: IconShield },
    ];
    if (hasAdminPerm(user, "manage_access_requests")) {
      items.push({ id: "access-requests", label: "Access Requests", icon: IconInbox });
    }
    if (hasAdminPerm(user, "view_bug_reports")) {
      items.push({ id: "bugs", label: "Bug Reports", icon: IconBug });
    }
    items.push({ id: "admin-activity", label: "Admin Activity", icon: IconClock });
    return [{ label: "Administration", items }];
  }
  const features = user.features ?? [];
  return GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((it) => {
      const key = TAB_FEATURE[it.id];
      return !key || features.includes(key);
    }),
  })).filter((g) => g.items.length > 0);
}

// Flat list of tab ids the user may see — the Dashboard uses this to pick a
// safe landing tab and to route-guard bodies (never trust the sidebar alone).
export function visibleTabIds(user: AuthUser | null): DashTabId[] {
  return visibleGroups(user).flatMap((g) => g.items.map((it) => it.id));
}
