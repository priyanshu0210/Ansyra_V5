import { describe, it, expect } from "vitest";
import { safeParseJson } from "./ai";

describe("safeParseJson", () => {
  it("parses clean JSON", () => {
    expect(safeParseJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips markdown fences (with and without language tag)", () => {
    expect(safeParseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(safeParseJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("recovers the first {...} block from surrounding prose", () => {
    expect(safeParseJson('Here is the result:\n{"a":1}\nHope that helps!')).toEqual({ a: 1 });
  });

  it("handles nested objects in prose recovery", () => {
    expect(safeParseJson('preamble {"a":{"b":[1,2]}} trailing')).toEqual({ a: { b: [1, 2] } });
  });

  it("returns undefined for junk and truncated JSON", () => {
    expect(safeParseJson("not json at all")).toBeUndefined();
    expect(safeParseJson('{"a": 1')).toBeUndefined();
    expect(safeParseJson("")).toBeUndefined();
  });
});
