import { describe, it, expect, afterEach, vi } from "vitest";
import { apiFetch } from "./api-fetch";

// REGRESSION TESTS for the error that named the parser instead of the problem.
//
// Rendered verbatim under the password field on the login form:
//
//     Failed to execute 'json' on 'Response': Unexpected end of JSON input
//
// The cause that produced it was a static file server answering /api/trpc with
// an HTML 404 — no API behind the origin at all. The message told the reader
// nothing they could act on, and it is not a dev-only shape: an HTML 502 from a
// proxy, a gateway timeout page, or a deploy that serves the built assets
// without their server all land here identically.
//
// What these pin: anything that is not JSON becomes a sentence about the API,
// and anything that IS json is passed through untouched — including tRPC's own
// error responses, which are JSON with a non-2xx status and carry the server's
// message verbatim.

const res = (body: string, init: ResponseInit & { type?: string }) =>
  new Response(body, {
    ...init,
    headers: init.type ? { "content-type": init.type } : {},
  });

afterEach(() => vi.unstubAllGlobals());

function stubFetch(response: Response) {
  const spy = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("apiFetch", () => {
  it("passes a JSON response straight through", async () => {
    stubFetch(res('{"result":{"data":1}}', { status: 200, type: "application/json" }));
    const out = await apiFetch("/api/trpc/auth.me");
    expect(out.status).toBe(200);
    // The body must be intact — reading it for diagnostics must not consume it.
    await expect(out.text()).resolves.toBe('{"result":{"data":1}}');
  });

  // tRPC reports every server error as JSON with a non-2xx status, and those
  // messages are the ones users actually need (the gates return sentences read
  // verbatim). Status alone must never trigger the rewrite.
  it("passes a JSON error response through so the server's message survives", async () => {
    stubFetch(
      res('{"error":{"json":{"message":"Invalid email or password."}}}', {
        status: 401,
        type: "application/json",
      }),
    );
    const out = await apiFetch("/api/trpc/auth.login");
    expect(out.status).toBe(401);
    await expect(out.text()).resolves.toContain("Invalid email or password.");
  });

  // THE BUG ITSELF: a static host answering an API path.
  it("explains an HTML 404 instead of letting the JSON parser fail", async () => {
    stubFetch(res("<!doctype html><title>404</title>", { status: 404, type: "text/html" }));
    await expect(apiFetch("/api/trpc/auth.login")).rejects.toThrow(
      /API did not respond at \/api\/trpc/i,
    );
  });

  it("explains an HTML 5xx from a proxy", async () => {
    stubFetch(res("<html>502 Bad Gateway</html>", { status: 502, type: "text/html" }));
    await expect(apiFetch("/api/trpc/auth.me")).rejects.toThrow(/server failed to handle/i);
  });

  // The nastiest shape: 200 OK with index.html, which a SPA host does for any
  // unknown path. Nothing about the status says anything is wrong.
  it("explains a 200 that is actually the app's own index.html", async () => {
    stubFetch(res("<!doctype html><div id=root></div>", { status: 200, type: "text/html" }));
    await expect(apiFetch("/api/trpc/auth.me")).rejects.toThrow(
      /serving files where the API should be/i,
    );
  });

  it("never says 'Unexpected end of JSON input'", async () => {
    stubFetch(res("", { status: 404, type: "text/html" }));
    await expect(apiFetch("/api/trpc/auth.login")).rejects.not.toThrow(/JSON input/i);
  });

  // THE OTHER HALF. `fetch` rejects before any Response exists when the server
  // is not listening — which is what the reader hits after a restart, a crash,
  // or a dropped connection. The browser's own word for it is "Failed to
  // fetch", and shipping that verbatim under the password field is the same
  // failure as the JSON message this file exists to replace.
  it("explains an unreachable server instead of 'Failed to fetch'", async () => {
    const spy = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", spy);
    await expect(apiFetch("/api/trpc/auth.login")).rejects.toThrow(/Can't reach the Ansyra server/i);
    await expect(apiFetch("/api/trpc/auth.login")).rejects.not.toThrow(/^Failed to fetch$/);
  });

  it("keeps the original failure as the cause, so it stays debuggable", async () => {
    const cause = new TypeError("Failed to fetch");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(cause));
    await expect(apiFetch("/api/trpc/auth.me")).rejects.toMatchObject({ cause });
  });

  // A cancelled request is NOT a failure. react-query aborts in-flight queries
  // on unmount and on refetch; turning those into "the server is unreachable"
  // would put an error in front of anyone navigating quickly.
  it("lets an AbortError through untouched", async () => {
    const abort = new DOMException("The operation was aborted.", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort));
    await expect(apiFetch("/api/trpc/auth.me")).rejects.toBe(abort);
  });

  it("lets any rejection through untouched once the signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const raw = new TypeError("Failed to fetch");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(raw));
    await expect(apiFetch("/api/trpc/auth.me", { signal: controller.signal })).rejects.toBe(raw);
  });

  it("sends credentials, which is what carries the session cookie", async () => {
    const spy = stubFetch(res("{}", { status: 200, type: "application/json" }));
    await apiFetch("/api/trpc/auth.me", { method: "GET" });
    expect(spy.mock.calls[0][1]).toMatchObject({ method: "GET", credentials: "include" });
  });
});
