import { describe, expect, it } from "vitest";
import { assertAccountReady, assertMutationOrigin } from "./request-security";
const origin = "https://ansyra.example";
const request = (headers: Record<string,string> = {}) => new Request(`${origin}/api/trpc`, { headers });
describe("browser write origin", () => {
  it("accepts the configured origin behind a proxy", () => expect(() => assertMutationOrigin(new Request("http://internal/api", { headers: { origin } }), origin, true)).not.toThrow());
  it.each(["https://evil.example", "null", "https://ansyra.example.evil.test", "http://ansyra.example"])("rejects %s", value => expect(() => assertMutationOrigin(request({ origin: value }), origin, true)).toThrow());
  it("rejects missing origin in production", () => expect(() => assertMutationOrigin(request(), origin, true)).toThrow());
  it("rejects an explicit cross-site fetch", () => expect(() => assertMutationOrigin(request({ origin, "sec-fetch-site": "cross-site" }), origin, true)).toThrow());
  it("permits local non-browser test callers", () => expect(() => assertMutationOrigin(request(), "", false)).not.toThrow());
});
it("allows the current development port without trusting it in production", () => {
  const req = new Request("http://localhost:4175/api/trpc", { headers: { origin: "http://localhost:4175" } });
  expect(() => assertMutationOrigin(req, "http://localhost:3000", false)).not.toThrow();
  expect(() => assertMutationOrigin(req, "https://ansyra.example", true)).toThrow();
});
describe("temporary password enforcement", () => {
  it.each(["deals.list", "admin.listUsers", "ai.stressTestAssumption", "auth.updateProfile", "auth.exportMyData"])("blocks %s before password setup", path => expect(() => assertAccountReady({ mustChangePassword: true }, path)).toThrow());
  it.each(["auth.me", "auth.changePassword", "auth.logout"])("permits %s during setup", path => expect(() => assertAccountReady({ mustChangePassword: true }, path)).not.toThrow());
  it("preserves provisioned member behaviour", () => expect(() => assertAccountReady({ mustChangePassword: false }, "deals.list")).not.toThrow());
});
