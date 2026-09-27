/** Procedural bond-paper grain.
 *
 *  Generated with SVG feTurbulence rather than shipped as an image: it costs
 *  no request, scales to any viewport, and can be tuned by editing numbers.
 *  Fixed and pointer-events:none, so it is composited once and never repaints
 *  with scrolling content. */
export function Grain() {
  return (
    <svg className="ansyra-grain-layer" aria-hidden focusable="false">
      <filter id="ansyra-bond-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" />
        <feColorMatrix
          type="matrix"
          values="0 0 0 0 0.16
                  0 0 0 0 0.17
                  0 0 0 0 0.14
                  0 0 0 0.42 0"
        />
      </filter>
      <rect width="100%" height="100%" filter="url(#ansyra-bond-grain)" />
    </svg>
  );
}
