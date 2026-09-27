// ─────────────────────────────────────────────────────────────────────────────
// What gets persisted from a document analysis.
//
// Every analysis kind is validated against the shape the prompt asked for
// BEFORE it is stored. A document is adversary-controlled input (a seller's
// data room), so the model's answer is data to be checked, never trusted:
// red-flag quotations must exist verbatim in the extracted text, and the other
// three kinds must be exactly the fields the panel renders, with nothing else.
// Anything that does not fit is refused with a fixed message and nothing is
// saved — the model's text never travels into an error.
// ─────────────────────────────────────────────────────────────────────────────
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createHash } from "node:crypto";
import type { ExtractedText } from "./extract";

const Line = z.string().trim().max(2_000);
const Lines = z.array(Line).max(50);
const NullableLine = Line.nullable().optional();

// A sparse but honest answer (headline only) is kept rather than refused: the
// headline stands in for the missing prose. An answer with neither is nothing.
const SummaryShape = z
  .object({
    headline: Line.optional(),
    keyPoints: Lines.optional(),
    summary: z.string().trim().max(20_000).optional(),
  })
  .refine((v) => Boolean(v.summary) || Boolean(v.headline), { message: "summary or headline required" })
  .transform((v) => ({ ...v, summary: v.summary || v.headline! }));

const KeyTermsShape = z.object({
  parties: Lines.optional(),
  effectiveDate: NullableLine,
  consideration: NullableLine,
  conditions: Lines.optional(),
  indemnities: NullableLine,
  changeOfControl: NullableLine,
  nonCompete: NullableLine,
});

const DdChecklistShape = z.object({
  items: z
    .array(
      z.object({
        item: z.string().trim().min(1).max(300),
        status: z
          .string()
          .trim()
          .transform((s) => s.toLowerCase())
          .pipe(z.enum(["present", "missing", "unclear"])),
        note: Line.optional(),
      }),
    )
    .max(60),
});

const RedFlagsShape = z.object({
  flags: z.array(
    z.object({
      clause: Line,
      quote: z.string().min(1).max(300),
      severity: z.enum(["High", "Medium", "Low"]),
      concern: Line,
    }),
  ).max(40),
});

function incomplete(): never {
  throw new TRPCError({ code: "BAD_GATEWAY", message: "The document review was incomplete. No analysis was saved; please try again." });
}

export function verifyDocumentResult(kind: string, data: Record<string, unknown>, extracted: ExtractedText, bytes: Buffer, documentId: number) {
  let result: Record<string, unknown>;
  if (kind === "red_flags") {
    const parsed = RedFlagsShape.safeParse(data);
    if (!parsed.success) incomplete();
    result = {
      flags: parsed.data.flags.map((flag) => {
        const offset = extracted.text.indexOf(flag.quote);
        if (offset < 0) throw new TRPCError({ code: "BAD_GATEWAY", message: "A generated quotation could not be verified in the document. No analysis was saved. Please retry or review the original file." });
        const page = extracted.pages?.find((p) => p.text.includes(flag.quote))?.page;
        return { ...flag, source: { documentId, page: page ?? null, characterStart: offset, characterEnd: offset + flag.quote.length, verified: true } };
      }),
    };
  } else if (kind === "key_terms") {
    const parsed = KeyTermsShape.safeParse(data);
    if (!parsed.success) incomplete();
    result = parsed.data;
  } else if (kind === "dd_checklist") {
    const parsed = DdChecklistShape.safeParse(data);
    if (!parsed.success) incomplete();
    result = parsed.data;
  } else {
    const parsed = SummaryShape.safeParse(data);
    if (!parsed.success) incomplete();
    result = parsed.data;
  }
  result._evidence = { documentId, sha256: createHash("sha256").update(bytes).digest("hex"), extractedCharacters: extracted.text.length, truncated: extracted.truncated, coverage: extracted.truncated ? "Partial extracted text" : "Extracted text only; images and scans not assessed", checkedAt: new Date().toISOString() };
  return result;
}
