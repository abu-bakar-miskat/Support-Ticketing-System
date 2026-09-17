-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'domain_request_submitted';
ALTER TYPE "NotificationType" ADD VALUE 'domain_request_reviewed';

-- CreateTable
CREATE TABLE "EmailDomainRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "subDepartmentId" TEXT,
    "domain" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "requestedById" UUID NOT NULL,
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailDomainRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailDomainRequest_tenantId_idx" ON "EmailDomainRequest"("tenantId");

-- CreateIndex
CREATE INDEX "EmailDomainRequest_status_idx" ON "EmailDomainRequest"("status");

-- AddForeignKey
ALTER TABLE "EmailDomainRequest" ADD CONSTRAINT "EmailDomainRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
