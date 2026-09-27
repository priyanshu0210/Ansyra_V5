import { useState, useRef, useEffect } from "react";
import type { inferRouterInputs } from "@trpc/server";
import type { AppRouter } from "../../../../api/router";
import { trpc } from "@/providers/trpc";

// The server's own vocabulary for the copilot surface, so a tab name that maps
// to something the router does not accept is a compile error here rather than a
// zod rejection at runtime.
type CopilotSurface = NonNullable<inferRouterInputs<AppRouter>["ai"]["copilot"]["surface"]>;

interface Message { id: string; role: "user" | "assistant"; content: string }

/**
 * A unique id for one locally-appended message.
 *
 * This is only ever a React `key` — it is never persisted and never sent to the
 * server, which is why a random value is safe here. It replaces `Date.now()`,
 * which had a real if rare defect: two messages appended inside the same
 * millisecond produced the SAME key, and React then reconciles them as one row.
 * Sending fast, or an error arriving in the same tick as a reply, was enough.
 *
 * It also removes a react-hooks/purity suppression. That rule was flagging the
 * clock read lexically inside the component even though `send` only ever runs
 * from a submit handler — but the fix stands on its own merits rather than on
 * silencing the rule, which is the only reason it was worth making.
 */
function messageId(): string {
  return crypto.randomUUID();
}

const SURFACE_INTROS: Record<string, { intro: string; prompts: string[] }> = {
  pipeline: {
    intro: "I can help you think through a deal using details you share here. I do not automatically read your pipeline.",
    prompts: ["What should I review before advancing a deal?", "Help me structure a pipeline review", "How do I test a deal assumption?"],
  },
  genome: {
    intro: "Use the Deal Genome search box to query saved records. This chat helps you frame questions using the context you share.",
    prompts: [
      "Help me phrase a question about past pricing assumptions",
      "What evidence would support an integration review?",
      "How should I compare two acquisition cases?",
    ],
  },
  assumptions: {
    intro: "I help challenge assumptions using the context supplied to this task.",
    prompts: ["What kind of assumptions are usually too optimistic?", "How should I frame an EBITDA assumption?"],
  },
  cultural: {
    intro: "I help prepare people and integration questions from details you share. I do not browse employee reviews.",
    prompts: ["What does high retention risk actually mean?", "How do I mitigate a leadership mismatch?"],
  },
  regulatory: {
    intro: "I help organise questions for regulatory specialists. I do not check current law or predict approval.",
    prompts: ["What information should I prepare for competition counsel?", "What questions should I ask about regulatory timing?"],
  },
  synergy: {
    intro: "Post-close performance and corrective action.",
    prompts: ["Why do IT synergies usually miss?", "How do I recover Year-1 revenue synergies?"],
  },
  targets: {
    intro: "I can help you screen and refine target lists.",
    prompts: ["What's a good fit-score threshold?", "How do I calibrate my sector filters?"],
  },
  analytics: {
    intro: "Share the figures you want to discuss. I do not automatically read the charts or your saved records.",
    prompts: ["How should I interpret time spent at each deal stage?", "How can I explain concentration by industry?"],
  },
  activity: {
    intro: "Paste the activity you want help summarising. This chat does not automatically read the activity feed.",
    prompts: ["Help me structure a weekly activity summary", "What should I include in a deal follow-up?"],
  },
  general: {
    intro: "I'm your M&A copilot. Ask me anything about strategy, structuring, or diligence.",
    prompts: ["What should my diligence checklist include?", "How do I evaluate a target company?"],
  },
};

// Map dashboard tabs to router surfaces (matches ai-router surface enum)
const SURFACE_MAP: Record<string, CopilotSurface> = {
  pipeline: "pipeline",
  genome: "genome",
  assumptions: "assumptions",
  cultural: "cultural",
  regulatory: "regulatory",
  synergy: "synergy",
  targets: "general",
  analytics: "general",
  activity: "general",
};

export function AIChatWidget({ surface = "general" }: { surface?: string }) {
  const routed: CopilotSurface = SURFACE_MAP[surface] ?? "general";
  const surfaceInfo = SURFACE_INTROS[surface] ?? SURFACE_INTROS.general;

  const welcome: Message = {
    id: "welcome",
    role: "assistant",
    content: `Hello. ${surfaceInfo.intro}`,
  };

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  // Persisted thread for this surface (Phase 11.6) — loaded when the widget
  // opens; the welcome message always leads.
  const history = trpc.ai.copilotHistory.useQuery(
    { surface: routed },
    { enabled: open, staleTime: 60_000 },
  );

  const copilot = trpc.ai.copilot.useMutation({
    onSuccess: (data) => {
      setMessages((p) => [...p, { id: `a-${messageId()}`, role: "assistant", content: data.response }]);
      setTyping(false);
      utils.ai.copilotHistory.invalidate({ surface: routed });
    },
    onError: (err) => {
      setMessages((p) => [
        ...p,
        { id: `e-${messageId()}`, role: "assistant", content: `The copilot couldn't respond: ${err.message}` },
      ]);
      setTyping(false);
    },
  });

  const clear = trpc.ai.clearCopilot.useMutation({
    onSuccess: () => {
      utils.ai.copilotHistory.invalidate({ surface: routed });
      const intro = SURFACE_INTROS[surface] ?? SURFACE_INTROS.general;
      setMessages([{ id: "welcome", role: "assistant", content: `Hello. ${intro.intro}` }]);
    },
  });

  useEffect(() => {
    // Surface changed or history arrived: rebuild the thread from the
    // persisted messages (welcome first). Skip while a reply is pending so we
    // don't clobber the optimistic user message.
    if (typing) return;
    const intro = SURFACE_INTROS[surface] ?? SURFACE_INTROS.general;
    const persisted: Message[] = (history.data ?? []).map((m) => ({
      id: `db-${m.id}`,
      role: m.role,
      content: m.content,
    }));
    // the transcript is seeded from server history plus a surface-specific
    // greeting, and it is then owned locally (optimistic sends, streaming
    // replies), so it cannot be derived during render. Rewriting it as derived
    // state changes when the greeting appears relative to the persisted
    // messages. Tracked, not fixed here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages([{ id: "welcome", role: "assistant", content: `Hello. ${intro.intro}` }, ...persisted]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface, history.data]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = (text: string) => {
    if (!text.trim()) return;
    const userMsg: Message = { id: `u-${messageId()}`, role: "user", content: text };
    setMessages((p) => [...p, userMsg]);
    setInput("");
    setTyping(true);
    // Include short context: last 4 assistant/user turns
    const ctx = messages.slice(-6).map((m) => `${m.role === "user" ? "User" : "Ansyra"}: ${m.content}`).join("\n");
    copilot.mutate({ message: text, surface: routed, context: ctx });
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          data-testid="chat-open"
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full transition-transform hover:scale-105"
          style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)", boxShadow: "0 6px 20px rgba(34,32,27,0.35)" }}
          title="Ansyra copilot"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M12 3l-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
          </svg>
        </button>
      )}

      {open && (
        <div
          data-testid="chat-widget"
          className="fixed bottom-4 right-4 z-50 flex h-[70dvh] max-h-[560px] w-[calc(100vw-2rem)] max-w-[400px] flex-col overflow-hidden rounded-sm border md:bottom-6 md:right-6"
          style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", boxShadow: "0 24px 60px rgba(34,32,27,0.25)" }}
        >
          <header className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)" }}>
            <div>
              <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>Copilot · {surface}</p>
              <p className="font-serif text-lg" style={{ color: "var(--fg)" }}>Ansyra</p>
            </div>
            <div className="flex items-center gap-2">
              {messages.length > 1 && (
                <button
                  onClick={() => clear.mutate({ surface: routed })}
                  disabled={clear.isPending}
                  data-testid="chat-clear"
                  className="rounded-full border px-2.5 py-1 font-sans text-[length:var(--step-xs)] disabled:opacity-50"
                  style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)" }}
                  title="Clear conversation"
                >
                  Clear
                </button>
              )}
              <button onClick={() => setOpen(false)} data-testid="chat-close" className="rounded-full border p-1.5" style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[85%] rounded-sm border px-3.5 py-2.5 font-sans text-[13px] leading-relaxed"
                  style={{
                    borderColor: "var(--fg-rule)",
                    background: m.role === "user" ? "var(--fg)" : "var(--fg-surface)",
                    color: m.role === "user" ? "var(--clear)" : "var(--fg-2)",
                  }}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex justify-start">
                <div className="rounded-sm border px-4 py-3" style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)" }}>
                  <div className="flex items-center gap-1.5">
                    {[0, 150, 300].map((d) => (
                      <span key={d} className="ansyra-think-dot h-1.5 w-1.5 rounded-full" style={{ background: "var(--fg-2)", animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            {messages.length === 1 && (
              <div className="mt-3 space-y-2">
                <p className="text-center ansyra-label" style={{ color: "var(--fg-2)" }}>Try</p>
                {surfaceInfo.prompts.map((p) => (
                  <button
                    key={p}
                    onClick={() => send(p)}
                    className="w-full rounded-sm border px-3 py-2 text-left font-sans text-[12px]"
                    style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)", color: "var(--fg-2)" }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="border-t p-3"
            style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)" }}
          >
            <div className="flex items-center gap-2">
              <input
                data-testid="chat-input"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask the copilot…"
                className="flex-1 rounded-sm border px-3 py-2 font-sans text-sm outline-none focus:border-[var(--fg)]"
                style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", color: "var(--fg)" }}
              />
              <button
                type="submit"
                disabled={!input.trim() || copilot.isPending}
                data-testid="chat-send"
                className="flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-30"
                style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
