import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";

// One dropdown, rendered by both the sidebar user block and the header name.
// `align` controls whether it opens upward (sidebar, bottom of screen) or
// downward (header). The trigger content is passed as children.
export function UserMenu({
  children,
  label,
  align = "down",
  className,
}: {
  children: React.ReactNode;
  /** Accessible name for the trigger. Without it the button reads as a run-on
   *  of the avatar glyph, the display name and the email. */
  label?: string;
  align?: "up" | "down";
  className?: string;
}) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (path: string) => { setOpen(false); navigate(path); };

  const items: { label: string; onClick: () => void; testId: string; danger?: boolean }[] = [
    { label: "Profile Settings", onClick: () => go("/dashboard/profile"), testId: "menu-profile" },
    { label: "Report a Bug", onClick: () => go("/dashboard/report-bug"), testId: "menu-report-bug" },
    { label: "What's New", onClick: () => go("/dashboard/whats-new"), testId: "menu-whats-new" },
    { label: "Help & Shortcuts", onClick: () => go("/dashboard/help"), testId: "menu-help" },
    { label: "Sign out", onClick: () => { setOpen(false); logout(); }, testId: "menu-signout", danger: true },
  ];

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid="user-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label ?? "Account menu"}
        className="w-full text-left"
      >
        {children}
      </button>

      {open && (
        <div
          role="menu"
          data-testid="user-menu"
          className={`absolute z-[100] w-56 overflow-hidden rounded-sm border ${align === "up" ? "bottom-full mb-2" : "top-full mt-2"} right-0`}
          style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", boxShadow: "0 20px 50px rgba(34,32,27,0.25)" }}
        >
          {items.map((it) => (
            <button
              key={it.testId}
              role="menuitem"
              onClick={it.onClick}
              data-testid={it.testId}
              className="block w-full px-4 py-2.5 text-left font-sans text-[13px] transition-colors hover:bg-[var(--fg-surface)]"
              style={{ color: it.danger ? "var(--sev-flag)" : "var(--fg)" }}
            >
              {it.label}
            </button>
          ))}
          <div
            className="flex gap-3 border-t px-4 py-2.5 ansyra-label"
            style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)" }}
          >
            <button role="menuitem" onClick={() => go("/legal/terms")} data-testid="menu-terms" className="underline-offset-4 hover:underline">
              Terms
            </button>
            <button role="menuitem" onClick={() => go("/legal/privacy")} data-testid="menu-privacy" className="underline-offset-4 hover:underline">
              Privacy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
