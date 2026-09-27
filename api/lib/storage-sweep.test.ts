import { beforeEach, describe, expect, it, vi } from "vitest";

const listObjects = vi.hoisted(() => vi.fn());
const removeObjects = vi.hoisted(() => vi.fn());
const knownPaths = vi.hoisted(() => ({ rows: [] as { path: string }[] }));

vi.mock("./storage", () => ({ listObjects, removeObjects }));
vi.mock("../queries/connection", () => ({
  getDb: () => ({ select: () => ({ from: async () => knownPaths.rows }) }),
}));

import { sweepOrphanedDocuments } from "./storage-sweep";

const NOW = Date.parse("2026-09-10T12:00:00Z");
const old = new Date(NOW - 3 * 60 * 60 * 1000).toISOString();
const young = new Date(NOW - 10 * 60 * 1000).toISOString();
const folder = (name: string) => ({ name, id: null, createdAt: null });
const object = (name: string, createdAt: string) => ({ name, id: `id-${name}`, createdAt });

beforeEach(() => {
  listObjects.mockReset();
  removeObjects.mockReset();
  removeObjects.mockResolvedValue(undefined);
  knownPaths.rows = [];
});

describe("sweepOrphanedDocuments", () => {
  it("removes unreferenced objects older than the grace period and nothing else", async () => {
    knownPaths.rows = [{ path: "7/kept.pdf" }];
    listObjects.mockImplementation(async (_bucket: string, prefix: string) => {
      if (prefix === "") return [folder("7")];
      return [object("kept.pdf", old), object("orphan.pdf", old), object("fresh.pdf", young)];
    });
    const result = await sweepOrphanedDocuments({ now: NOW, cursor: 0 });
    expect(removeObjects).toHaveBeenCalledWith("deal-documents", ["7/orphan.pdf"]);
    expect(result).toEqual({ folders: 1, scanned: 1, removed: 1, partial: false });
  });

  it("inspects a rotating window so every folder is reached over successive runs", async () => {
    listObjects.mockImplementation(async (_bucket: string, prefix: string) => {
      if (prefix === "") return [folder("1"), folder("2"), folder("3")];
      return [];
    });
    // Window of one folder; the daily rotation advances by the window size.
    const day = (n: number) => (Math.floor(NOW / 86_400_000) + n) * 86_400_000;
    const scannedOn = async (n: number) => {
      listObjects.mockClear();
      await sweepOrphanedDocuments({ now: day(n), maxFolders: 1 });
      return listObjects.mock.calls.filter((c) => c[1] !== "").map((c) => c[1]);
    };
    const first = await scannedOn(0);
    const second = await scannedOn(1);
    const third = await scannedOn(2);
    expect(new Set([...first, ...second, ...third])).toEqual(new Set(["1", "2", "3"]));
    expect(first).not.toEqual(second);
  });

  it("stops inside its time budget and says so", async () => {
    listObjects.mockImplementation(async (_bucket: string, prefix: string) => {
      if (prefix === "") return [folder("1"), folder("2")];
      return [object("orphan.pdf", old)];
    });
    const result = await sweepOrphanedDocuments({ now: NOW, cursor: 0, budgetMs: 0 });
    expect(result.partial).toBe(true);
    expect(result.scanned).toBe(0);
    expect(removeObjects).not.toHaveBeenCalled();
  });

  it("does nothing on an empty bucket", async () => {
    listObjects.mockResolvedValue([]);
    expect(await sweepOrphanedDocuments({ now: NOW })).toEqual({ folders: 0, scanned: 0, removed: 0, partial: false });
  });
});
