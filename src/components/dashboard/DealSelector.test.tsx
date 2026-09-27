// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DealSelector } from "./DealSelector";
afterEach(cleanup);
// Browser layout APIs used by cmdk/Radix, absent from jsdom.
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
Element.prototype.scrollIntoView = vi.fn();
it("searches 1,500 deals, bounds the list and selects using the keyboard", async () => {
  const user = userEvent.setup(), change = vi.fn();
  render(<DealSelector deals={Array.from({ length: 1500 }, (_, i) => ({ id: i + 1, name: `Project ${i + 1}` }))} value={1} onChange={change} />);
  await user.click(screen.getByRole("button", { name: "Deal: Project 1" }));
  expect(screen.getAllByRole("option")).toHaveLength(50);
  await user.type(screen.getByRole("combobox"), "Project 1499");
  expect(screen.getAllByRole("option")).toHaveLength(1);
  await user.keyboard("{ArrowDown}{Enter}");
  expect(change).toHaveBeenCalledWith(1499);
  expect(screen.queryByRole("option")).toBeNull();
});
it("shows empty and stale selections without inventing a selected deal", () => {
  const { rerender } = render(<DealSelector deals={[]} value={55} onChange={vi.fn()} />);
  expect(screen.getByRole("button").textContent).toContain("No deals available");
  rerender(<DealSelector deals={[{ id: 1, name: "Anvil" }]} value={55} onChange={vi.fn()} />);
  expect(screen.getByRole("button").textContent).toContain("Select deal");
});
