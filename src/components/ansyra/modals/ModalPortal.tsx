import type { ReactNode } from "react";
import { createPortal } from "react-dom";

// Landing modals render inside an act, and the act stage creates a stacking
// context (z-10) BELOW the fixed site nav (z-40) — so a modal's z-[100] can
// never escape it and the nav paints over the modal, swallowing clicks on ✕
// (the original 12.1 bug). Portaling to <body> lifts the overlay into the
// root stacking context. Radix-based modals (Contact, TargetScreen) already
// portal on their own.
export function ModalPortal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}
