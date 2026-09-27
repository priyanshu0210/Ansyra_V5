import { describe, expect, it } from "vitest";
import { DOCUMENT_MIMES, extractText } from "./extract";
import { docxBytes, pdfBytes, txtBytes } from "@fixtures/thornevale/binary";

// extractText is the front door of the whole document-intelligence feature and
// had no test. It branches three ways on mime — unpdf, mammoth, raw utf-8 — and
// each branch fails differently, so these use REAL bytes in each format rather
// than asserting against a mocked parser. The writers come from the Thornevale
// fixture, which is also what the seeded data room uploads, so a regression in
// either one surfaces here.

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const NUL = "\u0000";
const SAMPLE = [
  "Thornevale Industrial Group — FY2025",
  "",
  "Adjusted EBITDA margin 22.0% against a quality-of-earnings view of 18.4%.",
  "Net leverage 3.94× on the credit agreement definition.",
  "Sites: Wrocław, Bielefeld, Suzhou, Curitiba.",
].join("\n");

describe("plain text", () => {
  it("returns the text unchanged", async () => {
    const { text, truncated } = await extractText(txtBytes(SAMPLE), "text/plain");
    expect(text).toContain("Adjusted EBITDA margin 22.0%");
    expect(truncated).toBe(false);
  });

  it("preserves non-ASCII characters", async () => {
    const { text } = await extractText(txtBytes(SAMPLE), "text/plain");
    expect(text).toContain("Wrocław");
    expect(text).toContain("3.94×");
  });

  it("strips NUL bytes, which Postgres rejects in a text column", async () => {
    // Not cosmetic: inserting a string containing U+0000 into a text or jsonb
    // column fails outright, so a document with an embedded NUL would take the
    // analysis down with a confusing database error rather than a document one.
    const withNul = Buffer.from(`before${NUL}after`, "utf8");
    const { text } = await extractText(withNul, "text/plain");
    expect(text).toBe("beforeafter");
    expect(text).not.toContain(NUL);
  });

  it("trims surrounding whitespace", async () => {
    const { text } = await extractText(Buffer.from("\n\n  hello  \n\n", "utf8"), "text/plain");
    expect(text).toBe("hello");
  });
});

describe("PDF", () => {
  it("extracts text from a real PDF", async () => {
    const { text } = await extractText(pdfBytes(SAMPLE), "application/pdf");
    expect(text).toContain("Adjusted EBITDA margin 22.0%");
    expect(text).toContain("Thornevale Industrial Group");
  });

  it("extracts every page, not just the first", async () => {
    // The generator paginates at 48 lines. A merge-pages regression would leave
    // a long CIM silently truncated to page one, which is exactly the kind of
    // bug that produces a confident and wrong analysis.
    const long = Array.from({ length: 300 }, (_, i) => `Line ${i + 1} of the document body.`).join("\n");
    const { text } = await extractText(pdfBytes(long), "application/pdf");
    expect(text).toContain("Line 1 ");
    expect(text).toContain("Line 300 ");
  });
});

describe("DOCX", () => {
  it("extracts text from a real DOCX", async () => {
    const { text } = await extractText(docxBytes(SAMPLE), DOCX);
    expect(text).toContain("quality-of-earnings view of 18.4%");
  });

  it("preserves non-ASCII, unlike the PDF path", async () => {
    // OOXML is UTF-8 so this survives; the PDF path folds to WinAnsi because it
    // uses a base font with no embedded programme. Both are pinned so nobody
    // "fixes" the DOCX path to match the PDF one.
    const { text } = await extractText(docxBytes(SAMPLE), DOCX);
    expect(text).toContain("Wrocław");
  });
});

describe("failure paths", () => {
  it("rejects an unsupported mime type", async () => {
    await expect(extractText(Buffer.from("x"), "image/png")).rejects.toThrow(/Unsupported document type/i);
  });

  it("rejects a document with no extractable text", async () => {
    // The scanned-PDF case. An empty analysis would be worse than an error: the
    // model would confidently summarise nothing.
    await expect(extractText(Buffer.from("   \n\t\n  ", "utf8"), "text/plain")).rejects.toThrow(
      /No extractable text/i,
    );
  });

  it("rejects a whitespace-only DOCX the same way", async () => {
    await expect(extractText(docxBytes("   \n  \n"), DOCX)).rejects.toThrow(/No extractable text/i);
  });

  it("rejects a document that is nothing but NUL bytes", async () => {
    // Stripping happens before the emptiness check, so this has to land on the
    // no-text error rather than sneaking through as a non-empty buffer.
    await expect(
      extractText(Buffer.from(NUL.repeat(64), "utf8"), "text/plain"),
    ).rejects.toThrow(/No extractable text/i);
  });
});

describe("truncation", () => {
  it("flags and cuts text above the 150k character limit", async () => {
    const huge = "a".repeat(160_000);
    const { text, truncated } = await extractText(Buffer.from(huge, "utf8"), "text/plain");
    expect(truncated).toBe(true);
    expect(text.length).toBe(150_000);
  });

  it("does not flag text exactly at the limit", async () => {
    const exact = "b".repeat(150_000);
    const { text, truncated } = await extractText(Buffer.from(exact, "utf8"), "text/plain");
    expect(truncated).toBe(false);
    expect(text.length).toBe(150_000);
  });
});

describe("DOCUMENT_MIMES", () => {
  it("accepts exactly PDF, DOCX and TXT", () => {
    // This map is the upload allow-list in documents-router. Widening it without
    // teaching extractText the new format would accept a file the analysis then
    // cannot read.
    expect(Object.keys(DOCUMENT_MIMES).sort()).toEqual(["application/pdf", DOCX, "text/plain"].sort());
  });

  it("maps each mime to the extension the storage path uses", () => {
    expect(DOCUMENT_MIMES["application/pdf"]).toBe("pdf");
    expect(DOCUMENT_MIMES[DOCX]).toBe("docx");
    expect(DOCUMENT_MIMES["text/plain"]).toBe("txt");
  });
});
