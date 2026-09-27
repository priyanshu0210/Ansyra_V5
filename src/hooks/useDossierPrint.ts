import { useCallback, useEffect, useState } from "react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { flushSync } from "react-dom";

export function useDossierPrint(dealId: number) {
  const client = useQueryClient();
  const fetching = useIsFetching();
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prepare = useCallback(() => {
    setError(null);
    // Mount every chapter before waiting for its queries, so exports include
    // sections the reader has not opened. Never print a partial loading state.
    flushSync(() => setPreparing(true));
    void client.refetchQueries({ type: "active", predicate: query => query.state.status === "error" });
  }, [client]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
        event.preventDefault(); prepare();
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [prepare]);
  useEffect(() => {
    if (!preparing || fetching) return;
    // Allow newly mounted components and dependent queries to start and paint.
    const timer = window.setTimeout(() => {
      if (client.isFetching()) return;
      const failed = client.getQueryCache().getAll().some(query => {
        const input = (query.queryKey[1] as { input?: { dealId?: number; id?: number } } | undefined)?.input;
        return query.isActive() && query.state.status === "error" && (input?.dealId === dealId || input?.id === dealId);
      });
      if (failed) {
        setError("The PDF could not be prepared because part of this deal failed to load. Try Export PDF again.");
        setPreparing(false); return;
      }
      requestAnimationFrame(() => requestAnimationFrame(() => {
        try { window.print(); } finally { setPreparing(false); }
      }));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [preparing, fetching, client, dealId]);
  return { preparing, error, prepare };
}
