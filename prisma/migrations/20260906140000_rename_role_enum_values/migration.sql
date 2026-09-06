-- Rename legacy persisted Role values to the names used by the application.
-- PostgreSQL updates all values, defaults, and enum references atomically;
-- no users or role assignments are deleted or recreated.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = '"Role"'::regtype AND enumlabel = 'lead'
  ) THEN
    ALTER TYPE "Role" RENAME VALUE 'lead' TO 'sub_manager';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = '"Role"'::regtype AND enumlabel = 'staff'
  ) THEN
    ALTER TYPE "Role" RENAME VALUE 'staff' TO 'agent';
  END IF;
END $$;
