// ─────────────────────────────────────────────────────────────────────────────
// Landing chart set — hand-drawn-feeling, CSS-animated SVG data visuals
// (2026-07 revamp). Draw-on animations use stroke-dash / scaleY keyframes
// defined in index.css (`ansyra-chart-*`); prefers-reduced-motion collapses
// them to a static render there. Colors come from the design tokens only.
// These are the landing's own visuals — no Framer Motion here by contract.
// ─────────────────────────────────────────────────────────────────────────────

export interface BarDatum {
  label: string;
  value: number; // 0..max
  accent?: boolean;
}

/** Vertical bars that rise from the baseline, mono value labels on top. */
export function BarsChart({
  data,
  max,
  unit = "",
  height = 190,
}: {
  data: BarDatum[];
  max?: number;
  unit?: string;
  height?: number;
}) {
  const m = max ?? Math.max(...data.map((d) => d.value)) * 1.15;
  const W = 400;
  const H = height;
  const pad = 24;
  const bw = (W - pad * 2) / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Bar chart">
      <line x1={pad} y1={H - 28} x2={W - pad} y2={H - 28} stroke="var(--fg-rule)" strokeWidth="1" />
      {data.map((d, i) => {
        const bh = Math.max(3, ((H - 60) * d.value) / m);
        const x = pad + i * bw + bw * 0.18;
        return (
          <g key={d.label}>
            <rect
              className="ansyra-chart-rise"
              style={{ animationDelay: `${i * 90}ms`, transformOrigin: `${x + bw * 0.32}px ${H - 28}px` }}
              x={x}
              y={H - 28 - bh}
              width={bw * 0.64}
              height={bh}
              fill={d.accent ? "var(--fg)" : "var(--fg-surface)"}
              stroke={d.accent ? "var(--fg)" : "var(--fg-2)"}
              strokeWidth="1"
            />
            <text
              x={x + bw * 0.32}
              y={H - 34 - bh}
              textAnchor="middle"
              fontFamily="var(--font-sans)"
              fontSize="12"
              fill={d.accent ? "var(--fg)" : "var(--fg-2)"}
              className="ansyra-chart-fade"
              style={{ animationDelay: `${i * 90 + 260}ms` }}
            >
              {d.value}
              {unit}
            </text>
            <text
              x={x + bw * 0.32}
              y={H - 12}
              textAnchor="middle"
              fontFamily="var(--font-sans)"
              fontSize="12"
              letterSpacing="0.08em"
              fill="var(--fg-2)"
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Donut gauge — persimmon sweep over a rule track, Fraunces number center. */
export function DonutChart({
  value,
  caption,
  size = 190,
}: {
  value: number; // percentage 0..100
  caption: string;
  size?: number;
}) {
  const r = 64;
  const C = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 190 190" style={{ width: size }} className="mx-auto block" role="img" aria-label={`${value}% — ${caption}`}>
      <circle cx="95" cy="95" r={r} fill="none" stroke="var(--fg-rule)" strokeWidth="10" />
      <circle
        className="ansyra-chart-sweep"
        cx="95"
        cy="95"
        r={r}
        fill="none"
        stroke="var(--fg)"
        strokeWidth="10"
        strokeLinecap="butt"
        strokeDasharray={`${(C * value) / 100} ${C}`}
        strokeDashoffset={C}
        style={{ ["--sweep-to" as string]: 0, transform: "rotate(-90deg)", transformOrigin: "95px 95px" }}
      />
      <text x="95" y="108" textAnchor="middle" fontFamily="var(--font-serif)" fontSize="40" fill="var(--fg)">
        {value}%
      </text>
      <text x="95" y="182" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="12" letterSpacing="0.18em" fill="var(--fg-2)">
        {caption.toUpperCase()}
      </text>
    </svg>
  );
}

/**
 * Slope chart — "promised vs delivered" pairs, lines draw left→right.
 *
 * THE SERIES NAME BELONGS ON THE RIGHT, WHERE THE LINES HAVE SEPARATED.
 *
 * It used to sit on the left, as "{from}% {label}" against the start node. Both
 * shipped datasets index to 100, so both series started at the same value, and
 * two labels were drawn on the same baseline at the same x — "100% revenue
 * synergies" and "100% cost synergies" rendered directly on top of each other
 * and neither was readable. It was structural, not a font accident: any two
 * series sharing a `from` collided, and every slope chart on the site does.
 *
 * Moving the name to the terminus fixes a second problem at the same time. The
 * right-hand labels were bare numbers ("82%", "65%") with no way to tell which
 * line was which, so the reader had to trace a slope back across the chart to
 * identify it. Now the label sits where the answer is.
 *
 * The left keeps ONE value per distinct start, deduplicated — two series from
 * the same place share one "100%".
 */
export function SlopeChart({
  pairs,
  leftLabel,
  rightLabel,
}: {
  pairs: { label: string; from: number; to: number }[];
  leftLabel: string;
  rightLabel: string;
}) {
  // Widened from 400 so the right-hand labels have somewhere to live: the name
  // now sits outside x1 and needs real width. The svg is `w-full`, so this is a
  // change of internal proportion, not of rendered size.
  const W = 520;
  const H = 210;
  const x0 = 118;
  const x1 = 300;
  const yFor = (v: number) => 32 + (1 - v / 100) * (H - 80);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Slope chart">
      {[x0, x1].map((x) => (
        <line key={x} x1={x} y1={24} x2={x} y2={H - 40} stroke="var(--fg-rule)" strokeWidth="1" />
      ))}
      <text x={x0} y={H - 22} textAnchor="middle" fontFamily="var(--font-sans)" fontSize="12" letterSpacing="0.14em" fill="var(--fg-2)">
        {leftLabel.toUpperCase()}
      </text>
      <text x={x1} y={H - 22} textAnchor="middle" fontFamily="var(--font-sans)" fontSize="12" letterSpacing="0.14em" fill="var(--fg-2)">
        {rightLabel.toUpperCase()}
      </text>
      {/* One value per distinct start. Deduplicated by `from`, so two series
          that both index to 100 share a single left-hand label instead of
          printing two on the same baseline. */}
      {[...new Map(pairs.map((p) => [p.from, p])).values()].map((p) => (
        <text
          key={`from-${p.from}`}
          x={x0 - 10}
          y={yFor(p.from) + 3}
          textAnchor="end"
          fontFamily="var(--font-sans)"
          fontSize="12"
          fill="var(--fg-2)"
        >
          {p.from}%
        </text>
      ))}
      {pairs.map((p, i) => (
        <g key={p.label}>
          <line
            className="ansyra-chart-draw"
            style={{ animationDelay: `${i * 140}ms` }}
            pathLength={1}
            x1={x0}
            y1={yFor(p.from)}
            x2={x1}
            y2={yFor(p.to)}
            stroke={i === 0 ? "var(--fg)" : "var(--fg-2)"}
            strokeWidth={i === 0 ? 2.4 : 1.6}
          />
          <circle cx={x0} cy={yFor(p.from)} r="3" fill={i === 0 ? "var(--fg)" : "var(--fg-2)"} />
          <circle cx={x1} cy={yFor(p.to)} r="3" fill={i === 0 ? "var(--fg)" : "var(--fg-2)"} />
          <text x={x1 + 10} y={yFor(p.to) + 3} fontFamily="var(--font-sans)" fontSize="12" fill={i === 0 ? "var(--fg)" : "var(--fg-2)"}>
            {p.to}% {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Line chart with a soft area fill — the ink line draws itself in. */
export function LineChart({
  points,
  labels,
  unit = "",
  height = 200,
}: {
  points: number[];
  labels: string[];
  unit?: string;
  height?: number;
}) {
  const W = 400;
  const H = height;
  const pad = 34;
  const m = Math.max(...points) * 1.15;
  const px = (i: number) => pad + (i * (W - pad * 2)) / (points.length - 1);
  const py = (v: number) => H - 34 - ((H - 70) * v) / m;
  const path = points.map((v, i) => `${i === 0 ? "M" : "L"}${px(i)},${py(v)}`).join(" ");
  const area = `${path} L${px(points.length - 1)},${H - 34} L${px(0)},${H - 34} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Line chart">
      {[0.33, 0.66, 1].map((f) => (
        <line key={f} x1={pad} y1={py(m * f * 0.87)} x2={W - pad} y2={py(m * f * 0.87)} stroke="var(--fg-rule)" strokeWidth="0.6" />
      ))}
      <path d={area} fill="var(--fg)" opacity="0.09" className="ansyra-chart-fade" style={{ animationDelay: "500ms" }} />
      <path className="ansyra-chart-draw" pathLength={1} d={path} fill="none" stroke="var(--fg)" strokeWidth="2.2" />
      {points.map((v, i) => (
        <g key={labels[i]}>
          <circle cx={px(i)} cy={py(v)} r="3" fill="var(--fg-surface)" stroke="var(--fg)" strokeWidth="1.6" />
          <text x={px(i)} y={py(v) - 10} textAnchor="middle" fontFamily="var(--font-sans)" fontSize="12" fill="var(--fg-2)" className="ansyra-chart-fade" style={{ animationDelay: `${300 + i * 90}ms` }}>
            {v}
            {unit}
          </text>
          <text x={px(i)} y={H - 14} textAnchor="middle" fontFamily="var(--font-sans)" fontSize="12" fill="var(--fg-2)">
            {labels[i]}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Horizontal cause bars — "where the value leaks", persimmon-first. */
export function CauseBars({ data }: { data: BarDatum[] }) {
  const W = 400;
  const rowH = 42;
  const H = data.length * rowH + 8;
  const m = Math.max(...data.map((d) => d.value)) * 1.1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Cause breakdown">
      {data.map((d, i) => {
        const w = ((W - 130) * d.value) / m;
        const y = i * rowH + 10;
        return (
          <g key={d.label}>
            <text x="0" y={y + 13} fontFamily="var(--font-sans)" fontSize="12" letterSpacing="0.06em" fill="var(--fg-2)">
              {d.label}
            </text>
            <rect
              className="ansyra-chart-grow"
              style={{ animationDelay: `${i * 110}ms`, transformOrigin: `0px 0px` }}
              x="0"
              y={y + 18}
              width={w}
              height="9"
              fill={d.accent ? "var(--fg)" : "var(--fg-surface)"}
              stroke={d.accent ? "var(--fg)" : "var(--fg-2)"}
              strokeWidth="0.8"
            />
            <text x={w + 8} y={y + 26} fontFamily="var(--font-sans)" fontSize="12" fill={d.accent ? "var(--fg)" : "var(--fg-2)"} className="ansyra-chart-fade" style={{ animationDelay: `${i * 110 + 240}ms` }}>
              {d.value}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}
