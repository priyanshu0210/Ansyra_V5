import { isIssuedUploadPath } from "./lib/upload-path";
// ─────────────────────────────────────────────────────────────────────────────
// Data Room (Phase 10) — deal documents in the private deal-documents bucket.
// Every route is featureQuery('documents') AND re-checks deal access via
// assertDealAccess — a raw documentId is never trusted on its own. Uploads use
// the signed-URL pattern (bytes go direct to Storage, never through this API);
// downloads are short-lived signed GETs issued only after the access check.
// ─────────────────────────────────────────────────────────────────────────────
import { z } from "zod";
import crypto from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, featureQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { documents } from "@db/schema";
import { assertDealAccess } from "./deals-router";
import { assertStoredObject, createUpload, signedDownloadUrl, removeObject } from "./lib/storage";
import { DOCUMENT_MIMES } from "./lib/extract";
import { logActivity } from "./lib/activity";

const BUCKET = "deal-documents";
const MAX_BYTES = 20 * 1024 * 1024;

const documentsQuery = featureQuery("documents");

// Load a document row and verify the caller can access its deal. Exported for
// the AI router (analyzeDocument re-uses the same wall).
export async function assertDocumentAccess(
  documentId: number,
  userId: string,
  orgId: string | null,
) {
  const [doc] = await getDb().select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found." });
  await assertDealAccess(doc.dealId, userId, orgId);
  return doc;
}

export const documentsRouter = createRouter({
  requestUpload: documentsQuery
    .input(
      z.object({
        dealId: z.number(),
        name: z.string().min(1).max(255),
        mime: z.string(),
        size: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertDealAccess(input.dealId, ctx.user.id, ctx.user.organizationId ?? null);
      const ext = DOCUMENT_MIMES[input.mime];
      if (!ext) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only PDF, DOCX, or TXT files are allowed." });
      }
      if (input.size > MAX_BYTES) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "File too large — max 20 MB." });
      }
      const path = `${input.dealId}/${crypto.randomUUID()}.${ext}`;
      const { token, uploadUrl } = await createUpload(BUCKET, path);
      return { bucket: BUCKET, path, token, uploadUrl };
    }),

  confirm: documentsQuery
    .input(
      z.object({
        dealId: z.number(),
        path: z.string().min(1),
        name: z.string().min(1).max(255),
        mime: z.string(),
        size: z.number().int().positive().max(MAX_BYTES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const deal = await assertDealAccess(input.dealId, ctx.user.id, ctx.user.organizationId ?? null);
      // The path must belong to this deal's prefix (no cross-deal claims).
      if (!isIssuedUploadPath(input.path, String(input.dealId)) || !DOCUMENT_MIMES[input.mime]) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Invalid upload reference." });
      }
      await assertStoredObject(BUCKET, input.path, {
        allowedMimeTypes: Object.keys(DOCUMENT_MIMES),
        maxBytes: MAX_BYTES,
        expectedMime: input.mime,
        expectedSize: input.size,
      });
      const [row] = await getDb()
        .insert(documents)
        .values({
          dealId: input.dealId,
          name: input.name,
          path: input.path,
          mime: input.mime,
          sizeBytes: input.size,
          createdBy: ctx.user.id,
          organizationId: ctx.user.organizationId ?? null,
        })
        .returning();
      logActivity(ctx.user, {
        type: "deal",
        action: "Document uploaded",
        detail: `${deal.name} · ${input.name}`,
        dealId: deal.id,
      });
      return row;
    }),

  list: documentsQuery
    .input(z.object({ dealId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertDealAccess(input.dealId, ctx.user.id, ctx.user.organizationId ?? null);
      return getDb()
        .select()
        .from(documents)
        .where(eq(documents.dealId, input.dealId))
        .orderBy(desc(documents.createdAt));
    }),

  getDownloadUrl: documentsQuery
    .input(z.object({ documentId: z.number() }))
    .query(async ({ ctx, input }) => {
      const doc = await assertDocumentAccess(input.documentId, ctx.user.id, ctx.user.organizationId ?? null);
      const url = await signedDownloadUrl(BUCKET, doc.path, 60);
      return { url, name: doc.name };
    }),

  delete: documentsQuery
    .input(z.object({ documentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const doc = await assertDocumentAccess(input.documentId, ctx.user.id, ctx.user.organizationId ?? null);
      // Row first (analyses cascade), then best-effort object removal.
      await getDb().delete(documents).where(eq(documents.id, doc.id));
      await removeObject(BUCKET, doc.path);
      logActivity(ctx.user, {
        type: "deal",
        action: "Document deleted",
        detail: doc.name,
        dealId: doc.dealId,
      });
      return { success: true };
    }),
});
