import type { AuthUser } from "@/hooks/useAuth";
import type { AdminPermission, FeatureKey } from "@contracts/constants";

// Client-side mirrors of the server's authorization checks. The server is the
// real gate (see api/middleware.ts) — these only drive what the UI shows.

export function isAdminKind(kind: string | null | undefined): boolean {
  return kind === "admin" || kind === "main_admin";
}

export function isMainAdmin(user: AuthUser | null): boolean {
  return user?.userKind === "main_admin";
}

export function hasFeature(user: AuthUser | null, key: FeatureKey): boolean {
  return !!user?.features?.includes(key);
}

// main_admin implicitly has every permission; a plain admin needs the flag set.
export function hasAdminPerm(user: AuthUser | null, perm: AdminPermission): boolean {
  if (!user) return false;
  if (user.userKind === "main_admin") return true;
  if (perm === "manage_access_requests") return false;
  return !!user.adminPermissions?.[perm];
}
