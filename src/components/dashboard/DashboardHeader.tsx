import { CurrencySelector } from "./CurrencySelector";
import type { AuthUser } from "@/hooks/useAuth";
import { UserMenu } from "./UserMenu";
import { Avatar } from "./Avatar";

export function DashboardHeader({ user, onMenu }: { user: AuthUser | null; onMenu?: () => void }) {
  return (
    <header
      className="flex min-h-16 gap-2 py-2 items-start justify-between border-b px-4 md:px-8"
      style={{ borderColor: "var(--fg-rule)", background: "var(--clear)" }}
      data-testid="dashboard-header"
    >
      <div className="flex min-h-11 items-center gap-3">
        {/* Hamburger — opens the sidebar drawer on <md only. */}
        {onMenu && (
          <button
            onClick={onMenu}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md border p-2 md:hidden"
            style={{ borderColor: "var(--fg-rule)", color: "var(--fg)" }}
            data-testid="header-hamburger"
            aria-label="Open navigation"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
        )}
        <p className="hidden ansyra-label sm:block" style={{ color: "var(--fg-2)" }}>Welcome back</p>
      </div>
      <div className="flex min-w-0 items-start gap-2 md:gap-3">
        <CurrencySelector compact />
        <span
          className="hidden h-11 items-center gap-2 rounded-full border px-3 lg:inline-flex"
          style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)" }}
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--fg)" }} />
          <span className="ansyra-label" style={{ color: "var(--fg-2)" }}>
            AI tools available
          </span>
        </span>
        <UserMenu align="down" label={`Account menu for ${user?.name ?? "your account"}`}>
          <div className="flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-2 py-1 transition-colors hover:bg-[var(--fg-surface)]" style={{ borderColor: "var(--fg-rule)" }} data-testid="header-user">
            <Avatar name={user?.name} url={user?.avatarUrl} size={26} />
            <span className="hidden max-w-44 truncate font-serif text-[15px] md:block" style={{ color: "var(--fg)" }}>{user?.name || "Advisor"}</span>
          </div>
        </UserMenu>
      </div>
    </header>
  );
}
