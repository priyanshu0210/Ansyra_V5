// One-time remediation for the historical hosted fixture contamination.
// Default is a read-only preview. Product queries never filter deal names.
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb, closeDb } from "../api/queries/connection";
import { adminClient } from "../api/lib/supabase-clients";
import { deals, documents, activityLog } from "../db/schema";
import { ORG_A_ID, USER_PARTNER } from "../tests/fixtures/thornevale/ids";

const predicate = and(
  eq(deals.organizationId, ORG_A_ID), eq(deals.createdBy, USER_PARTNER.id),
  lt(deals.createdAt, new Date("2026-09-01T00:00:00Z")),
  sql`${deals.name} ~ ${"^\\[test [0-9]{12}\\] .+ #[0-9]+$"}`,
);
const apply = process.argv.includes("--apply");
const expected = Number(process.argv.find((v) => v.startsWith("--expected-count="))?.split("=")[1]);

async function main() {
  const db = getDb();
  const rows = await db.select().from(deals).where(predicate);
  const ids = rows.map((row) => row.id);
  const idArray = `{${ids.join(",")}}`;
  if (!ids.length) { console.log("No historical scratch deals matched. No changes made."); return; }
  const docs = await db.select().from(documents).where(inArray(documents.dealId, ids));
  const logs = await db.select().from(activityLog).where(inArray(activityLog.dealId, ids));
  console.log(JSON.stringify({ mode: apply ? "apply" : "preview", deals: ids.length, documents: docs.length, activities: logs.length }));
  if (!apply) return;
  if (!Number.isInteger(expected) || expected !== ids.length) throw new Error("Supply the exact reviewed --expected-count before applying.");
  // A storage object must belong only to the reviewed scratch deals.
  for (const doc of docs) {
    if (!doc.path.startsWith(`${doc.dealId}/`) || doc.path.includes("..")) throw new Error("Unexpected document path; review required.");
  }
  if (docs.length) {
    const refs = await db.select().from(documents).where(inArray(documents.path, docs.map((d) => d.path)));
    if (refs.some((d) => !ids.includes(d.dealId))) throw new Error("A storage object is referenced outside the reviewed scope.");
  }
  const directory = resolve(`scratch-backup-${Date.now()}.local`);
  mkdirSync(directory, { mode: 0o700 });
  const backup: Record<string, unknown> = { deals: rows };
  // All deal-linked public tables, including retained activity and audit rows.
  // Metadata identifiers come from Postgres, are quoted, and never from user input.
  const linked = await db.execute<{ table_name: string; column_name: string }>(sql`
    select table_name,column_name from information_schema.columns
    where table_schema='public' and column_name in ('dealId','deal_id')
  `);
  for (const { table_name, column_name } of linked.rows) {
    const saved = await db.execute(sql`select * from ${sql.identifier("public")}.${sql.identifier(table_name)} where ${sql.identifier(column_name)} = any(${idArray}::int[])`);
    backup[table_name] = saved.rows;
  }
  if (docs.length) backup.document_analyses = (await db.execute(sql`select * from public.document_analyses where document_id = any(${`{${docs.map((d) => d.id).join(",")}}`}::int[])`)).rows;
  writeFileSync(resolve(directory, "rows.json"), JSON.stringify(backup), { mode: 0o600 });
  const storage = adminClient().storage.from("deal-documents");
  for (const doc of docs) {
    const { data, error } = await storage.download(doc.path);
    if (error || !data) throw new Error(`Document ${doc.id} could not be backed up; nothing has been deleted.`);
    writeFileSync(resolve(directory, `document-${doc.id}.bin`), Buffer.from(await data.arrayBuffer()), { mode: 0o600 });
  }
  await db.transaction(async (tx) => {
    const current = await tx.select({ id: deals.id }).from(deals).where(predicate).for("update");
    if (current.length !== ids.length || current.some((d) => !ids.includes(d.id))) throw new Error("Scope changed since preview; nothing deleted.");
    await tx.delete(activityLog).where(inArray(activityLog.id, logs.map((l) => l.id)));
    await tx.delete(deals).where(and(predicate, inArray(deals.id, ids)));
  });
  for (let i = 0; i < docs.length; i += 100) {
    const { error } = await storage.remove(docs.slice(i, i + 100).map((d) => d.path));
    if (error) throw new Error(`Database cleanup complete, but storage cleanup needs retry. Backup: ${directory}`);
  }
  console.log(`Removed ${ids.length} historical scratch deals and their linked records. Backup: ${directory}`);
}
main().finally(closeDb).catch(() => { console.error("Cleanup failed; inspect the reviewed scope and backup before retrying. No credentials were logged."); process.exitCode = 1; });
