-- AlterTable
ALTER TABLE "Intake" ADD COLUMN     "portalIdempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Intake_apiKeyId_portalIdempotencyKey_key" ON "Intake"("apiKeyId", "portalIdempotencyKey");
