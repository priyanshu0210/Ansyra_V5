// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { setDisplayCurrency } from "./currency";
import { SynergyEngine } from "./SynergyEngine";
import { TrpcStub, createHarness } from "@/test/trpc-harness";
import { SEED_SYNERGY_CATEGORIES } from "../../../tests/fixtures/thornevale/analytics";

// Selector keyboard behavior is tested separately; this isolates query/edit state.
vi.mock("./DealSelector", () => ({ DealSelector: ({ deals, onChange }: { deals: { id: number; name: string }[]; onChange: (id: number) => void }) => <div>{deals.map((d) => <button key={d.id} onClick={() => onChange(d.id)}>{d.name}</button>)}</div> }));
beforeEach(() => setDisplayCurrency("USD"));
afterEach(() => { cleanup(); localStorage.clear(); });
const deals = [{ id: 426, name: "Kestrel", stage: "integration", targetCompany: "Kestrel" }, { id: 429, name: "Nordhaven", stage: "integration", targetCompany: "Nordhaven" }];
const legacy = { summary: "Cost workstreams delivered.", recommendation: "Review revenue assumptions.", realisationPct: 63.9 };
const plan = { dealId: 426, categories: SEED_SYNERGY_CATEGORIES, analysis: legacy };
function mount(data: unknown) {
  const stub = new TrpcStub().on("ai.getSynergyPlan", { ok: data });
  const { Wrapper } = createHarness(stub);
  return { ...render(<SynergyEngine deals={deals} />, { wrapper: Wrapper }), stub };
}
it("reproduces the original cause and renders the actual legacy fixture after loading", async () => {
  expect(() => (legacy as unknown as { analyses: unknown[] }).analyses.map(String)).toThrow("Cannot read properties of undefined (reading 'map')");
  mount(plan);
  expect(screen.getByText("Loading synergy plan")).toBeTruthy();
  expect(screen.queryByText(/45M planned/)).toBeNull();
  await screen.findByText(legacy.summary);
  expect(screen.getAllByText("Procurement consolidation").length).toBeGreaterThan(0);
  await waitFor(() => expect(screen.queryByText("Loading synergy plan")).toBeNull());
  expect(screen.queryByText(/Something went wrong/)).toBeNull();
});
it.each([null, { ...plan, categories: [] }, { ...plan, categories: [null] }, { ...plan, categories: [{ category: "Cost", actual: 1, planned: null }] }])("keeps incomplete plans local: %j", async (data) => {
  mount(data); await screen.findByText("Synergy data is unavailable for this deal.");
});
it("renders valid numeric strings and controls a malformed saved analysis", async () => {
  mount({ ...plan, categories: [{ category: "Revenue", planned: "12", actual: "8" }], analysis: { analyses: null } });
  await screen.findByText(/12M planned/);
  expect(screen.getByText(/Saved synergy analysis is unavailable/)).toBeTruthy();
});
it("renders complete modern findings after loading", async () => {
  mount({ ...plan, analysis: { portfolioSummary: "On plan overall", analyses: [{ category: "Cost", variancePct: 0, verdict: "On Track", explanation: "Savings confirmed", action: "Continue monthly review" }] } });
  await screen.findByText("Savings confirmed");
  expect(screen.getByText("On plan overall")).toBeTruthy();
});
it("does not carry edited numbers to an empty plan on switch or a stale selection", async () => {
  const view = mount(plan); await screen.findByText(legacy.summary);
  fireEvent.change(screen.getByLabelText("Procurement consolidation 2024-Q3 planned"), { target: { value: "999" } });
  view.stub.on("ai.getSynergyPlan", { ok: null });
  fireEvent.click(screen.getByText("Nordhaven"));
  await screen.findByText("Synergy data is unavailable for this deal.");
  expect(screen.queryByDisplayValue("999")).toBeNull();
  view.rerender(<SynergyEngine deals={[deals[0]]} />);
  await screen.findByText(legacy.summary);
});
it("shows no integration deals and handles API failures without an empty success", async () => {
  const stub = new TrpcStub().on("ai.getSynergyPlan", { error: { code: "FORBIDDEN", httpStatus: 403 } });
  const { Wrapper } = createHarness(stub);
  const view = render(<SynergyEngine deals={[]} />, { wrapper: Wrapper });
  expect(screen.getByText("Nothing in integration yet.")).toBeTruthy();
  view.rerender(<SynergyEngine deals={deals} />);
  await screen.findByText("The synergy plan could not load.");
});

it("derives phased totals from quarter edits and marks the saved explanation stale", async () => {
  mount(plan); await screen.findByText(legacy.summary);
  expect((screen.getAllByLabelText("Planned")[0] as HTMLInputElement).readOnly).toBe(true);
  fireEvent.change(screen.getByLabelText("Procurement consolidation 2024-Q3 planned"), { target: { value: "0.5" } });
  expect((screen.getAllByLabelText("Planned")[0] as HTMLInputElement).value).toBe("8.5");
  expect(screen.queryByText(legacy.summary)).toBeNull();
  expect(screen.getByText(/Numbers have changed/)).toBeTruthy();
});
