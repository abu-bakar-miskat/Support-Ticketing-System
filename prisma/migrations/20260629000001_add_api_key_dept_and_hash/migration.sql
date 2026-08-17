-- AlterTable: add hashedKey and departmentId to ApiKey
ALTER TABLE "ApiKey" ADD COLUMN "hashedKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN "departmentId" TEXT;

-- Add unique constraint on hashedKey
CREATE UNIQUE INDEX "ApiKey_hashedKey_key" ON "ApiKey"("hashedKey");

-- Add index on departmentId
CREATE INDEX "ApiKey_departmentId_idx" ON "ApiKey"("departmentId");

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Remove the temporary default (new keys will always supply hashedKey)
ALTER TABLE "ApiKey" ALTER COLUMN "hashedKey" DROP DEFAULT;
