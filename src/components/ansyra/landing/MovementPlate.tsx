import type { CategoryId } from "@/lib/landing-content";

// ─────────────────────────────────────────────────────────────────────────────
// A material plate per movement. The imagery for the platform section.
//
// SVG, NOT RASTER, and that is a better answer than the one originally planned.
// The plan called for generated .webp/.avif material renders. Three things
// argue against that here:
//
//   1. There is no webp or avif encoder on this machine (`sips` supports
//      neither), so raster would have shipped as PNG — larger than the SVG for
//      artwork made of gradients and arcs.
//   2. A generated abstract gradient is precisely the "AI default" DESIGN.md
//      names and refuses. Vector artwork built from the palette tokens cannot
//      drift into that, because it is made of the same values as the interface.
//   3. These follow the theme. A baked render would need two files and would
//      still be wrong at the moment the palette changes.
//
// EACH PLATE IS THE MOVEMENT'S OWN OPTICS, not decoration assigned at random:
//   origination — a wide scatter narrowing to a focus. Many deals, one desk.
//   diligence   — layers being read through, one at a time.
//   decision    — two states meeting at a hard edge: struck and inserted.
//   memory      — concentric returns, the same shape at different distances.
//
// `aria-hidden` throughout: this is evidence, never content (constitution §2).
// ─────────────────────────────────────────────────────────────────────────────

const BOX = { viewBox: "0 0 200 200", "aria-hidden": true, focusable: "false" as const };

// THE WASHES BEHIND THREE OF THESE PLATES WERE TURNED DOWN (2026-08-18).
// Origination carried a caustic radial at 0.5, Diligence a prism one at 0.42,
// Memory a settle one at 0.38 — which is the same three-coloured-glows pattern
// that was just deleted from the background, reappearing one section at a time.
// Beside a single light source they read as stray lamps rather than as lift.
//
// The DEVICES are untouched, because they are the part that means something:
// sixteen lines converging on one point, the rings, the dots. Those carry the
// idea; the wash was only ever making them glow. At 0.15-0.18 it is a faint
// halo that lifts the drawing off the ground without claiming to be a source.
function Origination() {
  return (
    <svg {...BOX} className="ansyra-plate">
      <defs>
        <radialGradient id="pl-o" cx="72%" cy="50%" r="62%">
          <stop offset="0%" stopColor="var(--caustic)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--caustic)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={144} cy={100} r={78} fill="url(#pl-o)" />
      {/* Many, converging on one. */}
      {Array.from({ length: 16 }).map((_, i) => {
        const t = i / 15;
        const y = 18 + t * 164;
        return (
          <path
            key={i}
            d={`M14 ${y} Q 96 ${y + (100 - y) * 0.45} 150 100`}
            stroke="var(--fg-2)"
            strokeWidth={0.7}
            fill="none"
            opacity={0.28}
          />
        );
      })}
      <circle cx={150} cy={100} r={4} fill="var(--caustic)" opacity={0.9} />
    </svg>
  );
}

function Diligence() {
  return (
    <svg {...BOX} className="ansyra-plate">
      <defs>
        <linearGradient id="pl-d" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--prism)" stopOpacity="0.16" />
          <stop offset="100%" stopColor="var(--prism)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Layers, read through. */}
      {Array.from({ length: 9 }).map((_, i) => (
        <rect
          key={i}
          x={26 + i * 2}
          y={22 + i * 17}
          width={148 - i * 4}
          height={10}
          rx={2}
          fill="var(--fg-2)"
          opacity={i === 3 || i === 6 ? 0.42 : 0.16}
        />
      ))}
      <rect x={20} y={20} width={160} height={80} fill="url(#pl-d)" />
      {/* The read head. */}
      <path d="M14 108 H186" stroke="var(--prism)" strokeWidth={1.5} opacity={0.85} />
    </svg>
  );
}

function Decision() {
  return (
    <svg {...BOX} className="ansyra-plate">
      {/* Two states meeting at a hard edge: what was struck, what replaced it. */}
      <g opacity={0.5}>
        {Array.from({ length: 7 }).map((_, i) => (
          <rect key={i} x={16} y={30 + i * 20} width={70} height={7} rx={3} fill="var(--sev-flag)" opacity={0.5} />
        ))}
      </g>
      <g>
        {Array.from({ length: 7 }).map((_, i) => (
          <rect key={i} x={114} y={30 + i * 20} width={70} height={7} rx={3} fill="var(--sev-grounded)" opacity={0.7} />
        ))}
      </g>
      <path d="M100 12 V188" stroke="var(--fg-2)" strokeWidth={1} opacity={0.5} />
      <path d="M16 33 H86" stroke="var(--sev-flag)" strokeWidth={1.2} opacity={0.95} />
    </svg>
  );
}

function Memory() {
  return (
    <svg {...BOX} className="ansyra-plate">
      <defs>
        <radialGradient id="pl-m" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="var(--settle)" stopOpacity="0.15" />
          <stop offset="100%" stopColor="var(--settle)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={100} cy={100} r={92} fill="url(#pl-m)" />
      {/* The same shape returning at different distances. */}
      {[26, 44, 62, 80].map((r, i) => (
        <circle
          key={r}
          cx={100}
          cy={100}
          r={r}
          fill="none"
          stroke="var(--fg-2)"
          strokeWidth={0.9}
          opacity={0.5 - i * 0.09}
          strokeDasharray={i === 0 ? undefined : `${2 + i} ${4 + i * 2}`}
        />
      ))}
      <circle cx={100} cy={100} r={5} fill="var(--settle)" opacity={0.9} />
    </svg>
  );
}

const PLATES: Record<CategoryId, () => React.ReactElement> = {
  origination: Origination,
  diligence: Diligence,
  decision: Decision,
  memory: Memory,
};

export function MovementPlate({ id }: { id: CategoryId }) {
  const P = PLATES[id];
  return P ? <P /> : null;
}
