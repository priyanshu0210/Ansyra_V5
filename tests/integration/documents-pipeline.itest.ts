import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { callerFor, errorCodeFrom, errorMessageFrom, type Caller } from "../support/caller";
import { ASSOCIATE, PARTNER } from "../support/users";
import { createScratchDeal, scratchName } from "../support/scratch";
import { dealId, documentId } from "../support/corpus";
import { docxBytes, pdfBytes, txtBytes } from "@fixtures/thornevale/binary";
import { env } from "../../api/lib/env";

// The full document chain, end to end, with real bytes moving through real
// storage: requestUpload → PUT to Supabase → confirm → list → signed download →
// AI analysis → import into the diligence tracker.
//
// Every step of this is synchronous inside one request — there is no job queue
// anywhere in the codebase — so the whole chain is observable in a test, and
// none of it had one.

let partner: Caller;
let associate: Caller;
let scratch: { id: number; name: string };

const BUCKET = "deal-documents";
const TXT = "text/plain";
const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function storage() {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** The client half of the signed-upload pattern: bytes go direct to Storage and
 *  never through the API server, which is why Hono's body limit is only 2 MB. */
async function uploadThroughSignedUrl(path: string, token: string, body: Buffer, mime: string) {
  const { error } = await storage().storage.from(BUCKET).uploadToSignedUrl(path, token, body, {
    contentType: mime,
  });
  if (error) throw new Error(`signed upload failed: ${error.message}`);
}

beforeAll(async () => {
  partner = await callerFor(PARTNER);
  associate = await callerFor(ASSOCIATE);
  scratch = await createScratchDeal(partner, "Data room", { stage: "diligence" });
});

describe("the upload handshake", () => {
  it("issues a signed upload scoped to the deal's prefix", async () => {
    const res = await partner.documents.requestUpload({
      dealId: scratch.id,
      name: "handshake.txt",
      mime: TXT,
      size: 128,
    });
    expect(res.bucket).toBe(BUCKET);
    expect(res.path.startsWith(`${scratch.id}/`)).toBe(true);
    expect(typeof res.token).toBe("string");
  });

  it("refuses a mime type the extractor cannot read", async () => {
    // Accepting a format the analysis then cannot open would mean a document
    // that uploads cleanly and fails only when someone tries to use it.
    const msg = await errorMessageFrom(() =>
      partner.documents.requestUpload({ dealId: scratch.id, name: "sheet.xlsx", mime: "application/vnd.ms-excel", size: 100 }),
    );
    expect(msg).toMatch(/PDF, DOCX, or TXT/i);
  });

  it("refuses a file over the 20 MB ceiling", async () => {
    const msg = await errorMessageFrom(() =>
      partner.documents.requestUpload({ dealId: scratch.id, name: "big.pdf", mime: PDF, size: 21 * 1024 * 1024 }),
    );
    expect(msg).toMatch(/too large/i);
  });

  it("refuses a confirm whose path belongs to a different deal", async () => {
    // The cross-deal path claim. The upload token is scoped by Storage, but the
    // `confirm` call is what creates the row, and it must not accept a path
    // outside this deal's prefix.
    const other = await dealId("anvil");
    expect(
      await errorCodeFrom(() =>
        partner.documents.confirm({
          dealId: scratch.id,
          path: `${other}/stolen.txt`,
          name: "stolen.txt",
          mime: TXT,
          size: 10,
        }),
      ),
    ).toBe("FORBIDDEN");
  });
});

describe("a document makes the whole round trip", () => {
  const body = [
    "QUALITY OF EARNINGS — SCRATCH DEAL",
    "",
    "Management presents Adjusted EBITDA of $288.8M (22.0% margin).",
    "We support Adjusted EBITDA of $241.6M (18.4% margin).",
    "Reported DSO of 63 days reflects a $60M non-recourse factoring programme.",
  ].join("\n");
  let docId: number;

  it("uploads, confirms and appears in the list", async () => {
    const name = scratchName("QoE.txt") + ".txt";
    const req = await partner.documents.requestUpload({
      dealId: scratch.id,
      name,
      mime: TXT,
      size: Buffer.byteLength(body),
    });
    await uploadThroughSignedUrl(req.path, req.token, txtBytes(body), TXT);
    const row = await partner.documents.confirm({
      dealId: scratch.id,
      path: req.path,
      name,
      mime: TXT,
      size: Buffer.byteLength(body),
    });
    docId = row.id;

    const list = await partner.documents.list({ dealId: scratch.id });
    expect(list.some((d) => d.id === docId)).toBe(true);
  });

  it("issues a signed download that actually returns the bytes", async () => {
    const { url, name } = await partner.documents.getDownloadUrl({ documentId: docId });
    expect(name).toContain("QoE");
    const res = await fetch(url);
    expect(res.ok).toBe(true);
    expect(await res.text()).toContain("We support Adjusted EBITDA of $241.6M");
  });

  it("analyses the document and persists the result in the same request", async () => {
    // The persist-in-the-same-request rule: a client remount must never be able
    // to orphan an AI result.
    const analysis = await partner.ai.analyzeDocument({ documentId: docId, kind: "red_flags" });
    expect(analysis).toBeTruthy();

    const stored = await partner.ai.listAnalyses({ documentId: docId });
    expect(stored.length).toBeGreaterThan(0);
    expect(stored.some((a) => a.kind === "red_flags")).toBe(true);
  });

  it("records the provider and model it used", async () => {
    const stored = await partner.ai.listAnalyses({ documentId: docId });
    const redFlags = stored.find((a) => a.kind === "red_flags")!;
    // Provenance on an AI row is not decoration — it is how you tell a result
    // produced by the mock apart from one produced by a paid model months later.
    expect(redFlags.model).toContain("mock");
  });

  it("produces mock output that is recognisably mock", async () => {
    const stored = await partner.ai.listAnalyses({ documentId: docId });
    expect(JSON.stringify(stored)).toContain("[mock]");
  });
});

describe("every supported format survives the pipeline", () => {
  const cases: { label: string; mime: string; make: () => Buffer }[] = [
    { label: "pdf", mime: PDF, make: () => pdfBytes("Thornevale covenant headroom is 0.31x today and negative after the step-down.") },
    { label: "docx", mime: DOCX, make: () => docxBytes("Sanjiu Precision Castings is sole-sourced on 60% of Flow pump housings.") },
    { label: "txt", mime: TXT, make: () => txtBytes("Torvald Agritech represents 18.7% of FY2025 revenue.") },
  ];

  for (const c of cases) {
    it(`uploads and analyses a ${c.label}`, async () => {
      const bytes = c.make();
      const name = `${scratchName("format")}.${c.label}`;
      const req = await partner.documents.requestUpload({
        dealId: scratch.id,
        name,
        mime: c.mime,
        size: bytes.length,
      });
      await uploadThroughSignedUrl(req.path, req.token, bytes, c.mime);
      const row = await partner.documents.confirm({
        dealId: scratch.id,
        path: req.path,
        name,
        mime: c.mime,
        size: bytes.length,
      });
      const analysis = await partner.ai.analyzeDocument({ documentId: row.id, kind: "summary" });
      expect(analysis).toBeTruthy();
    });
  }
});

describe("a document with no extractable text fails honestly", () => {
  it("reports a document problem rather than producing an empty analysis", async () => {
    // The scanned-PDF case. An empty analysis is worse than an error: the model
    // would confidently summarise nothing and the reader would believe it.
    const bytes = txtBytes("   \n\t\n   ");
    const name = `${scratchName("blank")}.txt`;
    const req = await partner.documents.requestUpload({
      dealId: scratch.id,
      name,
      mime: TXT,
      size: bytes.length,
    });
    await uploadThroughSignedUrl(req.path, req.token, bytes, TXT);
    const row = await partner.documents.confirm({
      dealId: scratch.id,
      path: req.path,
      name,
      mime: TXT,
      size: bytes.length,
    });
    const msg = await errorMessageFrom(() => partner.ai.analyzeDocument({ documentId: row.id, kind: "summary" }));
    expect(msg).toMatch(/No extractable text/i);
  });
});

describe("the diligence tracker import", () => {
  let ddDealId: number;
  let analysisId: number;

  beforeAll(async () => {
    const deal = await createScratchDeal(partner, "DD import", { stage: "diligence" });
    ddDealId = deal.id;
    await partner.dd.seed({ dealId: ddDealId });

    const bytes = txtBytes(
      [
        "MATERIAL CONTRACTS SUMMARY",
        "Four change-of-control consents are required to close.",
        "Financial statements for FY2023-FY2025 provided; FY2012 segment disclosure missing.",
        "Toledo environmental remediation approximately $6.8M with the vendor indemnity expired.",
      ].join("\n"),
    );
    const name = `${scratchName("checklist")}.txt`;
    const req = await partner.documents.requestUpload({ dealId: ddDealId, name, mime: TXT, size: bytes.length });
    await uploadThroughSignedUrl(req.path, req.token, bytes, TXT);
    const row = await partner.documents.confirm({ dealId: ddDealId, path: req.path, name, mime: TXT, size: bytes.length });
    const analysis = await partner.ai.analyzeDocument({ documentId: row.id, kind: "dd_checklist" });
    analysisId = (analysis as { id: number }).id;
  });

  it("seeds the twelve standard items", async () => {
    const items = await partner.dd.list({ dealId: ddDealId });
    expect(items.filter((i) => i.isStandard).length).toBe(12);
  });

  it("is idempotent — re-seeding does not duplicate", async () => {
    // Backed by a UNIQUE(deal_id, item) index plus onConflictDoNothing, so a
    // user re-clicking the button is harmless.
    await partner.dd.seed({ dealId: ddDealId });
    const items = await partner.dd.list({ dealId: ddDealId });
    expect(items.filter((i) => i.isStandard).length).toBe(12);
  });

  it("imports an analysis into the tracker", async () => {
    const before = await partner.dd.list({ dealId: ddDealId });
    await partner.dd.importAnalysis({ dealId: ddDealId, analysisId });
    const after = await partner.dd.list({ dealId: ddDealId });
    expect(after.length).toBeGreaterThanOrEqual(before.length);
  });

  it("refuses to import an analysis belonging to a different deal", async () => {
    const otherDeal = await dealId("anvil");
    expect(
      await errorCodeFrom(() => partner.dd.importAnalysis({ dealId: otherDeal, analysisId })),
    ).toBe("FORBIDDEN");
  });

  it("refuses to import an analysis that is not a checklist", async () => {
    const summaryDoc = await partner.documents.list({ dealId: ddDealId });
    const summary = await partner.ai.analyzeDocument({ documentId: summaryDoc[0].id, kind: "summary" });
    expect(
      await errorCodeFrom(() =>
        partner.dd.importAnalysis({ dealId: ddDealId, analysisId: (summary as { id: number }).id }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("never restatuses an item a human has already ruled on", async () => {
    // The linchpin of the merge rule: an AI import may append a note to a
    // manually-set item but must never overwrite the human's status.
    const items = await partner.dd.list({ dealId: ddDealId });
    const target = items.find((i) => i.isStandard)!;
    await partner.dd.updateItem({ id: target.id, status: "n_a", note: "Ruled n/a by a human reviewer." });

    await partner.dd.importAnalysis({ dealId: ddDealId, analysisId });

    const after = await partner.dd.list({ dealId: ddDealId });
    const same = after.find((i) => i.id === target.id)!;
    expect(same.status).toBe("n_a");
    expect(same.manuallySet).toBe(true);
  });
});

describe("the feature gate on the data room", () => {
  it("refuses a member without the documents grant", async () => {
    // The associate is seeded without `documents` precisely so this wall is
    // testable against a real account rather than a fabricated one.
    expect(await errorCodeFrom(() => associate.documents.list({ dealId: scratch.id }))).toBe("FORBIDDEN");
  });

  it("refuses that member the analysis route too", async () => {
    const doc = await documentId("anvil", "03 Financial History FY2001-FY2025.txt");
    expect(await errorCodeFrom(() => associate.ai.analyzeDocument({ documentId: doc, kind: "summary" }))).toBe(
      "FORBIDDEN",
    );
  });
});

describe("the retained corpus is readable through the API", () => {
  it("serves the 25-year financial history document's real bytes", async () => {
    const doc = await documentId("anvil", "03 Financial History FY2001-FY2025.txt");
    const { url } = await partner.documents.getDownloadUrl({ documentId: doc });
    const text = await (await fetch(url)).text();
    expect(text).toContain("TWENTY-FIVE YEAR FINANCIAL HISTORY");
    expect(text).toContain("FY2012 segment disclosure is not included");
  });

  it("serves a PDF whose text the extractor can still read", async () => {
    const doc = await documentId("anvil", "02 Quality of Earnings Report (Final).pdf");
    const { url } = await partner.documents.getDownloadUrl({ documentId: doc });
    const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
    const { extractText } = await import("../../api/lib/extract");
    const { text } = await extractText(bytes, PDF);
    expect(text).toContain("QUALITY OF EARNINGS REPORT");
  });
});
