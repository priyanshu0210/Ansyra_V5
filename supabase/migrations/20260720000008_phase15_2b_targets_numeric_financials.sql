-- Phase 15.2 (deferred item) — numeric target financials.
-- Mirrors the Phase 11.1 deals.value_amount backfill EXACTLY (and
-- contracts/value.ts::parseDealValue) so ebitda/revenue can aggregate. The
-- display strings stay as the source of truth; amounts are NULL when unparseable.

ALTER TABLE public.targets ADD COLUMN IF NOT EXISTS ebitda_amount numeric;
ALTER TABLE public.targets ADD COLUMN IF NOT EXISTS revenue_amount numeric;
ALTER TABLE public.targets ADD COLUMN IF NOT EXISTS fin_currency varchar(3);

UPDATE public.targets SET ebitda_amount = (
    CASE substring(ebitda FROM '^[€£₹¥$]?\s*[\d.,]+\s*([MBKmbk]?)')
      WHEN 'B' THEN 1000 WHEN 'b' THEN 1000
      WHEN 'K' THEN 0.001 WHEN 'k' THEN 0.001
      ELSE 1
    END
  ) * NULLIF(replace(substring(ebitda FROM '^[€£₹¥$]?\s*([\d.,]+)'), ',', ''), '')::numeric
WHERE ebitda IS NOT NULL;

UPDATE public.targets SET revenue_amount = (
    CASE substring(revenue FROM '^[€£₹¥$]?\s*[\d.,]+\s*([MBKmbk]?)')
      WHEN 'B' THEN 1000 WHEN 'b' THEN 1000
      WHEN 'K' THEN 0.001 WHEN 'k' THEN 0.001
      ELSE 1
    END
  ) * NULLIF(replace(substring(revenue FROM '^[€£₹¥$]?\s*([\d.,]+)'), ',', ''), '')::numeric
WHERE revenue IS NOT NULL;

UPDATE public.targets SET fin_currency = COALESCE(
    CASE substring(revenue FROM '^([€£₹¥$])')
      WHEN '€' THEN 'EUR' WHEN '£' THEN 'GBP' WHEN '₹' THEN 'INR' WHEN '¥' THEN 'JPY' WHEN '$' THEN 'USD' END,
    CASE substring(ebitda FROM '^([€£₹¥$])')
      WHEN '€' THEN 'EUR' WHEN '£' THEN 'GBP' WHEN '₹' THEN 'INR' WHEN '¥' THEN 'JPY' WHEN '$' THEN 'USD' END,
    CASE WHEN revenue_amount IS NOT NULL OR ebitda_amount IS NOT NULL THEN 'USD' END
  )
WHERE ebitda IS NOT NULL OR revenue IS NOT NULL;
