// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PersonaDeck } from "./PersonaDeck";

afterEach(cleanup);

describe("audience choices", () => {
  it("keeps all choices available and associates the selected detail with its tab", () => {
    render(<PersonaDeck />);
    expect(screen.getAllByRole("tab")).toHaveLength(6);
    const advisor = screen.getByRole("tab", { name: "M&A Advisors" });
    fireEvent.click(advisor);
    expect(advisor.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(advisor.id);
    expect(screen.getByRole("tabpanel").textContent).toContain("challenge assumptions behind a proposed valuation");
    expect(screen.getAllByRole("tab").filter(tab => tab.tabIndex === 0)).toEqual([advisor]);
  });

  it("moves focus and selection together with arrows, Home and End", () => {
    render(<PersonaDeck />);
    const tabs = screen.getAllByRole("tab");
    fireEvent.keyDown(tabs[0], { key: "ArrowUp" });
    expect(document.activeElement).toBe(tabs[5]);
    expect(tabs[5].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tabs[5], { key: "Home" });
    expect(document.activeElement).toBe(tabs[0]);
    fireEvent.keyDown(tabs[0], { key: "End" });
    expect(document.activeElement).toBe(tabs[5]);
    fireEvent.keyDown(tabs[5], { key: "ArrowDown" });
    expect(document.activeElement).toBe(tabs[0]);
  });
});
