import { describe, it, expect } from "vitest";
import { errorCode, retryQuery } from "./query-retry";

// The policy itself is tested in contracts/auth-resolution.test.ts. What is
// tested here is the part that can actually crash: reading a code off whatever
// react-query hands the `retry` option, which is typed as `Error` and is in
// practice one of three unrelated shapes.

describe("errorCode", () => {
  it("reads the code off a tRPC error", () => {
    expect(errorCode({ data: { code: "UNAUTHORIZED", httpStatus: 401 } })).toBe("UNAUTHORIZED");
  });

  it("returns undefined for a network error", () => {
    // What a refused connection actually produces. `api-fetch.ts` turns this
    // into a sentence about the origin, and neither form carries a code.
    expect(errorCode(new TypeError("Failed to fetch"))).toBeUndefined();
    expect(errorCode(new Error("Can't reach the Ansyra server at http://localhost:3300"))).toBeUndefined();
  });

  it("survives every shape that is not an object with a data.code", () => {
    // A thrown string, a null, a tRPC-shaped error whose `data` is null (which
    // is what a non-tRPC JSON error body deserialises to), and a `code` that is
    // not a string. Any of these throwing here would break RETRY for every
    // query in the app, on the failure path, where it is least likely to be
    // noticed.
    for (const shape of [null, undefined, "boom", 42, {}, { data: null }, { data: "x" }, { data: { code: 401 } }]) {
      expect(errorCode(shape), JSON.stringify(shape) ?? "undefined").toBeUndefined();
    }
  });
});

describe("retryQuery", () => {
  it("stops on the 401 the landing produces for every anonymous visitor", () => {
    expect(retryQuery(0, { data: { code: "UNAUTHORIZED" } })).toBe(false);
  });

  it("still gives an unanswered request its one retry", () => {
    // 0 is the first failure — see the note in contracts/auth-resolution.ts.
    expect(retryQuery(0, new TypeError("Failed to fetch"))).toBe(true);
    expect(retryQuery(1, new TypeError("Failed to fetch"))).toBe(false);
  });
});
