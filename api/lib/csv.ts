// ─────────────────────────────────────────────────────────────────────────────
// Minimal, dependency-free CSV builder (Phase 15.2 — deferred item). Finance
// users live in Excel; adoption needs data to flow OUT before they trust putting
// it in. RFC-4180 quoting + a UTF-8 BOM so Excel opens accented text correctly.
// Pure + unit-tested (api/lib/csv.test.ts) — no xlsx dependency.
// ─────────────────────────────────────────────────────────────────────────────

export type CsvCell = string | number | null | undefined;

/** Quote a cell iff it contains a comma, quote, or newline; escape quotes by doubling. */
function cell(v: CsvCell): string {
  if (v == null) return "";
  // A deal name is untrusted text. Excel must not interpret it as a formula;
  // real numeric cells, including negative numbers, remain numeric.
  const raw = String(v);
  const s = typeof v === "string" && (/^\s*[=+@-]/.test(raw) || /^[\t\r\n]/.test(raw)) ? "'" + raw : raw;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a CSV string (no BOM) from a header row + data rows. */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map(cell).join(",")];
  for (const r of rows) lines.push(r.map(cell).join(","));
  return lines.join("\r\n");
}

/** CSV with a UTF-8 BOM prefix — what Excel needs to read UTF-8 correctly. */
export function toCsvWithBom(headers: string[], rows: CsvCell[][]): string {
  return "﻿" + toCsv(headers, rows);
}

/** `ansyra-pipeline-YYYYMMDD.csv` from a Date. */
export function pipelineCsvFilename(now: Date = new Date()): string {
  const d = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `ansyra-pipeline-${d}.csv`;
}
