// ─────────────────────────────────────────────────────────────────────────────
// Module-scoped state for section-local *input drafts*.
// ─────────────────────────────────────────────────────────────────────────────
// AI results are persisted in Postgres (see api/ai-router.ts) and loaded via
// tRPC queries — they no longer live in client state at all. What remains here
// is only the text a user is midway through typing, lifted above React's tree
// so a dev-mode remount or tab switch never wipes an unsubmitted form.
// ─────────────────────────────────────────────────────────────────────────────
import { useSyncExternalStore } from "react";

type Listener = () => void;

class TabStore<T> {
  private state: T;
  private listeners = new Set<Listener>();
  constructor(initial: T) {
    this.state = initial;
  }
  get(): T {
    return this.state;
  }
  set(next: T | ((prev: T) => T)) {
    const value =
      typeof next === "function" ? (next as (p: T) => T)(this.state) : next;
    if (Object.is(value, this.state)) return;
    this.state = value;
    for (const l of this.listeners) l();
  }
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export function useTabStore<T>(store: TabStore<T>): T {
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.get(),
    () => store.get(),
  );
}

// ─── Assumption Ledger (draft input) ────────────────────────────────────
export const assumptionInputStore = new TabStore<{
  dealId: number | null;
  text: string;
  reviewer: string;
}>({
  dealId: null,
  text: "",
  reviewer: "",
});

// ─── Cultural Compatibility (draft input) ───────────────────────────────
export const culturalStore = new TabStore<{
  acquirer: string;
  target: string;
  sector: string;
  dealId: number | null;
}>({ acquirer: "", target: "", sector: "", dealId: null });

// ─── Regulatory Radar (draft input) ─────────────────────────────────────
export const regulatoryStore = new TabStore<{
  target: string;
  sector: string;
  geography: string;
  share: string;
  dealId: number | null;
}>({ target: "", sector: "", geography: "UK & EU", share: "", dealId: null });

// ─── Deal Genome (query + last transient answer) ────────────────────────
export const genomeStore = new TabStore<{
  query: string;
  answer: string | null;
  matches: Array<{ id: number; name: string; reason: string }>;
}>({
  query: "",
  answer: null,
  matches: [],
});

/** Drafts belong to the signed-in account, never the next login in this tab. */
export function resetTabStores() {
  assumptionInputStore.set({ dealId: null, text: "", reviewer: "" });
  culturalStore.set({ acquirer: "", target: "", sector: "", dealId: null });
  regulatoryStore.set({ target: "", sector: "", geography: "UK & EU", share: "", dealId: null });
  genomeStore.set({ query: "", answer: null, matches: [] });
}
