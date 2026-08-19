-- CreateEnum
CREATE TYPE "TenantTemplateStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "TemplateRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateFeature" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "status" "TenantTemplateStatus" NOT NULL DEFAULT 'ACTIVE',
    "activatedById" UUID NOT NULL,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "TenantTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "status" "TemplateRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "requestedById" UUID NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,

    CONSTRAINT "TemplateRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Template_slug_key" ON "Template"("slug");

-- CreateIndex
CREATE INDEX "TemplateFeature_templateId_idx" ON "TemplateFeature"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateFeature_templateId_key_key" ON "TemplateFeature"("templateId", "key");

-- CreateIndex
CREATE INDEX "TenantTemplate_tenantId_idx" ON "TenantTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "TenantTemplate_templateId_idx" ON "TenantTemplate"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantTemplate_tenantId_templateId_key" ON "TenantTemplate"("tenantId", "templateId");

-- CreateIndex
CREATE INDEX "TemplateRequest_tenantId_status_idx" ON "TemplateRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TemplateRequest_templateId_status_idx" ON "TemplateRequest"("templateId", "status");

-- AddForeignKey
ALTER TABLE "TemplateFeature" ADD CONSTRAINT "TemplateFeature_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantTemplate" ADD CONSTRAINT "TenantTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantTemplate" ADD CONSTRAINT "TenantTemplate_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateRequest" ADD CONSTRAINT "TemplateRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateRequest" ADD CONSTRAINT "TemplateRequest_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

