// ─────────────────────────────────────────────────────────────────────────────
// Ansyra logo (2026-07 cinematic redesign) — the brand mark traced to inline
// SVG from public/logo.png: a peak ("A" apex) resting on an arched plinth with
// flared feet. Vector so it stays crisp at every size, inherits ink color via
// `currentColor` (works on porcelain AND on dark CTAs / the glowing cube face),
// and costs no network request. public/logo.png remains the raster reference.
//
// `Logo`       — the mark alone. Call sites pair it with the "Ansyra" wordmark,
//                which now sets in Fraunces (the display face) — that pairing IS
//                the lockup. The glyph never replaces the name in nav/footer.
// `LogoLockup` — mark + wordmark together, for surfaces with no adjacent text.
// ─────────────────────────────────────────────────────────────────────────────

export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden
      className={className}
      style={{ flexShrink: 0, display: "block" }}
    >
      {/* Apex — the peak, with its triangular counter */}
      <path d="M50 11 L71 52 H61.2 L50 29.5 L38.8 52 H29 Z" fill="currentColor" />
      {/* Arched plinth — bar, arch opening, flared serif feet */}
      <path
        d="M8 58 H92 V70 H79 V80 Q79 88 87 92 V95 H61 V92 Q69 88 69 80 V79
           Q69 74 50 74 Q31 74 31 79 V80 Q31 88 39 92 V95 H13 V92 Q21 88 21 80 V70 H8 Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function LogoLockup({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <Logo size={size} />
      <span
        className="font-display leading-none"
        style={{ fontSize: size * 0.95, fontWeight: 500, letterSpacing: "-0.01em" }}
      >
        Ansyra
      </span>
    </span>
  );
}
