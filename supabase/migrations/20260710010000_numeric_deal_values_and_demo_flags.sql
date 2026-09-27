-- Phase 11.1: numeric deal values (Analytics can finally sum correctly).
-- Phase 11.7: is_demo flags for the sample portfolio.
-- Applied on 2026-07-10 via MCP.

ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS value_amount numeric;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS value_currency varchar(3);
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.targets ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- Backfill: parse display strings like "$85M", "€1.2B", "₹500K".
-- Unparseable values stay NULL; the display string is always kept.
UPDATE public.deals SET
  value_amount = (
    CASE substring(value FROM '^[€£₹¥$]?\s*[\d.,]+\s*([MBKmbk]?)')
      WHEN 'B' THEN 1000 WHEN 'b' THEN 1000
      WHEN 'K' THEN 0.001 WHEN 'k' THEN 0.001
      ELSE 1
    END
  ) * NULLIF(replace(substring(value FROM '^[€£₹¥$]?\s*([\d.,]+)'), ',', ''), '')::numeric,
  value_currency = CASE substring(value FROM '^([€£₹¥$])')
    WHEN '€' THEN 'EUR' WHEN '£' THEN 'GBP' WHEN '₹' THEN 'INR' WHEN '¥' THEN 'JPY'
    WHEN '$' THEN 'USD' ELSE NULL
  END
WHERE value IS NOT NULL
  AND value ~ '^[€£₹¥$]?\s*[\d.,]+\s*[MBKmbk]?$';
