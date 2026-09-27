import { describe, it, expect } from "vitest";
import { parseDealValue } from "./value";

describe("parseDealValue", () => {
  it("parses plain USD millions", () => {
    expect(parseDealValue("$85M")).toEqual({ amount: 85, currency: "USD" });
  });

  it("maps every supported currency symbol", () => {
    expect(parseDealValue("€60M")?.currency).toBe("EUR");
    expect(parseDealValue("£38M")?.currency).toBe("GBP");
    expect(parseDealValue("₹500M")?.currency).toBe("INR");
    expect(parseDealValue("¥900M")?.currency).toBe("JPY");
  });

  it("expands B and K suffixes into millions", () => {
    expect(parseDealValue("$1.2B")).toEqual({ amount: 1200, currency: "USD" });
    expect(parseDealValue("$500K")).toEqual({ amount: 0.5, currency: "USD" });
    expect(parseDealValue("$2b")?.amount).toBe(2000);
  });

  it("handles thousands separators and whitespace", () => {
    expect(parseDealValue("$3,400M")?.amount).toBe(3400);
    expect(parseDealValue("  $ 45 M ")?.amount).toBe(45);
    expect(parseDealValue("$ 45M")?.amount).toBe(45);
  });

  it("defaults to USD when no symbol and M when no suffix", () => {
    expect(parseDealValue("120")).toEqual({ amount: 120, currency: "USD" });
  });

  it("returns null for unparseable input, never throws", () => {
    expect(parseDealValue("undisclosed")).toBeNull();
    expect(parseDealValue("TBD")).toBeNull();
    expect(parseDealValue("")).toBeNull();
    expect(parseDealValue(null)).toBeNull();
    expect(parseDealValue(undefined)).toBeNull();
    expect(parseDealValue("$-5M")).toBeNull();
  });
});
