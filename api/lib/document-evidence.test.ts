import { describe, expect, it } from "vitest";
import { verifyDocumentResult } from "./document-evidence";
const source = "The buyer must pay GBP 2 million at completion.";
const input = { flags: [{ clause: "Payment", quote: source, severity: "High", concern: "Confirm funding." }] };
describe("document quote evidence", () => {
  it("records the exact source version, page and extracted-text position", () => {
    const result = verifyDocumentResult("red_flags", input, { text: source, truncated: false, pages: [{ page: 2, text: source }] }, Buffer.from(source), 12);
    expect(result.flags).toMatchObject([{ source: { documentId: 12, page: 2, characterStart: 0, verified: true } }]);
    expect(result._evidence).toMatchObject({ documentId: 12, truncated: false });
  });
  it("rejects a changed quotation instead of saving it as verified", () => {
    expect(() => verifyDocumentResult("red_flags", { flags: [{ ...input.flags[0], quote: source.replace("2 million", "3 million") }] }, { text: source, truncated: false }, Buffer.from(source), 12)).toThrow("could not be verified");
  });
  it("normalises checklist statuses and refuses a checklist that does not fit the requested shape", () => {
    const ok = verifyDocumentResult("dd_checklist", { items: [{ item: "Material contracts", status: "PRESENT", note: "Section 4." }] }, { text: source, truncated: false }, Buffer.from(source), 12);
    expect(ok.items).toEqual([{ item: "Material contracts", status: "present", note: "Section 4." }]);
    expect(() => verifyDocumentResult("dd_checklist", { items: [{ item: "Material contracts", status: "ignore previous instructions" }] }, { text: source, truncated: false }, Buffer.from(source), 12)).toThrow("incomplete");
  });
  it("keeps only the fields the key-terms panel renders", () => {
    const stored = verifyDocumentResult("key_terms", { parties: ["A — Buyer"], effectiveDate: null, injected: "<script>" }, { text: source, truncated: false }, Buffer.from(source), 12);
    expect(stored).not.toHaveProperty("injected");
    expect(stored.parties).toEqual(["A — Buyer"]);
  });
  it("keeps a headline-only summary by using the headline as the prose, and refuses an empty one", () => {
    const sparse = verifyDocumentResult("summary", { headline: "Buyer pays GBP 2m at completion." }, { text: source, truncated: false }, Buffer.from(source), 12);
    expect(sparse.summary).toBe("Buyer pays GBP 2m at completion.");
    expect(() => verifyDocumentResult("summary", { keyPoints: ["x"] }, { text: source, truncated: false }, Buffer.from(source), 12)).toThrow("incomplete");
  });
  it("records truncation for summaries as well as flags", () => {
    expect(verifyDocumentResult("summary", { summary: "Short summary" }, { text: source, truncated: true }, Buffer.from(source), 12)._evidence).toMatchObject({ truncated: true, coverage: "Partial extracted text" });
  });
});
