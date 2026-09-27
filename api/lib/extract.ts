// ─────────────────────────────────────────────────────────────────────────────
// Server-side document text extraction for the Data Room (Phase 10).
// PDF via unpdf, DOCX via mammoth, TXT raw. OCR is out of scope — a scanned/
// encrypted PDF with no text layer yields an explicit "no extractable text"
// error rather than an empty analysis.
// ─────────────────────────────────────────────────────────────────────────────
import { TRPCError } from "@trpc/server";

// Long documents are truncated to keep prompts inside model context; the
// caller surfaces `truncated` so the analysis can say so.
const MAX_CHARS = 150_000;

export interface ExtractedText {
  text: string;
  truncated: boolean;
  pages?: { page: number; text: string }[];
}

export async function extractText(buffer: Buffer, mime: string): Promise<ExtractedText> {
  let text: string;
  let pages: { page: number; text: string }[] | undefined;

  if (mime === "application/pdf") {
    const { extractText: unpdfExtract, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const res = await unpdfExtract(pdf, { mergePages: false });
    pages = res.text.map((value, i) => ({ page: i + 1, text: value.replaceAll("\u0000", "").trim() }));
    text = pages.map((p) => p.text).join("\n\n");
  } else if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth = await import("mammoth");
    const res = await mammoth.extractRawText({ buffer });
    text = res.value;
  } else if (mime === "text/plain") {
    text = buffer.toString("utf-8");
  } else {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported document type." });
  }

  // replaceAll over a string literal rather than a regex: identical result,
  // and an escaped NUL in a pattern is exactly what no-control-regex flags.
  text = text.replaceAll("\u0000", "").trim();
  if (text.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "No extractable text in this document — scanned or image-only files aren't supported yet.",
    });
  }

  if (text.length > MAX_CHARS) {
    return { text: text.slice(0, MAX_CHARS), truncated: true, pages };
  }
  return { text, truncated: false, pages };
}

export const DOCUMENT_MIMES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
};
