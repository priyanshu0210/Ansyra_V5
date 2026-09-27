import { useMotionPref } from "@/hooks/useMotionPref";

// ─────────────────────────────────────────────────────────────────────────────
// The city. Small buildings scattered across the field, with links between them.
//
// It is not decoration looking for a reason: this product is about deals
// BETWEEN companies, so the ambient layer is companies and the lines joining
// them. Nodes breathe in and out on long, unequal cycles and the links between
// them come and go, which is also what a pipeline does.
//
// EVIDENCE, NOT CONTENT (constitution §2): this layer is never readable and
// never carries meaning that is not repeated on a real surface. It is
// `aria-hidden`, it sits behind everything, and its opacity ceiling is low
// enough that no building is ever a thing you could count.
//
// Drawn as ONE inline SVG rather than positioned divs: 11 buildings and 9 links
// is 20 elements, and as divs each would need its own gradient and box-shadow.
// As SVG it is one paint, it scales with the viewport for free, and the links
// can be real curves instead of rotated rectangles.
// ─────────────────────────────────────────────────────────────────────────────

/** x, y, width, height, floors. Hand-placed to avoid the centre text column.
 *
 *  THE RIGHT-HAND CLUSTER SITS LOWER AND FURTHER OUT than it used to (was
 *  y 452-506 at x 1178-1404). The Möbius strip is parked off-axis to the right
 *  at world x 3.2, which put it directly on top of these four towers — two
 *  unrelated systems crossing at full strength, which is the "hodge podge"
 *  reading. Dropping them ~46 units and pushing them ~34 out puts the strip
 *  ABOVE and BEHIND the skyline instead of through it, which is the one
 *  relationship that makes both legible: a thing in the sky, over a city. */
const BUILDINGS = [
  { x: 90, y: 470, w: 46, h: 118, f: 4 },
  { x: 152, y: 512, w: 34, h: 76, f: 3 },
  { x: 236, y: 430, w: 40, h: 158, f: 5 },
  { x: 318, y: 498, w: 30, h: 90, f: 3 },
  { x: 1302, y: 498, w: 44, h: 136, f: 5 },
  { x: 1364, y: 546, w: 32, h: 88, f: 3 },
  { x: 1212, y: 552, w: 36, h: 82, f: 3 },
  { x: 1438, y: 516, w: 40, h: 118, f: 4 },
  { x: 640, y: 168, w: 34, h: 86, f: 3 },
  { x: 706, y: 140, w: 28, h: 114, f: 4 },
  { x: 880, y: 176, w: 38, h: 78, f: 3 },
] as const;

/** [fromIndex, toIndex, curve] — curve lifts the control point off the chord. */
const LINKS = [
  [0, 1, -26],
  [1, 2, 34],
  [2, 3, -22],
  [4, 5, 24],
  [6, 4, -30],
  [4, 7, 20],
  [8, 9, -18],
  [9, 10, 26],
  [3, 8, -120],
  [10, 6, 96],
] as const;

const centreOf = (b: (typeof BUILDINGS)[number]) => ({ x: b.x + b.w / 2, y: b.y });

/** A quadratic curve between two roof centres, bowed by `lift`. */
function linkPath(a: number, b: number, lift: number) {
  const p = centreOf(BUILDINGS[a]);
  const q = centreOf(BUILDINGS[b]);
  const mx = (p.x + q.x) / 2;
  const my = (p.y + q.y) / 2 + lift;
  return `M ${p.x} ${p.y} Q ${mx} ${my} ${q.x} ${q.y}`;
}

export function CityField() {
  const reduced = useMotionPref();

  return (
    <svg
      aria-hidden
      focusable="false"
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 1512 760"
      // `slice` keeps the buildings anchored to the edges at any aspect ratio
      // rather than letterboxing them into the middle of the text column.
      preserveAspectRatio="xMidYMid slice"
      /* 0.5 -> 0.34. Two ambient systems at half strength each do not read as
         one atmosphere, they read as two things at half strength. The city
         gives way; the strip is the figure. */
      style={{ opacity: 0.34 }}
    >
      <defs>
        {/* THE HANDOFF. The strip is parked off-axis right and vertically
            centred, so the city dissolves as it approaches that region rather
            than running underneath it. A mask, not an opacity on a group: the
            falloff has to be gradual across the towers, and a group opacity is
            one flat value for all of them. */}
        <radialGradient id="city-handoff" cx="79%" cy="46%" r="34%">
          <stop offset="0%" stopColor="#000" />
          <stop offset="62%" stopColor="#555" />
          <stop offset="100%" stopColor="#fff" />
        </radialGradient>
        <mask id="city-mask">
          <rect x="0" y="0" width="1512" height="760" fill="url(#city-handoff)" />
        </mask>
      </defs>

      <g mask="url(#city-mask)">
      {/* Links first, so a line never crosses over the front of a building. */}
      <g
        fill="none"
        /* Warmed toward the cool accent so the city and the strip share a hue
           family. A flat --fg-2 skyline under a --prism dot field is two
           palettes in one layer. */
        stroke="color-mix(in srgb, var(--fg-2) 68%, var(--prism))"
        strokeWidth={1}
        strokeLinecap="round"
      >
        {LINKS.map(([a, b, lift], i) => (
          <path
            key={`l${i}`}
            d={linkPath(a, b, lift)}
            className={reduced ? undefined : "ansyra-link"}
            style={{
              // Long and uneven. A negative delay starts each one already part
              // way through, so nothing pops in together on load.
              animationDuration: `${26 + i * 3.5}s`,
              animationDelay: `${-i * 4.5}s`,
              opacity: reduced ? 0.7 : undefined,
            }}
            strokeDasharray="2 6"
          />
        ))}
      </g>

      <g fill="color-mix(in srgb, var(--fg-2) 78%, var(--prism))">
        {BUILDINGS.map((b, i) => (
          <g
            key={`b${i}`}
            className={reduced ? undefined : "ansyra-node"}
            style={{
              animationDuration: `${31 + i * 2.7}s`,
              animationDelay: `${-i * 3.1}s`,
              opacity: reduced ? 0.7 : undefined,
            }}
          >
            {/* The tower. A 2px round top keeps it friendly rather than
                corporate, which is the whole difference between this reading as
                a skyline and reading as a stock "enterprise" graphic. */}
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={3} opacity={0.22} />
            {/* Windows. Two columns, `f` floors, inset from the edges. */}
            {Array.from({ length: b.f }).map((_, r) =>
              [0, 1].map((c) => (
                <rect
                  key={`${r}-${c}`}
                  x={b.x + 8 + c * (b.w - 16 - 5)}
                  y={b.y + 12 + r * ((b.h - 20) / b.f)}
                  width={5}
                  height={5}
                  rx={1}
                  opacity={0.5}
                />
              )),
            )}
            {/* The roof mark: where a link attaches. */}
            <circle cx={b.x + b.w / 2} cy={b.y} r={2} opacity={0.75} />
          </g>
        ))}
      </g>
      </g>

      {/* THE HORIZON. One very low-alpha band across the bottom that both the
          towers and the lower arc of the strip sit into. It is the cheapest
          thing that makes two separately-authored layers read as one place:
          they now share an atmosphere rather than merely sharing a rectangle.
          Outside the mask, because the haze is what the mask hands off TO. */}
      <rect
        x="0"
        y="430"
        width="1512"
        height="330"
        fill="url(#city-horizon)"
        opacity={0.9}
      />
      <defs>
        <linearGradient id="city-horizon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--medium-deep)" stopOpacity="0" />
          <stop offset="100%" stopColor="var(--medium-deep)" stopOpacity="0.55" />
        </linearGradient>
      </defs>
    </svg>
  );
}
