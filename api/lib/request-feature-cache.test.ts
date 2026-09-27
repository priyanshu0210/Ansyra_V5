import { expect, it, vi } from "vitest";
import { requestFeatures } from "./request-feature-cache";

it("shares one lookup across concurrent queries but never across requests or users", async () => {
  const request = new Request("http://localhost/api/trpc");
  const load = vi.fn(async () => new Set(["pipeline"]));
  const first = requestFeatures(request, "a", load);
  const second = requestFeatures(request, "a", load);
  expect(first).toBe(second);
  expect((await first).has("pipeline")).toBe(true);
  await requestFeatures(request, "b", load);
  expect(load).toHaveBeenCalledTimes(2);
  load.mockResolvedValueOnce(new Set());
  expect((await requestFeatures(new Request(request), "a", load)).has("pipeline")).toBe(false);
  expect(load).toHaveBeenCalledTimes(3);
});
