// Split out of Reveal.tsx so that file exports components only
// (react-refresh/only-export-components). Callers that only want the delay
// arithmetic — EvidenceLens, sections — no longer pull the component module.

/** Cap so a long list never trails: 5 items x 60ms = 300ms and then flat. */
export function stagger(index: number, step = 0.06, cap = 5) {
  return Math.min(index, cap) * step;
}
