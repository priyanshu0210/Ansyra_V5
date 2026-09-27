import { useEffect, useState, type ReactNode } from "react";

export function DossierChapter({ id, title, summary, defaultOpen = false, forceMount = false, onActivate, children }: {
  id: string; title: string; summary: string; defaultOpen?: boolean; forceMount?: boolean;
  onActivate?: (id: string) => void; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [visited, setVisited] = useState(defaultOpen);
  useEffect(() => {
    const reveal = () => {
      if (window.location.hash === `#${id}`) {
        setOpen(true); setVisited(true); onActivate?.(id);
      }
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [id, onActivate]);
  return <section id={id} className="min-w-0 scroll-mt-20">
    <details className="ansyra-dossier-chapter rounded-sm border" style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)" }} open={open} onToggle={(event) => {
      const next = event.currentTarget.open;
      setOpen(next);
      if (next) { setVisited(true); onActivate?.(id); }
    }}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-3 py-4 sm:px-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
        <span className="min-w-0">
          <span className="block font-serif text-xl" style={{ color: "var(--fg)" }}>{title}</span>
          <span className="mt-0.5 block font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>{summary}</span>
        </span>
        <span aria-hidden className="ansyra-dossier-chevron shrink-0 font-sans text-lg" style={{ color: "var(--fg-2)" }}>⌄</span>
      </summary>
      {(visited || forceMount) && <div className="min-w-0 space-y-6 border-t p-3 sm:p-5" style={{ borderColor: "var(--fg-rule)" }}>{children}</div>}
    </details>
  </section>;
}
