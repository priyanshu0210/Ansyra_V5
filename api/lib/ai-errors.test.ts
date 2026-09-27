import { describe, expect, it } from "vitest";
import { providerFailure, retryDelayMs } from "./ai-errors";
describe("AI provider limits", () => {
  it("does not repeatedly retry an exhausted daily quota", () => expect(providerFailure(429, "GenerateRequestsPerDay quota exceeded")).toMatchObject({ retryable: false, kind: "quota", code: "TOO_MANY_REQUESTS" }));
  it("distinguishes temporary capacity from account configuration", () => {
    expect(providerFailure(429, "tokens per minute")).toMatchObject({ retryable: true, kind: "busy" });
    expect(providerFailure(401, "secret-internal-detail").message).not.toContain("secret-internal-detail");
  });
  it("honours both Retry-After formats without truncating a long provider delay", () => {
    expect(retryDelayMs("30", 0)).toBe(30000);
    expect(retryDelayMs("Sun, 06 Sep 2026 10:00:30 GMT", 0, Date.parse("2026-09-06T10:00:00Z"))).toBe(30000);
  });
});
