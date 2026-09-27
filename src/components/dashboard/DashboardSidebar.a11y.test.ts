import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Static a11y guard for the dashboard sidebar.
//
// These are source assertions rather than rendered-DOM assertions because the
// project's vitest environment is "node" with no jsdom/testing-library. Adding
// that stack just for this would be a bigger change than the fix. The checks
// below still catch the exact regressions that were found by auditing the live
// accessibility tree:
//
//   • two icon-only buttons (collapse, mobile close) had NO accessible name at
//     all — the mobile one is the only way out of the drawer;
//   • the active section carried no aria-current, so the current location was
//     conveyed by colour alone;
//   • when collapsed, the item label was removed from the DOM entirely and the
//     name fell back to `title`, a weak last-resort source.

const read = (f: string) => readFileSync(join(__dirname, f), "utf8");
const sidebar = read("DashboardSidebar.tsx");
const avatar = read("Avatar.tsx");
const userMenu = read("UserMenu.tsx");

describe("DashboardSidebar accessibility", () => {
  it("gives the collapse toggle a name and an expanded state", () => {
    const block = sidebar.slice(sidebar.indexOf('data-testid="sidebar-collapse"') - 400);
    expect(block).toMatch(/aria-label=\{collapsed \? "Expand sidebar" : "Collapse sidebar"\}/);
    expect(block).toMatch(/aria-expanded=\{!collapsed\}/);
  });

  it("gives the mobile close button a name", () => {
    const i = sidebar.indexOf('data-testid="sidebar-mobile-close"');
    expect(i).toBeGreaterThan(-1);
    expect(sidebar.slice(i, i + 200)).toMatch(/aria-label="Close navigation"/);
  });

  it("marks the active section with aria-current", () => {
    expect(sidebar).toMatch(/aria-current=\{active \? "page" : undefined\}/);
  });

  it("keeps the item label in the DOM when collapsed instead of relying on title", () => {
    // The label span must always render; only its visibility changes.
    expect(sidebar).toMatch(/className=\{collapsed \? "sr-only" : undefined\}>\{item\.label\}/);
    // Guard the old shape, which dropped the label entirely when collapsed.
    expect(sidebar).not.toMatch(/\{!collapsed && <span>\{item\.label\}<\/span>\}/);
  });

  it("hides decorative nav icons from assistive tech", () => {
    expect(sidebar).toMatch(/<span aria-hidden="true" style=\{\{ color: active/);
  });

  it("names the nav landmark and each group", () => {
    expect(sidebar).toMatch(/<nav[^>]*aria-label="Dashboard sections"/);
    expect(sidebar).toMatch(/role="group" aria-label=\{g\.label\}/);
  });
});

describe("Avatar / UserMenu accessible naming", () => {
  it("hides the avatar initial so it does not prefix ancestor names", () => {
    // Was announced as "SSarah Klein…" because the raw letter concatenated into
    // the enclosing button's name.
    const i = avatar.indexOf('data-testid="avatar-initial"');
    expect(i).toBeGreaterThan(-1);
    expect(avatar.slice(Math.max(0, i - 200), i)).toMatch(/aria-hidden="true"/);
  });

  it("lets the account menu trigger take an explicit label", () => {
    expect(userMenu).toMatch(/aria-label=\{label \?\? "Account menu"\}/);
  });

  it("passes a real label from both call sites", () => {
    for (const f of ["DashboardSidebar.tsx", "DashboardHeader.tsx"]) {
      expect(read(f)).toMatch(/<UserMenu[^>]*label=\{`Account menu for \$\{user\?\.name \?\? "your account"\}`\}/);
    }
  });
});
