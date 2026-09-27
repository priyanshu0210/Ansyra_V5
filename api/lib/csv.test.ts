import { describe, expect, it } from "vitest";
import { pipelineCsvFilename, toCsv, toCsvWithBom } from "./csv";

describe("toCsv", () => {
  it("joins headers and rows with CRLF", () => {
    expect(toCsv(["a", "b"], [[1, 2], [3, 4]])).toBe("a,b\r\n1,2\r\n3,4");
  });
  it("quotes cells with commas, quotes, or newlines and doubles quotes", () => {
    expect(toCsv(["x"], [["a,b"]])).toBe('x\r\n"a,b"');
    expect(toCsv(["x"], [['she said "hi"']])).toBe('x\r\n"she said ""hi"""');
    expect(toCsv(["x"], [["line1\nline2"]])).toBe('x\r\n"line1\nline2"');
  });
  it("renders null/undefined as empty", () => {
    expect(toCsv(["a", "b"], [[null, undefined]])).toBe("a,b\r\n,");
  });
});

describe("toCsvWithBom", () => {
  it("prefixes the UTF-8 BOM", () => {
    const out = toCsvWithBom(["a"], [["é"]]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out.slice(1)).toBe("a\r\né");
  });
});

describe("pipelineCsvFilename", () => {
  it("formats the date", () => {
    expect(pipelineCsvFilename(new Date("2026-07-20T09:00:00Z"))).toBe("ansyra-pipeline-20260720.csv");
  });
});

it("neutralises spreadsheet formulas in text while retaining numeric losses", () => {
  expect(toCsv(["Name", "Value"], [["=1+1", -5], ["  @SUM(A1)", 2], ["+cmd", 3]])).toContain("'=1+1,-5");
  expect(toCsv(["Name"], [["\t=1+1"]])).toContain("'\t=1+1");
});
