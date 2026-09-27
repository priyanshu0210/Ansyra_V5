import { useId, useRef } from "react";
import { useModalLock } from "@/hooks/useModalLock";
import { ModalPortal } from "./ModalPortal";

export function DialogShell({
  title,
  onClose,
  children,
  maxWidth = "max-w-md",
  testId,
  labelledBy,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
  testId?: string;
  labelledBy?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const generatedTitleId = useId();
  const titleId = labelledBy ?? `dialog-title-${generatedTitleId.replace(/:/g, "")}`;
  useModalLock(true, onClose, dialogRef);

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6"
        style={{ background: "rgba(34,32,27,0.55)", backdropFilter: "blur(4px)" }}
        onMouseDown={(event) => {
          if (event.currentTarget === event.target) onClose();
        }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-testid={testId}
          className={`relative max-h-[90dvh] w-full ${maxWidth} overflow-y-auto rounded-sm border p-6`}
          style={{
            background: "var(--fg-surface)",
            borderColor: "var(--fg-rule)",
            boxShadow: "0 20px 60px rgba(34,32,27,0.35)",
          }}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 id={titleId} className="font-serif text-xl" style={{ color: "var(--fg)" }}>
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full border text-sm"
              style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)" }}
              aria-label={`Close ${title}`}
            >
              <span aria-hidden>✕</span>
            </button>
          </div>
          {children}
        </div>
      </div>
    </ModalPortal>
  );
}
