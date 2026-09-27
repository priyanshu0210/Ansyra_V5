import { z } from "zod";
import { hasDuplicateQuarters, QUARTER_RE } from "./synergy";

// JSON/decimal values may arrive as numeric strings. Missing values stay invalid:
// z.coerce.number would silently turn null and empty strings into zero.
const storedNumber = z.preprocess(
  (v) => typeof v === "string" && v.trim() !== "" ? Number(v) : v,
  z.number().finite().min(-1e12).max(1e12),
);
export const StoredSynergyCategories = z.array(z.object({
  category: z.string().trim().min(1),
  planned: storedNumber,
  actual: storedNumber,
  periods: z.array(z.object({
    quarter: z.string().trim().regex(QUARTER_RE),
    planned: storedNumber,
    actual: storedNumber,
  })).max(400).refine((p) => !hasDuplicateQuarters(p)).optional(),
})).min(1).max(200);

export const SynergyAnalysisSchema = z.object({
  portfolioSummary: z.string().min(1),
  analyses: z.array(z.object({
    category: z.string().min(1),
    variancePct: z.number().finite().nullable(),
    verdict: z.string().min(1),
    explanation: z.string(),
    action: z.string(),
  })),
});

// Explicit compatibility for the original hand-authored Thornevale corpus.
// Do not manufacture per-category AI findings that the original never contained.
export const LegacySynergyAnalysisSchema = z.object({
  summary: z.string().min(1),
  recommendation: z.string().min(1),
  realisationPct: storedNumber,
});
