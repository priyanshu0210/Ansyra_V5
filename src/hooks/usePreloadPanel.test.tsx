// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { usePreloadPanel } from "./usePreloadPanel";
const mocks = vi.hoisted(() => ({
  user: { userKind: "member", features: ["pipeline", "synergy"] } as { userKind: string; features: string[] } | null,
  board: vi.fn().mockResolvedValue(undefined), activity: vi.fn().mockResolvedValue(undefined),
  deals: vi.fn().mockResolvedValue([{ id: 2, stage: "evaluation" }, { id: 7, stage: "integration" }]),
  plan: vi.fn().mockResolvedValue(undefined), code: vi.fn(),
}));
vi.mock("@/providers/trpc", () => ({ trpc: { useUtils: () => ({
  auth: { me: { getData: () => mocks.user } },
  deals: { pipelineBoard: { prefetch: mocks.board }, list: { fetch: mocks.deals } },
  activity: { list: { prefetch: mocks.activity } }, ai: { getSynergyPlan: { prefetch: mocks.plan } },
}) } }));
vi.mock("@/components/dashboard/panel-loaders", () => ({ preloadPanel: mocks.code }));
afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.user = { userKind: "member", features: ["pipeline", "synergy"] }; });
it("warms the exact initial panel inputs and the first integration deal", async () => {
  const { result } = renderHook(usePreloadPanel);
  await result.current("pipeline"); await result.current("activity"); await result.current("synergy");
  expect(mocks.board).toHaveBeenCalledWith({ query: "", industry: undefined, stage: undefined });
  expect(mocks.activity).toHaveBeenCalledWith({ limit: 50 });
  expect(mocks.plan).toHaveBeenCalledWith({ dealId: 7 });
});
it("does not prefetch inaccessible or signed-out panels", async () => {
  mocks.user = { userKind: "member", features: [] };
  const { result } = renderHook(usePreloadPanel);
  await result.current("pipeline"); await result.current("synergy");
  mocks.user = null; await result.current("activity");
  expect(mocks.code).not.toHaveBeenCalled();
  expect(mocks.board).not.toHaveBeenCalled(); expect(mocks.plan).not.toHaveBeenCalled(); expect(mocks.activity).not.toHaveBeenCalled();
});
