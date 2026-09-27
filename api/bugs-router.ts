import { isIssuedUploadPath } from "./lib/upload-path";
// ─────────────────────────────────────────────────────────────────────────────
// Bug reports (Phase 8.5). Any logged-in user can submit (with up to 3
// screenshots uploaded direct-to-storage via signed URLs into the PRIVATE
// bug-screenshots bucket). Reading/triaging is admin-only (view_bug_reports;
// main_admin bypasses). Screenshots are never exposed as public URLs — the
// admin lightbox mints a short-lived signed GET URL per view.
// ─────────────────────────────────────────────────────────────────────────────
import { z } from "zod";
import crypto from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery, adminPermQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { bugReports } from "@db/schema";
import { assertImageUpload, assertStoredObject, imageExtFor, createUpload, signedDownloadUrl } from "./lib/storage";
import { logActivity } from "./lib/activity";
import { notifyAdmins } from "./lib/notify";

const BUCKET = "bug-screenshots";
const SeveritySchema = z.enum(["low", "medium", "high"]);
const StatusSchema = z.enum(["open", "triaged", "fixed", "closed"]);
const IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp"] as const;

export const bugsRouter = createRouter({
  // Any authenticated user may request an upload slot for a screenshot.
  requestScreenshotUpload: authedQuery
    .input(z.object({ mime: z.string(), size: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      assertImageUpload(input.mime, input.size, 5 * 1024 * 1024);
      const ext = imageExtFor(input.mime);
      // Path is namespaced under the caller's id so submit can verify ownership.
      const path = `${ctx.user.id}/${crypto.randomUUID()}.${ext}`;
      const { token, uploadUrl } = await createUpload(BUCKET, path);
      return { bucket: BUCKET, path, token, uploadUrl };
    }),

  submit: authedQuery
    .input(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(5000).optional(),
        page: z.string().max(120).optional(),
        severity: SeveritySchema,
        screenshots: z.array(z.string()).max(3).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Every screenshot path must live under this user's own prefix.
      for (const p of input.screenshots) {
        if (!isIssuedUploadPath(p, ctx.user.id)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Invalid screenshot reference." });
        }
        await assertStoredObject(BUCKET, p, {
          allowedMimeTypes: IMAGE_MIMES,
          maxBytes: 5 * 1024 * 1024,
        });
      }
      const [row] = await getDb()
        .insert(bugReports)
        .values({
          title: input.title,
          description: input.description ?? null,
          page: input.page ?? null,
          severity: input.severity,
          screenshots: input.screenshots,
          reporter: ctx.user.id,
          organizationId: ctx.user.organizationId ?? null,
        })
        .returning({ id: bugReports.id });
      // Logged as an admin-type row so it surfaces in the admin activity feed,
      // not the reporter's product feed.
      logActivity(ctx.user, { type: "admin", action: "Bug reported", detail: input.title });
      // Admins file bugs too — the admin surfaces are exactly where admin-only
      // bugs get found — so exclude the reporter or a sole main_admin emails
      // themselves their own report.
      notifyAdmins(
        "view_bug_reports",
        `Ansyra: bug report — ${input.title}`,
        `${ctx.user.name ?? ctx.user.email} reported a ${input.severity}-severity bug on "${input.page ?? "unknown page"}".\n\n${input.description ?? "(no description)"}\n\nTriage it in the dashboard under Bug Reports.`,
        ctx.user.id,
      );
      return { id: row.id };
    }),

  list: adminPermQuery("view_bug_reports")
    .input(z.object({ status: StatusSchema.optional() }).optional())
    .query(async ({ input }) => {
      const rows = await getDb().select().from(bugReports).orderBy(desc(bugReports.createdAt));
      return input?.status ? rows.filter((r) => r.status === input.status) : rows;
    }),

  get: adminPermQuery("view_bug_reports")
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [row] = await getDb().select().from(bugReports).where(eq(bugReports.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found." });
      return row;
    }),

  setStatus: adminPermQuery("view_bug_reports")
    .input(z.object({ id: z.number(), status: StatusSchema }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await getDb()
        .update(bugReports)
        .set({ status: input.status })
        .where(eq(bugReports.id, input.id))
        .returning({ id: bugReports.id });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found." });
      logActivity(ctx.user, { type: "admin", action: `Bug marked ${input.status}`, detail: `#${input.id}` });
      return { success: true };
    }),

  // Mint a short-lived signed GET URL for one screenshot, after verifying the
  // path actually belongs to the named report (no arbitrary path access).
  screenshotUrl: adminPermQuery("view_bug_reports")
    .input(z.object({ id: z.number(), path: z.string() }))
    .query(async ({ input }) => {
      const [row] = await getDb().select().from(bugReports).where(eq(bugReports.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found." });
      if (!row.screenshots.includes(input.path)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "That image isn't part of this report." });
      }
      const url = await signedDownloadUrl(BUCKET, input.path, 60);
      return { url };
    }),
});
