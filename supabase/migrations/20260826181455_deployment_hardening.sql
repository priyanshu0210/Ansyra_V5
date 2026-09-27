-- Deployment hardening: shared abuse controls and storage enforcement.

CREATE TABLE IF NOT EXISTS public.rate_limits (
  bucket varchar(40) NOT NULL,
  key_hash char(64) NOT NULL,
  hits integer NOT NULL CHECK (hits > 0),
  reset_at timestamptz NOT NULL,
  PRIMARY KEY (bucket, key_hash)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_at
  ON public.rate_limits (reset_at);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limits FROM anon, authenticated;

-- Signed upload tokens still pass through Storage, so bucket-level limits are
-- the non-bypassable boundary. Application confirm routes perform a second
-- metadata and magic-byte check before persisting references.
UPDATE storage.buckets
SET file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp']
WHERE id = 'avatars';

UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp']
WHERE id = 'bug-screenshots';

UPDATE storage.buckets
SET file_size_limit = 20971520,
    allowed_mime_types = ARRAY[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ]
WHERE id = 'deal-documents';
