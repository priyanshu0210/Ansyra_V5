export interface Review {
  id: number;
  createdAt: Date | string;
  result: Record<string, unknown>;
  dealId: number | null;
  target: string;
  sector: string | null;
  acquirer?: string;
  geography?: string;
  combinedMarketShare?: string | null;
}

// JSONB property order is not meaningful. Compare the complete result and
// context, never just the summary: different evidence must remain distinct.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function groupReviews<T extends Review>(reviews: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const row of [...reviews].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt) || b.id - a.id)) {
    const key = canonical([row.dealId, row.target, row.sector, row.acquirer, row.geography, row.combinedMarketShare, row.result]);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.values()];
}
