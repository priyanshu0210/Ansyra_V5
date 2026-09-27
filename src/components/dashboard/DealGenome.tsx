import { usePreloadDeal } from "@/hooks/usePreloadDeal";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { withToast } from "./parchment/notify";
import { Card } from "./parchment/Card";
import { TextInput } from "./DealPipeline";
import { genomeStore, useTabStore } from "@/lib/tab-stores";
import { AiDisclaimer } from "@/components/AiDisclaimer";

interface Deal {
  id: number;
  name: string;
  targetCompany: string;
  status: string;
  stage: string;
  value: string | null;
  industry: string | null;
  createdAt: Date;
}

export function DealGenome({ deals }: { deals: Deal[] }) {
  // Query text + last answer live in a module store so switching tabs (or a
  // dev-mode remount) doesn't wipe the search you just ran.
  const { query, answer, matches } = useTabStore(genomeStore);
  const setQuery = (v: string) => genomeStore.set((p) => ({ ...p, query: v }));
  const navigate = useNavigate();
  const preloadDeal = usePreloadDeal();
  // The corpus (deals + their assumption history) is assembled server-side.
  const search = trpc.ai.dealGenomeSearch.useMutation(withToast({ done: "Answer ready", failed: "Could not search your deal history", silentOnSuccess: true }, {
    onSuccess: (data) => {
      const d = data as { answer?: string; matches?: { id: number; name: string; reason: string }[] };
      genomeStore.set((p) => ({ ...p, answer: d.answer ?? null, matches: d.matches ?? [] }));
    },
  }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || search.isPending) return;
    search.mutate({ query });
  };

  return (
    <div className="space-y-6">
      <Card>
        <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>
          Natural language search · AI-powered
        </p>
        <p className="mt-2 font-sans text-sm" style={{ color: "var(--fg-2)" }}>Search covers up to 40 deals, selected assumptions, and saved economics. Full documents, IC memos, and decision narratives are not included; open the deal dossier to check those sources.</p>
        <form onSubmit={submit} className="mt-3 flex flex-col gap-3 md:flex-row">
          <div className="flex-1">
            <TextInput
              value={query}
              onChange={setQuery}
              placeholder='"Show me industrial deals where we assumed over 20% EBITDA expansion"'
            />
          </div>
          <button
            type="submit"
            disabled={search.isPending}
            data-testid="genome-search-btn"
            className="rounded-full px-6 py-3 font-sans text-sm"
            style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)" }}
          >
            {search.isPending ? "Searching…" : "Query Genome"}
          </button>
        </form>
        {search.error && (
          <p className="mt-3 font-sans text-[12px]" style={{ color: "var(--sev-flag-text)" }}>{search.error.message}</p>
        )}
        {answer && (
          <div className="mt-6 rounded-sm border p-5" style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)" }} data-testid="genome-answer">
            <p className="ansyra-label" style={{ color: "var(--fg)" }}>Answer</p>
            <p className="mt-2 font-serif text-lg leading-relaxed" style={{ color: "var(--fg)" }}>{answer}</p>
          </div>
        )}
        {matches.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
            {matches.map((m) => {
              const d = deals.find((x) => x.id === m.id);
              return (
                <button
                  key={String(m.id)}
                  onPointerEnter={() => d && preloadDeal(d.id)}
                  onFocus={() => d && preloadDeal(d.id)}
                  onClick={() => { if (d) { preloadDeal(d.id); navigate(`/dashboard/deals/${d.id}`); } }}
                  className="rounded-sm border p-4 text-left transition-colors"
                  style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)" }}
                  data-testid={`genome-match-${m.id}`}
                >
                  <p className="font-serif text-lg" style={{ color: "var(--fg)" }}>{m.name}</p>
                  <p className="mt-1 font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>{m.reason}</p>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>Portfolio genome library</p>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {deals.map((d) => (
            <button
              key={d.id}
              onPointerEnter={() => preloadDeal(d.id)}
              onFocus={() => preloadDeal(d.id)}
              onClick={() => { preloadDeal(d.id); navigate(`/dashboard/deals/${d.id}`); }}
              data-testid={`genome-library-${d.id}`}
              className="rounded-sm border p-4 text-left"
              style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)" }}
            >
              <p className="font-serif text-[16px]" style={{ color: "var(--fg)" }}>{d.name}</p>
              <p className="mt-1 ansyra-label" style={{ color: "var(--fg-2)" }}>{d.industry ?? "Uncategorised"} · {d.stage}</p>
              <p className="mt-2 font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>{d.targetCompany}</p>
            </button>
          ))}
          {deals.length === 0 && <p className="col-span-full font-sans text-sm" style={{ color: "var(--fg-2)" }}>No deals in the genome yet — create one from the Deal Pipeline tab.</p>}
        </div>
      </Card>

      <AiDisclaimer />
    </div>
  );
}
