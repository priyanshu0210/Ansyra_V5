import { describe, it, expect } from "vitest";
import { splitValue, joinValue } from "./form-options";

describe("splitValue / joinValue", () => {
  it("splits a symbol-prefixed value", () => {
    expect(splitValue("$85M")).toEqual({ symbol: "$", amount: "85M" });
    expect(splitValue("€1.2B")).toEqual({ symbol: "€", amount: "1.2B" });
    expect(splitValue("₹500M")).toEqual({ symbol: "₹", amount: "500M" });
  });

  it("defaults to $ for null/unknown prefixes", () => {
    expect(splitValue(null)).toEqual({ symbol: "$", amount: "" });
    expect(splitValue("85M")).toEqual({ symbol: "$", amount: "85M" });
  });

  it("joins symbol + amount, and trims", () => {
    expect(joinValue("$", "85M")).toBe("$85M");
    expect(joinValue("€", " 60M ")).toBe("€60M");
    expect(joinValue("$", "   ")).toBe("");
  });

  it("round-trips", () => {
    const { symbol, amount } = splitValue("£38M");
    expect(joinValue(symbol, amount)).toBe("£38M");
  });
});
