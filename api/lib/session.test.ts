import { describe, expect, it } from "vitest";
import { decodeSession, encodeSession } from "./session";

// The session cookie is the entire authentication surface: one httpOnly cookie
// carrying both Supabase tokens. decodeSession is fed attacker-controllable
// input on every single request, so what it does with malformed input is a
// security property, not a nicety. It had no test.

describe("round trip", () => {
  it("preserves both tokens and the expiry", () => {
    const payload = { access_token: "at-123", refresh_token: "rt-456", expires_at: 1_800_000_000 };
    expect(decodeSession(encodeSession(payload))).toEqual(payload);
  });

  it("survives tokens containing characters that are unsafe in a cookie", () => {
    // Supabase JWTs are dot-separated base64url, but the refresh token format is
    // not contractually specified. base64url encoding of the whole JSON is what
    // makes this safe; a change to a naive JSON-in-cookie would break here.
    const payload = {
      access_token: 'a"b;c=d e\\f',
      refresh_token: "ünïcödé-refresh-🔑",
      expires_at: null,
    };
    const encoded = encodeSession(payload);
    expect(encoded).not.toMatch(/[;=" ]/);
    expect(decodeSession(encoded)).toEqual(payload);
  });

  it("round-trips without an expiry at all", () => {
    const payload = { access_token: "at", refresh_token: "rt" };
    expect(decodeSession(encodeSession(payload))).toEqual(payload);
  });
});

describe("decodeSession rejects rather than throws", () => {
  // Every one of these arrives as a cookie value on a real request. A throw here
  // is a 500 on an unauthenticated route; authenticateRequest catches, but the
  // contract of this function is to return null.

  it("returns null for empty input", () => {
    expect(decodeSession("")).toBeNull();
  });

  it("returns null for input that is not base64", () => {
    expect(decodeSession("!!!not base64!!!")).toBeNull();
  });

  it("returns null for valid base64 that is not JSON", () => {
    expect(decodeSession(Buffer.from("hello world", "utf8").toString("base64url"))).toBeNull();
  });

  it("returns null for JSON that is not an object", () => {
    for (const v of ["null", "42", '"a string"', "[1,2,3]"]) {
      expect(decodeSession(Buffer.from(v, "utf8").toString("base64url"))).toBeNull();
    }
  });

  it("returns null when the access token is missing", () => {
    const raw = Buffer.from(JSON.stringify({ refresh_token: "rt" }), "utf8").toString("base64url");
    expect(decodeSession(raw)).toBeNull();
  });

  it("returns null when the refresh token is missing", () => {
    const raw = Buffer.from(JSON.stringify({ access_token: "at" }), "utf8").toString("base64url");
    expect(decodeSession(raw)).toBeNull();
  });

  it("returns null when a token is present but empty", () => {
    const raw = Buffer.from(JSON.stringify({ access_token: "", refresh_token: "rt" }), "utf8").toString("base64url");
    expect(decodeSession(raw)).toBeNull();
  });
});

describe("what the cookie does NOT protect against", () => {
  it("is unsigned — a decoded payload is attacker-shaped, not attacker-proof", () => {
    // Documenting a real property rather than asserting a bug. Anyone can mint a
    // cookie carrying arbitrary token strings; what stops a forged session is
    // that Supabase then rejects the tokens, NOT anything this module does. If
    // signing is ever added, this test should be the one that changes.
    const forged = encodeSession({ access_token: "forged", refresh_token: "forged" });
    expect(decodeSession(forged)).toEqual({ access_token: "forged", refresh_token: "forged" });
  });
});

describe("hostile cookie shapes", () => {
  it.each([{ access_token: { token: "x" }, refresh_token: "y" }, { access_token: "x", refresh_token: ["y"] }, { access_token: "x", refresh_token: "y", expires_at: "never" }])("rejects non-string tokens and invalid expiry", payload => {
    expect(decodeSession(Buffer.from(JSON.stringify(payload)).toString("base64url"))).toBeNull();
  });
  it("rejects oversized cookies before parsing", () => expect(decodeSession("x".repeat(8193))).toBeNull());
});
