import { afterEach, describe, expect, it } from "vitest";
import { requestOrigin } from "./http";

// requestOrigin decides where password-reset and invite emails send the user
// back to. Getting it wrong means either a broken link or, if it ever trusted
// something it should not, an open redirect in an authentication email.

const original = process.env.SITE_URL;
afterEach(() => {
  if (original === undefined) delete process.env.SITE_URL;
  else process.env.SITE_URL = original;
});

const req = (headers: Record<string, string>) =>
  new Request("http://localhost:3000/api/trpc", { headers });

describe("precedence", () => {
  it("prefers an explicit SITE_URL over anything on the request", () => {
    process.env.SITE_URL = "https://app.example.com";
    expect(requestOrigin(req({ origin: "https://evil.example" }))).toBe("https://app.example.com");
  });

  it("strips a trailing slash from SITE_URL", () => {
    // Callers append paths; two slashes in a reset link look broken to a user
    // even when they work.
    process.env.SITE_URL = "https://app.example.com/";
    expect(requestOrigin(req({}))).toBe("https://app.example.com");
  });

  it("falls back to the Origin header when SITE_URL is unset", () => {
    delete process.env.SITE_URL;
    expect(requestOrigin(req({ origin: "http://localhost:5173" }))).toBe("http://localhost:5173");
  });

  it("falls back to the Referer's origin when there is no Origin", () => {
    delete process.env.SITE_URL;
    expect(requestOrigin(req({ referer: "http://localhost:3000/dashboard/deals/12?tab=x" }))).toBe(
      "http://localhost:3000",
    );
  });

  it("ignores a malformed Referer instead of throwing", () => {
    delete process.env.SITE_URL;
    expect(requestOrigin(req({ referer: "not a url" }))).toBe("http://localhost:3000");
  });

  it("ends at the localhost default when the request carries nothing", () => {
    delete process.env.SITE_URL;
    expect(requestOrigin(req({}))).toBe("http://localhost:3000");
  });

  it("treats an empty SITE_URL as unset", () => {
    process.env.SITE_URL = "";
    expect(requestOrigin(req({ origin: "http://localhost:4000" }))).toBe("http://localhost:4000");
  });
});
