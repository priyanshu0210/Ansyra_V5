import type { DashTabId } from "./dashboard-tabs";

export const panelLoaders = {
  "pipeline": () => import("@/components/dashboard/DealPipeline").then((module) => ({ default: module.DealPipeline })),
  "targets": () => import("@/components/dashboard/TargetScreen").then((module) => ({ default: module.TargetScreen })),
  "comps": () => import("@/components/dashboard/CompsTable").then((module) => ({ default: module.CompsTable })),
  "analytics": () => import("@/components/dashboard/Analytics").then((module) => ({ default: module.Analytics })),
  "activity": () => import("@/components/dashboard/RecentActivity").then((module) => ({ default: module.RecentActivity })),
  "genome": () => import("@/components/dashboard/DealGenome").then((module) => ({ default: module.DealGenome })),
  "assumptions": () => import("@/components/dashboard/AssumptionLedger").then((module) => ({ default: module.AssumptionLedger })),
  "cultural": () => import("@/components/dashboard/CulturalCompatibility").then((module) => ({ default: module.CulturalCompatibility })),
  "regulatory": () => import("@/components/dashboard/RegulatoryRadar").then((module) => ({ default: module.RegulatoryRadar })),
  "synergy": () => import("@/components/dashboard/SynergyEngine").then((module) => ({ default: module.SynergyEngine })),
  "admin": () => import("@/components/dashboard/AdminPanel").then((module) => ({ default: module.AdminPanel })),
  "access-requests": () => import("@/components/dashboard/AccessRequests").then((module) => ({ default: module.AccessRequests })),
  "bugs": () => import("@/components/dashboard/BugReports").then((module) => ({ default: module.BugReports })),
};

export function preloadPanel(tab: DashTabId) {
  const key = tab === "admin-activity" ? "activity" : tab;
  if (key === "home") return;
  void panelLoaders[key]().catch(() => undefined);
}
