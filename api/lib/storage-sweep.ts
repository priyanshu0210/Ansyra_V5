// ─────────────────────────────────────────────────────────────────────────────
// Orphaned deal-document cleanup, run from the daily cron endpoint.
//
// Objects can outlive their `documents` row: the deal was deleted before
// deals.delete removed objects, a confirm never arrived after a signed upload,
// or a best-effort removal failed. None of that should leave a counterparty's
// document in the bucket for ever, so this reconciles the bucket against the
// table. Anything younger than GRACE_MS is left alone — an upload whose confirm
// is still in flight has no row yet and must not be swept.
//
// Two bounds keep it inside one cron request:
//   - a ROTATING WINDOW: every folder name is collected (one cheap call per
//     thousand), then a window of `maxFolders` is inspected starting from an
//     offset that advances by one window per day, wrapping around. Every folder
//     is therefore reached within ceil(folders / maxFolders) days, with no
//     state to persist;
//   - a WALL-CLOCK BUDGET: the sweep stops and reports `partial: true` rather
//     than outliving the caller's timeout. The next run picks a different
//     window anyway, so nothing is starved.
// ─────────────────────────────────────────────────────────────────────────────
import { getDb } from "../queries/connection";
import { documents } from "@db/schema";
import { listObjects, removeObjects } from "./storage";

const BUCKET = "deal-documents";
const GRACE_MS = 60 * 60 * 1000;
const PAGE = 1000;

export interface SweepResult {
  /** Folders (deals) present in the bucket. */
  folders: number;
  /** Folders inspected this run. */
  scanned: number;
  removed: number;
  /** True when the time budget stopped the run early. */
  partial: boolean;
}

export interface SweepOptions {
  maxFolders?: number;
  budgetMs?: number;
  /** Explicit start index into the folder list; defaults to the daily rotation. */
  cursor?: number;
  now?: number;
}

export async function sweepOrphanedDocuments(options: SweepOptions = {}): Promise<SweepResult> {
  const { maxFolders = 200, budgetMs = 45_000 } = options;
  const now = options.now ?? Date.now();
  const deadline = Date.now() + budgetMs;
  const overBudget = () => Date.now() >= deadline;
  const result: SweepResult = { folders: 0, scanned: 0, removed: 0, partial: false };

  // 1. Every folder name. Cheap: one list call per thousand entries.
  const folders: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await listObjects(BUCKET, "", PAGE, offset);
    folders.push(...page.filter((o) => o.id === null).map((o) => o.name));
    if (page.length < PAGE) break;
    if (overBudget()) {
      result.folders = folders.length;
      result.partial = true;
      return result;
    }
  }
  result.folders = folders.length;
  if (folders.length === 0) return result;

  // 2. The window for this run.
  const window = Math.min(maxFolders, folders.length);
  const start = options.cursor ?? (Math.floor(now / 86_400_000) * maxFolders) % folders.length;

  const known = new Set((await getDb().select({ path: documents.path }).from(documents)).map((r) => r.path));

  for (let i = 0; i < window; i++) {
    if (overBudget()) {
      result.partial = true;
      break;
    }
    const folder = folders[(start + i) % folders.length];
    const objects = await listObjects(BUCKET, folder, PAGE);
    result.scanned++;
    const stale = objects
      .filter((o) => o.id !== null)
      .map((o) => ({ path: `${folder}/${o.name}`, createdAt: Date.parse(o.createdAt ?? "") }))
      .filter((o) => !known.has(o.path) && Number.isFinite(o.createdAt) && o.createdAt < now - GRACE_MS)
      .map((o) => o.path);
    if (stale.length > 0) {
      await removeObjects(BUCKET, stale);
      result.removed += stale.length;
    }
  }
  return result;
}
