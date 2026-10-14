-- Marketplace feature requests: a tenant admin asks for an optional feature
-- on a department, and a super admin approves it onto Department.featureKeys.

CREATE TYPE "FeatureRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "FeatureRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "status" "FeatureRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "requestedById" UUID NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,

    CONSTRAINT "FeatureRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeatureRequest_tenantId_status_idx" ON "FeatureRequest"("tenantId", "status");
CREATE INDEX "FeatureRequest_departmentId_status_idx" ON "FeatureRequest"("departmentId", "status");
CREATE INDEX "FeatureRequest_status_idx" ON "FeatureRequest"("status");

ALTER TABLE "FeatureRequest" ADD CONSTRAINT "FeatureRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeatureRequest" ADD CONSTRAINT "FeatureRequest_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'feature_request_submitted';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'feature_request_reviewed';
