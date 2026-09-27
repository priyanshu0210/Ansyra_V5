// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReviewHistory } from "./ReviewHistory";
import { groupReviews } from "@/lib/review-history";

afterEach(cleanup);
const original = { id: 1, createdAt: "2026-08-20", dealId: 421, target: "Thornevale", sector: "Industrials", acquirer: "Buyer", result: { reviewKind: "questions", summary: "Investigate retention", questions: ["Who will stay?"], suppliedContext: "Management interview" } };
const repeat = { ...original, id: 2, createdAt: "2026-08-22", result: { reviewKind: "questions", suppliedContext: "Management interview", questions: ["Who will stay?"], summary: "Investigate retention" } };

it("collapses repeated saved content despite JSON key order, retaining the newest result and every history id", () => {
  expect(groupReviews([original, repeat]).map((group) => group.map((r) => r.id))).toEqual([[2, 1]]);
});

it("does not conflate different deals, parties, evidence or findings sharing a summary", () => {
  const rows = [original,
    { ...original, id: 2, dealId: 422 },
    { ...original, id: 3, acquirer: "Other buyer" },
    { ...original, id: 4, result: { ...original.result, suppliedContext: "Employee survey" } },
    { ...original, id: 5, result: { ...original.result, questions: ["What incentives exist?"] } },
  ];
  expect(groupReviews(rows)).toHaveLength(5);
});

it("shows a repeated summary once and lets a user remove a specific earlier copy", () => {
  const remove = vi.fn();
  render(<ReviewHistory reviews={[original, repeat]} heading={(r) => r.target} onDelete={remove} />);
  expect(screen.getAllByText("Investigate retention")).toHaveLength(1);
  fireEvent.click(screen.getByText("1 earlier identical analysis"));
  fireEvent.click(screen.getByRole("button", { name: /Remove analysis from/ }));
  expect(remove).toHaveBeenCalledWith(1);
});

it("groups the repeated legacy analyses shown in the screenshots across dates without deleting records", () => {
  const mock = { ...original, result: { summary: "[mock] Low-to-moderate antitrust exposure.", challengeProbability: 25 }, geography: "Germany" };
  const rows = [20, 22, 26].map((day, i) => ({ ...mock, id: i + 10, createdAt: `2026-08-${day}` }));
  const remove = vi.fn();
  render(<ReviewHistory reviews={rows} heading={() => "Anfeng Motion Technologies · Germany"} onDelete={remove} />);
  expect(screen.getAllByText("Anfeng Motion Technologies · Germany")).toHaveLength(1);
  expect(screen.getByText("2 earlier identical analyses")).toBeTruthy();
  expect(remove).not.toHaveBeenCalled();
  expect(groupReviews(rows)[0].map(r => r.id)).toEqual([12, 11, 10]);
});
