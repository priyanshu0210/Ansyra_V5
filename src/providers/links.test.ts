import { afterEach, expect, it, vi } from "vitest";
import { createTRPCClient } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../api/router";
import { createApiLinks } from "./links";

afterEach(() => vi.unstubAllGlobals());

it("renders the critical deal response without waiting for the analysis batch", async () => {
  let releaseAnalysis!: () => void;
  const analysisGate = new Promise<void>((resolve) => { releaseAnalysis = resolve; });
  const requests: string[] = [];
  const response = (value: unknown) => ({ result: { data: superjson.serialize(value) } });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    requests.push(url.pathname);
    if (url.pathname === "/api/trpc/deals.get") {
      expect(url.searchParams.has("batch")).toBe(false);
      return Response.json(response({ id: 42, name: "Test deal" }));
    }
    await analysisGate;
    return Response.json(url.pathname.split("/").at(-1)!.split(",").map(() => response([])));
  }));
  const client = createTRPCClient<AppRouter>({ links: createApiLinks() });
  let analysisFinished = false;
  const analysis = Promise.all([
    client.ai.listCulturalScores.query(),
    client.activity.list.query({ dealId: 42, limit: 20 }),
  ]).then(() => { analysisFinished = true; });
  try {
    const deal = await client.deals.get.query({ id: 42 });
    expect(deal.name).toBe("Test deal");
    expect(analysisFinished).toBe(false);
  } finally { releaseAnalysis(); }
  await analysis;
  expect(requests).toHaveLength(2);
  expect(requests).toContain("/api/trpc/ai.listCulturalScores,activity.list");
});

it("keeps access-denied errors intact on the independent deal request", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: superjson.serialize({
    message: "No access", code: -32003, data: { code: "FORBIDDEN", httpStatus: 403, path: "deals.get" },
  }) }, { status: 403 })));
  const client = createTRPCClient<AppRouter>({ links: createApiLinks() });
  await expect(client.deals.get.query({ id: 42 })).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
});
