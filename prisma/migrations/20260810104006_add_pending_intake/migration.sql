-- CreateTable
CREATE TABLE "PendingIntake" (
    "id" TEXT NOT NULL,
    "formConfigId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "ticketId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingIntake_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingIntake_token_key" ON "PendingIntake"("token");

-- CreateIndex
CREATE INDEX "PendingIntake_formConfigId_idx" ON "PendingIntake"("formConfigId");

-- AddForeignKey
ALTER TABLE "PendingIntake" ADD CONSTRAINT "PendingIntake_formConfigId_fkey" FOREIGN KEY ("formConfigId") REFERENCES "IntakeFormConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

