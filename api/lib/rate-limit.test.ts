import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.hoisted(() => vi.fn());
vi.mock("../queries/connection", () => ({
  getDb: () => ({ execute }),
}));

// A mutable stand-in for the env module so each case can set proxy trust
// without re-importing under different process.env.
const envState = vi.hoisted(() => ({
  trustProxyHeaders: false,
  proxyIpHeader: "x-forwarded-for",
  trustedProxyHops: 1,
}));
vi.mock("./env", () => ({ env: envState }));

import { enforceRateLimit, getClientIp } from "./rate-limit";

beforeEach(() => {
  execute.mockReset();
  envState.trustProxyHeaders = false;
  envState.proxyIpHeader = "x-forwarded-for";
  envState.trustedProxyHops = 1;
});

describe("enforceRateLimit", () => {
  it("allows a hit at the configured limit", async () => {
    execute.mockResolvedValue({ rows: [{ hits: 5 }] });
    await expect(enforceRateLimit("login", "198.51.100.4", 5, 60_000)).resolves.toBeUndefined();
  });

  it("rejects the first hit over the configured limit", async () => {
    execute.mockResolvedValue({ rows: [{ hits: 6 }] });
    await expect(enforceRateLimit("login", "198.51.100.4", 5, 60_000)).rejects.toThrow(
      /Too many requests/,
    );
  });

  it("preserves a caller-specific recovery message", async () => {
    execute.mockResolvedValue({ rows: [{ hits: 2 }] });
    await expect(enforceRateLimit("access", "198.51.100.4", 1, 60_000, "Slow down.")).rejects.toThrow(
      "Slow down.",
    );
  });

  it("rejects an invalid bucket before querying", async () => {
    await expect(enforceRateLimit("not valid", "x", 1, 60_000)).rejects.toThrow("Invalid rate-limit bucket");
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("getClientIp", () => {
  const withHeaders = (headers: Record<string, string>) => new Request("http://localhost", { headers });

  it("uses the socket peer and ignores forwarding headers unless proxy trust is configured", () => {
    expect(getClientIp(withHeaders({ "x-forwarded-for": "203.0.113.9" }), "10.0.0.7")).toBe("10.0.0.7");
    expect(getClientIp(withHeaders({ "x-forwarded-for": "203.0.113.9" }))).toBe("unknown");
  });

  it("takes the entry the trusted proxy appended, not one the client prepended", () => {
    envState.trustProxyHeaders = true;
    // A client sent "spoofed"; the proxy appended the real address.
    expect(getClientIp(withHeaders({ "x-forwarded-for": "spoofed, 203.0.113.9" }), "10.0.0.7")).toBe("203.0.113.9");
    expect(getClientIp(withHeaders({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("honours a configured number of trusted hops", () => {
    envState.trustProxyHeaders = true;
    envState.trustedProxyHops = 2;
    expect(getClientIp(withHeaders({ "x-forwarded-for": "spoofed, 203.0.113.9, 198.51.100.1" }))).toBe("203.0.113.9");
  });

  it("never reads platform headers that were not configured", () => {
    envState.trustProxyHeaders = true;
    expect(getClientIp(withHeaders({ "cf-connecting-ip": "203.0.113.9", "x-real-ip": "203.0.113.10" }), "10.0.0.7")).toBe("10.0.0.7");
  });

  it("reads a different header when configured to", () => {
    envState.trustProxyHeaders = true;
    envState.proxyIpHeader = "x-real-ip";
    expect(getClientIp(withHeaders({ "x-real-ip": "203.0.113.10", "x-forwarded-for": "spoofed" }))).toBe("203.0.113.10");
  });
});
