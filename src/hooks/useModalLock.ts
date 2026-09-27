import { useEffect, useRef, type RefObject } from "react";

// Global modal lock (Phase 12.1): while ANY modal is open, `document.body`
// carries `data-modal-open`, and the landing's scroll/keyboard advance handler
// plus nav ignore input. Also wires ESC-to-close and locks body scroll.
// Every modal on the landing (and any future one) should call this.
export function useModalLock(
  open: boolean,
  onClose: () => void,
  containerRef?: RefObject<HTMLElement | null>,
) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    document.body.dataset.modalOpen = "true";
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !containerRef?.current) return;

      const focusable = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) {
        e.preventDefault();
        containerRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    const focusFrame = window.requestAnimationFrame(() => {
      const target = containerRef?.current?.querySelector<HTMLElement>(
        '[autofocus], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href]',
      );
      (target ?? containerRef?.current)?.focus();
    });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      delete document.body.dataset.modalOpen;
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      previouslyFocused?.focus();
    };
  }, [open, containerRef]);
}

export function isModalOpen(): boolean {
  return document.body.dataset.modalOpen === "true";
}
