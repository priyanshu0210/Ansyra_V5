import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "./ai";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("live AI availability", () => {
  it("does not retry a daily quota failure or expose provider response contents", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("daily quota; secret-debug-detail", { status: 429 }));
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(fetchWithRetry("https://example.test", {})).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS", message: expect.stringContaining("shared AI allowance") });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("retries temporary capacity errors then returns the successful response", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("busy", { status: 429, headers: { "Retry-After": "0" } })).mockResolvedValueOnce(new Response("ok"));
    vi.stubGlobal("fetch", fetch);
    expect(await (await fetchWithRetry("https://example.test", {})).text()).toBe("ok");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("does not resend a request after its own timeout fired (the provider may have billed it)", async () => {
    const fetch = vi.fn().mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchWithRetry("https://example.test", {})).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("retries a connection failure but stops when the wall-clock budget is spent", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetch);
    // A budget too small for even one backoff: no second attempt.
    await expect(fetchWithRetry("https://example.test", {}, 3, 100)).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("does not retry earlier than a long Retry-After permits", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("busy", { status: 429, headers: { "Retry-After": "120" } }));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchWithRetry("https://example.test", {})).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
