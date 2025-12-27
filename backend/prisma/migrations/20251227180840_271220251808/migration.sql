DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Location'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.table_constraints
      WHERE constraint_schema = 'public'
        AND table_name = 'Location'
        AND constraint_name = 'Location_parentLocationId_fkey'
    ) THEN
      ALTER TABLE "Location" DROP CONSTRAINT "Location_parentLocationId_fkey";
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Note'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.table_constraints
      WHERE constraint_schema = 'public'
        AND table_name = 'Note'
        AND constraint_name = 'Note_entityId_fkey'
    ) THEN
      ALTER TABLE "Note" DROP CONSTRAINT "Note_entityId_fkey";
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Note'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.table_constraints
      WHERE constraint_schema = 'public'
        AND table_name = 'Note'
        AND constraint_name = 'Note_locationId_fkey'
    ) THEN
      ALTER TABLE "Note" DROP CONSTRAINT "Note_locationId_fkey";
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Location'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.table_constraints
      WHERE constraint_schema = 'public'
        AND table_name = 'Location'
        AND constraint_name = 'Location_parentLocationId_fkey'
    ) THEN
      ALTER TABLE "Location"
        ADD CONSTRAINT "Location_parentLocationId_fkey"
        FOREIGN KEY ("parentLocationId") REFERENCES "Location"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Note'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.table_constraints
      WHERE constraint_schema = 'public'
        AND table_name = 'Note'
        AND constraint_name = 'Note_entityId_fkey'
    ) THEN
      ALTER TABLE "Note"
        ADD CONSTRAINT "Note_entityId_fkey"
        FOREIGN KEY ("entityId") REFERENCES "Entity"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Location'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'Note'
    ) THEN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
          AND table_name = 'Note'
          AND constraint_name = 'Note_locationId_fkey'
      ) THEN
        ALTER TABLE "Note"
          ADD CONSTRAINT "Note_locationId_fkey"
          FOREIGN KEY ("locationId") REFERENCES "Location"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END IF;
  END IF;
END $$;
