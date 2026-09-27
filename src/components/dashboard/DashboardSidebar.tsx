import { usePreloadPanel } from "@/hooks/usePreloadPanel";
import { useNavigate } from "react-router";
import { type AuthUser } from "@/hooks/useAuth";
import { UserMenu } from "./UserMenu";
import { Avatar } from "./Avatar";
import { Logo } from "@/components/ansyra/Logo";
import { visibleGroups, type DashTabId } from "./dashboard-tabs";

// Re-exported as a type so DashboardHome.tsx keeps its existing import
// path unchanged. Type re-exports are erased at build time.
export type { DashTabId } from "./dashboard-tabs";

interface Props {
  activeTab: DashTabId;
  onTabChange: (t: DashTabId) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  user: AuthUser | null;
  // Mobile (<md): the sidebar is an overlay drawer instead of a fixed rail.
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function DashboardSidebar({ activeTab, onTabChange, collapsed, onToggleCollapse, user, mobileOpen, onMobileClose }: Props) {
  const navigate = useNavigate();
  const preloadPanel = usePreloadPanel();
  const groups = visibleGroups(user);

  return (
    <>
    {/* Mobile backdrop — tap to close the drawer. */}
    {mobileOpen && (
      <div
        className="fixed inset-0 z-40 md:hidden"
        style={{ background: "rgba(34,32,27,0.45)" }}
        onClick={onMobileClose}
        data-testid="sidebar-backdrop"
      />
    )}
    <aside
      className={`fixed left-0 top-0 z-50 h-full flex-col border-r transition-all duration-300 ${mobileOpen ? "flex w-64" : "hidden"} ${collapsed ? "md:w-16" : "md:w-64"} md:flex`}
      // The rail is its own layer, not the card colour. See `--rail` in
      // index.css for why the previous value made the selected item invisible.
      style={{ background: "var(--rail)", borderColor: "var(--rail-rule)" }}
      data-testid="dashboard-sidebar"
    >
      <div className="flex h-16 items-center justify-between border-b px-4" style={{ borderColor: "var(--rail-rule)" }}>
        {!collapsed && (
          <button
            className="flex cursor-pointer items-center gap-2 font-serif text-2xl tracking-wide"
            style={{ color: "var(--fg)" }}
            onClick={() => navigate("/")}
            data-testid="sidebar-brand"
          >
            <Logo size={24} />
            Ansyra
          </button>
        )}
        {/* ≥md: collapse toggle. <md: close the drawer. */}
        <button
          onClick={onToggleCollapse}
          className="ml-auto hidden rounded-md p-1.5 transition-colors md:block"
          style={{ color: "var(--fg-2)" }}
          data-testid="sidebar-collapse"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
        >
          <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {collapsed ? <path d="M9 18l6-6-6-6" /> : <path d="M15 18l-6-6 6-6" />}
          </svg>
        </button>
        <button
          onClick={onMobileClose}
          className="ml-auto rounded-md p-2 md:hidden"
          style={{ color: "var(--fg-2)" }}
          data-testid="sidebar-mobile-close"
          aria-label="Close navigation"
        >
          <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-4" aria-label="Dashboard sections">
        {groups.map((g) => (
          // The visible group heading is hidden when collapsed, so the group is
          // named for assistive tech either way.
          <div key={g.label} className="mb-4" role="group" aria-label={g.label}>
            {!collapsed && (
              <p className="mb-2 px-3 ansyra-label" style={{ color: "var(--fg-2)" }} aria-hidden="true">
                {g.label}
              </p>
            )}
            <div className="space-y-0.5">
              {g.items.map((item) => {
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { preloadPanel(item.id); onTabChange(item.id); }}
                    onPointerEnter={() => preloadPanel(item.id)}
                    onFocus={() => preloadPanel(item.id)}
                    data-testid={`sidebar-tab-${item.id}`}
                    className={`ansyra-rail-item flex w-full items-center gap-3 rounded-md px-3 py-2 text-left font-sans text-[13px] ${collapsed ? "justify-center" : ""}`}
                    style={{ minHeight: 38 }}
                    title={collapsed ? item.label : undefined}
                    aria-current={active ? "page" : undefined}
                  >
                    {/* The mark takes the accent only when current. An icon
                        tinted on every row would spend the accent on
                        decoration, which is the one thing Operate forbids it
                        for. */}
                    <span aria-hidden="true" style={{ color: active ? "var(--rail-accent)" : "inherit" }}>
                      <item.icon />
                    </span>
                    <span className={collapsed ? "sr-only" : undefined}>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t p-3" style={{ borderColor: "var(--rail-rule)" }}>
        <UserMenu align="up" label={`Account menu for ${user?.name ?? "your account"}`}>
          {!collapsed ? (
            <div className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-[var(--rail-hover)]" data-testid="sidebar-user-block">
              <Avatar name={user?.name} url={user?.avatarUrl} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-sans text-sm" style={{ color: "var(--fg)" }}>{user?.name || "User"}</p>
                <p className="truncate font-sans text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>{user?.email || ""}</p>
              </div>
              <IconChevronUpDown />
            </div>
          ) : (
            <div className="flex w-full justify-center py-1" title={user?.name ?? "Account"}>
              <Avatar name={user?.name} url={user?.avatarUrl} size={32} />
            </div>
          )}
        </UserMenu>
      </div>
    </aside>
    </>
  );
}

// ─── Icons ───────────────────────────────────────────────────────────────
function IconChevronUpDown() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--fg-2)" }}><path d="m8 9 4-4 4 4M8 15l4 4 4-4"/></svg>; }
