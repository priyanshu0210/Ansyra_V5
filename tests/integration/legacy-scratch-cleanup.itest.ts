import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq, inArray } from "drizzle-orm";
import { expect, it } from "vitest";
import { getDb } from "../../api/queries/connection";
import { adminClient } from "../../api/lib/supabase-clients";
import { deals, documents, activityLog } from "../../db/schema";
import { ORG_A_ID, ORG_B_ID, USER_PARTNER, USER_RIVAL } from "../fixtures/thornevale/ids";

it("previews without deleting, then backs up and removes only historical fixture scratch rows", async () => {
  const db = getDb();
  const storage = adminClient().storage.from("deal-documents");
  const [scratch, legitimate, foreign, recent] = await db.insert(deals).values([
    { name: `[test 202608211230] Cleanup ${randomUUID()} #1`, targetCompany: "Synthetic", organizationId: ORG_A_ID, createdBy: USER_PARTNER.id, createdAt: new Date("2026-08-21") },
    { name: "Legitimate retained cleanup control", targetCompany: "Synthetic", organizationId: ORG_A_ID, createdBy: USER_PARTNER.id, createdAt: new Date("2026-08-21") },
    { name: "[test 202608211230] Foreign control #1", targetCompany: "Synthetic", organizationId: ORG_B_ID, createdBy: USER_RIVAL.id, createdAt: new Date("2026-08-21") },
    { name: "[test 202609211230] Recent control #1", targetCompany: "Synthetic", organizationId: ORG_A_ID, createdBy: USER_PARTNER.id, createdAt: new Date("2026-09-21") },
  ]).returning();
  const path = `${scratch.id}/${randomUUID()}.txt`;
  const body = "Disposable backup verification";
  const run = (...args: string[]) => execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "--tsconfig", "tsconfig.server.json", "scripts/cleanup-legacy-scratch.ts", ...args], {
    encoding: "utf8", timeout: 30_000,
    env: { ...process.env, DOTENV_CONFIG_PATH: resolve(".env.test.local") },
  });
  try {
    const uploaded = await storage.upload(path, Buffer.from(body), { contentType: "text/plain" });
    expect(uploaded.error).toBeNull();
    const [document] = await db.insert(documents).values({ dealId: scratch.id, name: "backup.txt", path, mime: "text/plain", sizeBytes: body.length, organizationId: ORG_A_ID, createdBy: USER_PARTNER.id }).returning();
    await db.insert(activityLog).values({ type: "deal", action: "Disposable cleanup test", dealId: scratch.id, userId: USER_PARTNER.id, organizationId: ORG_A_ID });
    expect(run()).toContain('"deals":1');
    expect(await db.select().from(deals).where(eq(deals.id, scratch.id))).toHaveLength(1);
    expect(() => run("--apply", "--expected-count=2")).toThrow();
    expect(await db.select().from(deals).where(eq(deals.id, scratch.id))).toHaveLength(1);
    const output = run("--apply", "--expected-count=1");
    const directory = output.match(/Backup: (.+)/)?.[1];
    expect(directory).toBeTruthy();
    expect(readFileSync(resolve(directory!, `document-${document.id}.bin`), "utf8")).toBe(body);
    const backup = JSON.parse(readFileSync(resolve(directory!, "rows.json"), "utf8"));
    expect(backup.deals.map((d: { id: number }) => d.id)).toEqual([scratch.id]);
    expect(await db.select().from(deals).where(eq(deals.id, scratch.id))).toHaveLength(0);
    expect(await db.select().from(activityLog).where(eq(activityLog.dealId, scratch.id))).toHaveLength(0);
    expect(await db.select().from(deals).where(inArray(deals.id, [legitimate.id, foreign.id, recent.id]))).toHaveLength(3);
    expect((await storage.download(path)).error).not.toBeNull();
  } finally {
    await db.delete(activityLog).where(eq(activityLog.dealId, scratch.id));
    await db.delete(deals).where(inArray(deals.id, [scratch.id, legitimate.id, foreign.id, recent.id]));
    await storage.remove([path]);
  }
});
