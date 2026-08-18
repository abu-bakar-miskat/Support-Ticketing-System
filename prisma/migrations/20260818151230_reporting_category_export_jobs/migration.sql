-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('Bug', 'FeatureRequest', 'Question', 'TechnicalIssue', 'AccountAccess', 'Billing', 'Other');

-- CreateEnum
CREATE TYPE "ReportExportFormat" AS ENUM ('CSV', 'XLSX', 'PDF');

-- CreateEnum
CREATE TYPE "ReportExportJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "category" "TicketCategory";

-- CreateTable
CREATE TABLE "ReportExportJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "reportType" TEXT NOT NULL,
    "format" "ReportExportFormat" NOT NULL,
    "params" JSONB NOT NULL,
    "status" "ReportExportJobStatus" NOT NULL DEFAULT 'PENDING',
    "resultUrl" TEXT,
    "rowCount" INTEGER,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ReportExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportExportJob_tenantId_idx" ON "ReportExportJob"("tenantId");

-- CreateIndex
CREATE INDEX "ReportExportJob_status_idx" ON "ReportExportJob"("status");

-- CreateIndex
CREATE INDEX "ReportExportJob_createdById_idx" ON "ReportExportJob"("createdById");

-- CreateIndex
CREATE INDEX "Ticket_category_idx" ON "Ticket"("category");

-- AddForeignKey
ALTER TABLE "ReportExportJob" ADD CONSTRAINT "ReportExportJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

