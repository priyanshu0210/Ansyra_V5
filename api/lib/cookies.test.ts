import { describe, it, expect } from "vitest";
import { getSessionCookieOptions, isSecureRequest } from "./cookies";

// REGRESSION TESTS for "I used the right password and it won't log me in".
//
// The session cookie used to take `Secure` + `SameSite=None` whenever the Host
// header did not literally start with `localhost:` or `127.0.0.1:`. A `Secure`
// cookie is discarded by the browser over plain http, so on those origins the
// login SUCCEEDED — 200, correct password, session minted server-side — and the
// cookie was then dropped. The reader was bounced straight back to the login
// form, which is indistinguishable from a rejected password.
//
// Measured against the running server with one real credential, varying only
// the Host: localhost and 127.0.0.1 stored the cookie; `[::1]` and a LAN IP
// both came back `Secure; SameSite=None` and were dropped.
//
// These pin the property that actually matters: over http the cookie must be
// storable, whatever the host is called.

const headers = (h: Record<string, string>) => new Headers(h);

describe("session cookie flags", () => {
  // The four hosts from the measurement. The last two are the bug.
  const httpHosts = [
    "localhost:3000",
    "127.0.0.1:3000",
    "[::1]:3000", // IPv6 loopback — the dev server binds `::` for Safari
    "192.168.1.20:3000", // LAN, i.e. testing on a phone
    "localhost", // no explicit port: the old prefix check needed the colon
    "my-box.local:3000",
  ];

  for (const host of httpHosts) {
    it(`never sets Secure over http on ${host}`, () => {
      const opts = getSessionCookieOptions(headers({ host, origin: `http://${host}` }));
      expect(opts.secure, `${host} would drop the cookie`).toBe(false);
      // `SameSite=None` is rejected by browsers without `Secure`, so the two
      // have to move together or the cookie is refused twice over.
      expect(opts.sameSite).toBe("Lax");
      expect(opts.httpOnly).toBe(true);
      expect(opts.path).toBe("/");
    });
  }

  it("sets Secure + Lax when the browser used https", () => {
    const opts = getSessionCookieOptions(
      headers({ host: "app.ansyra.com", origin: "https://app.ansyra.com" }),
    );
    expect(opts.secure).toBe(true);
    expect(opts.sameSite).toBe("Lax");
  });

  it("trusts x-forwarded-proto, which is all a TLS-terminating proxy leaves", () => {
    // Render/Docker: the socket into Node is plain http and the header is the
    // only evidence the client used https.
    const opts = getSessionCookieOptions(
      headers({ host: "app.ansyra.com", "x-forwarded-proto": "https" }),
    );
    expect(opts.secure).toBe(true);
  });

  it("reads the client-facing hop when several proxies are chained", () => {
    expect(isSecureRequest(headers({ "x-forwarded-proto": "https,http" }))).toBe(true);
    expect(isSecureRequest(headers({ "x-forwarded-proto": "http,https" }))).toBe(false);
  });

  it("understands the RFC 7239 Forwarded header", () => {
    expect(isSecureRequest(headers({ forwarded: "for=1.2.3.4;proto=https" }))).toBe(true);
    expect(isSecureRequest(headers({ forwarded: 'for=1.2.3.4;proto="https"' }))).toBe(true);
    expect(isSecureRequest(headers({ forwarded: "for=1.2.3.4;proto=http" }))).toBe(false);
  });

  // Defaulting to insecure is the safe direction: an omitted `Secure` on an
  // https origin still yields a working session, while a spurious `Secure` on
  // http destroys it outright.
  it("defaults to not-secure when nothing says otherwise", () => {
    expect(isSecureRequest(headers({}))).toBe(false);
    expect(isSecureRequest(headers({ referer: "not a url" }))).toBe(false);
  });

  it("falls back to the referer's scheme", () => {
    expect(isSecureRequest(headers({ referer: "https://app.ansyra.com/login" }))).toBe(true);
    expect(isSecureRequest(headers({ referer: "http://localhost:3000/login" }))).toBe(false);
  });
});

it("cannot downgrade production cookies with forged forwarding headers", async () => {
  const { env } = await import("./env");
  const previous = { isProduction: env.isProduction, siteUrl: env.siteUrl };
  Object.assign(env, { isProduction: true, siteUrl: "https://ansyra.example" });
  try {
    expect(getSessionCookieOptions(new Headers({ "x-forwarded-proto": "http", origin: "http://evil.example" })).secure).toBe(true);
  } finally { Object.assign(env, previous); }
});
