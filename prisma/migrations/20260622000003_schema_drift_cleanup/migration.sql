-- Remove stale Role enum values (developer, qa, support, viewer) that were
-- dropped via db push but never recorded in a migration.
-- PostgreSQL requires recreating the type to remove values.

-- Step 1: rename old enum
ALTER TYPE "Role" RENAME TO "Role_old";

-- Step 2: create correct enum matching the Prisma schema
CREATE TYPE "Role" AS ENUM ('admin', 'manager', 'lead', 'staff');

-- Step 3: migrate columns — any stale values are cast to 'staff'
ALTER TABLE "Profile"
  ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "Profile"
  ALTER COLUMN "role" TYPE "Role"
  USING CASE "role"::text
    WHEN 'admin'   THEN 'admin'
    WHEN 'manager' THEN 'manager'
    WHEN 'lead'    THEN 'lead'
    ELSE 'staff'
  END::"Role";
ALTER TABLE "Profile"
  ALTER COLUMN "role" SET DEFAULT 'staff';

ALTER TABLE "TeamMembership"
  ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "TeamMembership"
  ALTER COLUMN "role" TYPE "Role"
  USING CASE "role"::text
    WHEN 'admin'   THEN 'admin'
    WHEN 'manager' THEN 'manager'
    WHEN 'lead'    THEN 'lead'
    ELSE 'staff'
  END::"Role";
ALTER TABLE "TeamMembership"
  ALTER COLUMN "role" SET DEFAULT 'staff';

-- Step 4: drop old enum
DROP TYPE "Role_old";

-- Add unique constraint on DepartmentAccess(departmentId, userId) if missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'DepartmentAccess_departmentId_userId_key'
  ) THEN
    ALTER TABLE "DepartmentAccess"
      ADD CONSTRAINT "DepartmentAccess_departmentId_userId_key"
      UNIQUE ("departmentId", "userId");
  END IF;
END;
$$;
