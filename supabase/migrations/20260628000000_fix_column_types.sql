/*
# Fix column type mismatches

1. deals."createdBy"   integer → uuid  (users.id is uuid from Supabase Auth)
2. targets."createdBy" integer → uuid
3. chat_messages."userId" integer → uuid
4. leads.company  NOT NULL → nullable  (contact-type leads have no company)

All columns were NULL when this first ran (never populated), so the USING NULL
cast was safe then. It is NOT safe to run twice: on a column that is already
uuid, `TYPE uuid USING NULL::uuid` succeeds and sets EVERY value to NULL —
every deal and target would lose its owner. Each alteration is therefore
guarded on the column's current type, so re-applying this file (for example
after a migration-history repair) is a no-op rather than a data loss.
*/

-- ============================================================
-- deals."createdBy"  integer → uuid
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'deals'
       AND column_name = 'createdBy' AND data_type <> 'uuid'
  ) THEN
    ALTER TABLE deals
      ALTER COLUMN "createdBy" DROP DEFAULT,
      ALTER COLUMN "createdBy" TYPE uuid USING NULL::uuid;
  END IF;
END $$;

-- ============================================================
-- targets."createdBy"  integer → uuid
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'targets'
       AND column_name = 'createdBy' AND data_type <> 'uuid'
  ) THEN
    ALTER TABLE targets
      ALTER COLUMN "createdBy" DROP DEFAULT,
      ALTER COLUMN "createdBy" TYPE uuid USING NULL::uuid;
  END IF;
END $$;

-- ============================================================
-- chat_messages."userId"  integer → uuid
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'chat_messages'
       AND column_name = 'userId' AND data_type <> 'uuid'
  ) THEN
    ALTER TABLE chat_messages
      ALTER COLUMN "userId" DROP DEFAULT,
      ALTER COLUMN "userId" TYPE uuid USING NULL::uuid;
  END IF;
END $$;

-- ============================================================
-- leads.company  NOT NULL → nullable
-- ============================================================
ALTER TABLE leads
  ALTER COLUMN company DROP NOT NULL;
