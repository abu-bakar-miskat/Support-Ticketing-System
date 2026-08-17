-- CreateTable: DepartmentManager
-- Links a manager profile to the department(s) they manage.
CREATE TABLE IF NOT EXISTS "DepartmentManager" (
    "id"           TEXT         NOT NULL,
    "departmentId" TEXT         NOT NULL,
    "userId"       UUID         NOT NULL,
    "assignedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy"   UUID         NOT NULL,

    CONSTRAINT "DepartmentManager_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DepartmentAccess
-- Temporary cross-department access grants (optional expiry).
CREATE TABLE IF NOT EXISTS "DepartmentAccess" (
    "id"           TEXT         NOT NULL,
    "departmentId" TEXT         NOT NULL,
    "userId"       UUID         NOT NULL,
    "grantedBy"    UUID         NOT NULL,
    "grantedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"    TIMESTAMP(3),

    CONSTRAINT "DepartmentAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "DepartmentManager_departmentId_userId_key"
    ON "DepartmentManager"("departmentId", "userId");

CREATE INDEX IF NOT EXISTS "DepartmentManager_departmentId_idx"
    ON "DepartmentManager"("departmentId");

CREATE INDEX IF NOT EXISTS "DepartmentManager_userId_idx"
    ON "DepartmentManager"("userId");

CREATE INDEX IF NOT EXISTS "DepartmentAccess_departmentId_idx"
    ON "DepartmentAccess"("departmentId");

CREATE INDEX IF NOT EXISTS "DepartmentAccess_userId_idx"
    ON "DepartmentAccess"("userId");

-- AddForeignKey (skip if already present — idempotent via IF NOT EXISTS on constraint name)
DO $$ BEGIN
    ALTER TABLE "DepartmentManager"
        ADD CONSTRAINT "DepartmentManager_departmentId_fkey"
        FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "DepartmentManager"
        ADD CONSTRAINT "DepartmentManager_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "DepartmentManager"
        ADD CONSTRAINT "DepartmentManager_assignedBy_fkey"
        FOREIGN KEY ("assignedBy") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "DepartmentAccess"
        ADD CONSTRAINT "DepartmentAccess_departmentId_fkey"
        FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "DepartmentAccess"
        ADD CONSTRAINT "DepartmentAccess_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "DepartmentAccess"
        ADD CONSTRAINT "DepartmentAccess_grantedBy_fkey"
        FOREIGN KEY ("grantedBy") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
