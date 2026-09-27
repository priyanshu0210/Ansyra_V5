import { useTheme } from "@/hooks/useTheme";
import { setMotionOverride, useMotionPref } from "@/hooks/useMotionPref";

// ─────────────────────────────────────────────────────────────────────────────
// Two controls in the nav: theme, and motion.
//
// THEY ARE GLYPHS, NOT PILLS. These were four labelled segments inside two
// bordered groups, which put eight visible edges and four words of chrome in
// the first viewport of a page whose whole argument is the first viewport. A
// preference control is not the thing anyone came for; it should be findable
// and otherwise silent.
//
// Each is a SINGLE button that reports the current state and toggles it, not a
// pair of mutually exclusive segments. Two segments to express one boolean was
// always double the chrome for the same information.
//
// THE HIT AREA IS 44px, THE GLYPH IS 18px. The old control was 28px tall,
// which is under the touch floor everything else in this nav respects. Padding
// carries the difference so the target is reachable without the mark growing.
//
// The "Auto" segment is gone. Motion no longer follows the OS preference
// (see useMotionPref.ts for why, and for the tradeoff that was accepted), so
// there is no system state to hand control back to.
// ─────────────────────────────────────────────────────────────────────────────

function Glyph({
  onClick,
  title,
  label,
  pressed,
  children,
}: {
  onClick: () => void;
  title: string;
  label: string;
  pressed: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={label}
      aria-pressed={pressed}
      className="ansyra-viewglyph"
    >
      <svg
        width={18}
        height={18}
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        focusable="false"
      >
        {children}
      </svg>
    </button>
  );
}

export function ViewControls() {
  const { theme, setTheme } = useTheme();
  const still = useMotionPref();

  return (
    <div className="flex items-center gap-1">
      {/* A circle half-filled. The filled half swaps side with the theme, so
          the mark reports the state rather than naming the destination. */}
      <Glyph
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        title={theme === "dark" ? "Dark theme. Switch to light." : "Light theme. Switch to dark."}
        label={theme === "dark" ? "Theme: dark. Switch to light." : "Theme: light. Switch to dark."}
        pressed={theme === "dark"}
      >
        <circle cx={9} cy={9} r={6.25} />
        <path
          d={theme === "dark" ? "M9 2.75a6.25 6.25 0 0 0 0 12.5z" : "M9 2.75a6.25 6.25 0 0 1 0 12.5z"}
          fill="currentColor"
          stroke="none"
        />
      </Glyph>

      {/* A wave, flat when still. Same stroke, same length, one property of
          difference: whether it has amplitude. */}
      <Glyph
        onClick={() => setMotionOverride(still ? "on" : "off")}
        title={
          still
            ? "Still. The same composition, at rest. Switch motion on."
            : "Motion on. Switch to still."
        }
        label={still ? "Motion: off. Turn motion on." : "Motion: on. Turn motion off."}
        pressed={!still}
      >
        {still ? (
          <path d="M2.5 9h13" />
        ) : (
          <path d="M2.5 9c1.6-4.2 3.2-4.2 4.8 0s3.2 4.2 4.8 0M14.5 9h1" />
        )}
      </Glyph>
    </div>
  );
}
