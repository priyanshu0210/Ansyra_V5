// ─────────────────────────────────────────────────────────────────────────────
// What each pipeline stage actually DOES, drawn.
//
// The stage cards already show the OUTPUT of each step — a mandate, a citation,
// a score, a blocked sign-off. What they never showed is the mechanism, which
// is the thing a dealmaker evaluating an AI feature actually wants: not "it
// produced a number" but "here is what it ran against, and what stopped it
// making one up".
//
// EVERY DIAGRAM DESCRIBES REAL MACHINERY IN THIS CODEBASE:
//   Scope   — `scopeFilter` / `assertDealAccess`: rows narrow to the ones this
//             user may see, before a model is involved at all.
//   Ground  — Deal Genome retrieval: the question fans out across the firm's
//             own history and comes back with citations attached.
//   Analyze — `callAI` under a strict JSON contract, validated on return, with
//             one retry when validation fails.
//   Verdict — `decisions.record`: the verdict is written to the deal, and the
//             stage gate refuses to advance without it (`DECISION_REQUIRED`).
//
// A diagram that flatters the system would be worse than none, so these are
// drawn from mechanics that are structural rather than incidental — the tier
// least likely to move underneath them.
//
// TRANSITIONS, NOT KEYFRAMES. Every element declares its lit state and eases
// into it, so "plays when the stage lights" and "holds the finished state at
// rest" are the same rule rather than two. Reduced motion drops the duration
// and the diagram is simply already finished.
// ─────────────────────────────────────────────────────────────────────────────

type Props = { lit: boolean };

// Sizing lives in CSS (`.ansyra-dia`), not on the element: `height="auto"` is
// not a valid SVG length and the browser rejects it once per diagram.
const SVG = {
  viewBox: "0 0 132 64",
  preserveAspectRatio: "xMidYMid meet",
  fill: "none" as const,
  "aria-hidden": true,
  focusable: "false" as const,
};

/** Rows narrowing to the ones in scope. */
function Scope({ lit }: Props) {
  // Three survive the filter, three are out of scope.
  const rows = [0, 1, 2, 3, 4, 5];
  const kept = new Set([1, 2, 4]);
  return (
    <svg {...SVG} className="ansyra-dia" data-lit={lit ? "1" : "0"}>
      {rows.map((r) => {
        const y = 8 + r * 8.5;
        const inScope = kept.has(r);
        return (
          <rect
            key={r}
            x={6}
            y={y}
            width={inScope ? 52 : 44}
            height={4}
            rx={2}
            className={inScope ? "dia-row dia-row--in" : "dia-row dia-row--out"}
            style={{ transitionDelay: `${r * 55}ms` }}
          />
        );
      })}
      {/* The boundary. It draws AFTER the rows settle: the filter is a
          consequence of who you are, not a shape the rows fall into. */}
      <path d="M74 6 H126 V58 H74" className="dia-bracket" />
      {[...kept].map((r, i) => (
        <rect
          key={r}
          x={80}
          y={14 + i * 12}
          width={40}
          height={4}
          rx={2}
          className="dia-row dia-row--landed"
          style={{ transitionDelay: `${340 + i * 70}ms` }}
        />
      ))}
    </svg>
  );
}

/** The question fanning across the firm's own history, citations returning. */
function Ground({ lit }: Props) {
  const sats = [
    { x: 108, y: 10 },
    { x: 120, y: 30 },
    { x: 106, y: 52 },
    { x: 90, y: 20 },
  ];
  return (
    <svg {...SVG} className="ansyra-dia" data-lit={lit ? "1" : "0"}>
      <circle cx={20} cy={32} r={7} className="dia-node dia-node--source" />
      {sats.map((s, i) => (
        <g key={i}>
          <path
            d={`M27 32 Q ${(27 + s.x) / 2} ${32 + (i % 2 ? -16 : 16)} ${s.x - 5} ${s.y}`}
            className="dia-link"
            style={{ transitionDelay: `${i * 90}ms` }}
          />
          <circle
            cx={s.x}
            cy={s.y}
            r={4}
            className="dia-node dia-node--sat"
            style={{ transitionDelay: `${140 + i * 90}ms` }}
          />
        </g>
      ))}
      {/* Citations coming back and attaching to the question. */}
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={32}
          y={44 + i * 6}
          width={26}
          height={3}
          rx={1.5}
          className="dia-cite"
          style={{ transitionDelay: `${420 + i * 80}ms` }}
        />
      ))}
    </svg>
  );
}

/** A strict contract: in, validated, out — with one retry when it fails. */
function Analyze({ lit }: Props) {
  return (
    <svg {...SVG} className="ansyra-dia" data-lit={lit ? "1" : "0"}>
      <rect x={38} y={14} width={56} height={36} rx={4} className="dia-frame" />
      {/* The contract's shape, sketched inside the frame. */}
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={46}
          y={22 + i * 8}
          width={i === 1 ? 28 : 40}
          height={3}
          rx={1.5}
          className="dia-slot"
          style={{ transitionDelay: `${180 + i * 70}ms` }}
        />
      ))}
      <path d="M6 32 H34" className="dia-link dia-link--in" />
      <path d="M98 32 H126" className="dia-link" style={{ transitionDelay: "460ms" }} />
      {/* The retry. A failed validation goes round once rather than through. */}
      <path d="M92 50 Q 66 62 40 50" className="dia-retry" style={{ transitionDelay: "560ms" }} />
      <circle cx={126} cy={32} r={4} className="dia-node dia-node--out" style={{ transitionDelay: "620ms" }} />
    </svg>
  );
}

/** The verdict written to the record, and the gate that holds the deal. */
function Verdict({ lit }: Props) {
  return (
    <svg {...SVG} className="ansyra-dia" data-lit={lit ? "1" : "0"}>
      {/* The record. */}
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={6}
          y={12 + i * 10}
          width={i === 1 ? 62 : 48}
          height={4}
          rx={2}
          className="dia-row dia-row--in"
          style={{ transitionDelay: `${i * 60}ms` }}
        />
      ))}
      {/* The score landing on it. */}
      <rect x={6} y={44} width={22} height={12} rx={3} className="dia-score" style={{ transitionDelay: "260ms" }} />
      {/* The gate. Drops across the path and stops the advance. */}
      <path d="M78 32 H120" className="dia-link" style={{ transitionDelay: "360ms" }} />
      <path d="M96 8 V56" className="dia-gate" style={{ transitionDelay: "520ms" }} />
      <path d="M104 26 L112 32 L104 38" className="dia-blocked" style={{ transitionDelay: "620ms" }} />
    </svg>
  );
}

const BY_ID: Record<string, (p: Props) => React.ReactElement> = {
  scope: Scope,
  ground: Ground,
  analyze: Analyze,
  verdict: Verdict,
};

export function StageDiagram({ id, lit }: { id: string; lit: boolean }) {
  const D = BY_ID[id];
  return D ? <D lit={lit} /> : null;
}
