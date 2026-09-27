// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { convertAmount, convertMoneyText, formatMoney, setDisplayCurrency, useCurrency } from "./currency";
import { CurrencySelector } from "./CurrencySelector";
import { MoneyInput } from "./MoneyInput";
afterEach(() => { cleanup(); localStorage.clear(); });
it("converts cross-currency amounts without changing scale, sign, zero or multiples", () => {
  expect(convertAmount(100, "USD", "INR")).toBeCloseTo(9596);
  expect(convertAmount(87.974, "EUR", "GBP")).toBeCloseTo(75.645);
  expect(formatMoney(2310, "USD", "INR")).toBe("₹221.67B");
  expect(formatMoney(-2, "USD", "EUR")).toBe("€-1.76M");
  expect(formatMoney(0, "USD", "INR")).toBe("₹0");
  expect(formatMoney(null, "USD", "INR")).toBe("—");
  expect(convertMoneyText("€312M", "GBP")).toBe("£268.28M");
  expect(convertMoneyText("8.0×", "INR")).toBe("8.0×");
  expect(convertMoneyText("Undisclosed", "INR")).toBe("Undisclosed");
  expect(formatMoney(5, "CAD", "INR")).toContain("no FX rate");
});
it("switches all subscribing panels together, persists preference, and aggregates mixed-currency totals", () => {
  function Panel() { const fx = useCurrency(); return <output>{fx.totals([["USD", 100], ["EUR", 87.974]])}</output>; }
  const view = render(<><CurrencySelector /><Panel /><Panel /></>);
  expect((screen.getByRole("combobox", { name: "Display currency" }) as HTMLSelectElement).value).toBe("INR");
  fireEvent.change(screen.getByRole("combobox", { name: "Display currency" }), { target: { value: "USD" } });
  expect(screen.getAllByText("$200M")).toHaveLength(2);
  fireEvent.change(screen.getByRole("combobox", { name: "Display currency" }), { target: { value: "INR" } });
  expect(screen.getAllByText("₹19.19B")).toHaveLength(2);
  view.unmount(); render(<Panel />);
  expect(screen.getByText("₹19.19B")).toBeTruthy();
});
it("edits in selected currency, saves the original units, and does not mutate on currency switching", () => {
  const saved = vi.fn();
  function Form() { const [value, setValue] = useState("1"); return <><CurrencySelector /><MoneyInput aria-label="Planned savings" value={value} onValueChange={v => { setValue(v); saved(v); }} /><output>{value}</output></>; }
  setDisplayCurrency("INR"); render(<Form />);
  expect((screen.getByLabelText("Planned savings") as HTMLInputElement).value).toBe("95.96");
  fireEvent.change(screen.getByLabelText("Planned savings"), { target: { value: "191.92" } });
  expect(saved).toHaveBeenLastCalledWith("2");
  fireEvent.change(screen.getByRole("combobox", { name: "Display currency" }), { target: { value: "GBP" } });
  expect((screen.getByLabelText("Planned savings") as HTMLInputElement).value).toBe("1.5129");
  expect(saved).toHaveBeenCalledTimes(1);
});
