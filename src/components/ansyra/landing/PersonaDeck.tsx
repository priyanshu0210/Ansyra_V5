import { useRef, useState, type KeyboardEvent } from "react";
import { ROLES } from "@/lib/landing-content";

// Stationary choices keep every audience readable. Only the detail copy changes.
export function PersonaDeck() {
  const [active, setActive] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const current = ROLES[active];
  function move(event: KeyboardEvent, index: number) {
    const next = event.key === "Home" ? 0 : event.key === "End" ? ROLES.length - 1
      : ["ArrowDown", "ArrowRight"].includes(event.key) ? (index + 1) % ROLES.length
      : ["ArrowUp", "ArrowLeft"].includes(event.key) ? (index + ROLES.length - 1) % ROLES.length : null;
    if (next === null) return;
    event.preventDefault(); setActive(next); buttons.current[next]?.focus();
  }
  return (
    <div className="grid items-stretch gap-8 md:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.2fr)] md:gap-12" data-testid="persona-selector">
      <div role="tablist" aria-label="Who Ansyra is for" aria-orientation="vertical" className="flex flex-col">
        {ROLES.map((role, index) => (
          <button key={role.id} ref={node => { buttons.current[index] = node; }} type="button" role="tab"
            id={`persona-tab-${role.id}`} data-testid={`persona-${role.id}`} aria-selected={active === index}
            aria-controls="persona-details" tabIndex={active === index ? 0 : -1}
            onClick={() => setActive(index)} onKeyDown={event => move(event, index)}
            className="flex min-h-14 items-center justify-between gap-4 border-b px-4 py-4 text-left font-sans transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ borderColor: "var(--fg-rule)", background: active === index ? "var(--fg-surface)" : "transparent", color: active === index ? "var(--fg)" : "var(--fg-2)" }}>
            <span>{role.role}</span><span aria-hidden="true">{active === index ? "→" : "+"}</span>
          </button>
        ))}
      </div>
      <div id="persona-details" role="tabpanel" aria-labelledby={`persona-tab-${current.id}`} tabIndex={0}
        className="min-w-0 border-t py-6 md:min-h-[390px] md:px-6" style={{ borderColor: "var(--fg-rule)" }}>
        <h3 className="font-display text-3xl leading-tight sm:text-4xl" style={{ color: "var(--fg)" }}>{current.role}</h3>
        <p className="mt-5 max-w-xl font-sans text-lg leading-relaxed" style={{ color: "var(--fg)" }}>{current.line}</p>
        <p className="mt-3 max-w-xl font-sans text-sm leading-relaxed" style={{ color: "var(--fg-2)" }}>{current.detail}</p>
        <ul className="mt-6 space-y-3 border-t pt-5 font-sans text-sm leading-relaxed" style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)" }}>
          {current.uses.map(use => <li key={use.tool}><span style={{ color: "var(--fg)" }}>{use.tool.replace("™", "")}</span>: {use.how}.</li>)}
        </ul>
      </div>
    </div>
  );
}
