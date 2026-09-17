-- CreateTable
CREATE TABLE "EmailDomain" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "resendId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailDomain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailDomain_name_key" ON "EmailDomain"("name");

-- CreateIndex
CREATE UNIQUE INDEX "EmailDomain_resendId_key" ON "EmailDomain"("resendId");

-- CreateIndex
CREATE INDEX "EmailDomain_tenantId_idx" ON "EmailDomain"("tenantId");

-- AddForeignKey
ALTER TABLE "EmailDomain" ADD CONSTRAINT "EmailDomain_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
