-- CreateEnum
CREATE TYPE "IntakeFieldType" AS ENUM ('text', 'richtext', 'select', 'file');

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "rotaPointer" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "workloadThreshold" INTEGER NOT NULL DEFAULT 5;

-- CreateTable
CREATE TABLE "IntakeFormConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "intakeTeamId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeFormConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeFormField" (
    "id" TEXT NOT NULL,
    "formConfigId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "IntakeFieldType" NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "IntakeFormField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Intake" (
    "id" TEXT NOT NULL,
    "formConfigId" TEXT NOT NULL,
    "submitterName" TEXT NOT NULL,
    "submitterEmail" TEXT NOT NULL,
    "priority" "TicketPriority" NOT NULL,
    "responses" JSONB NOT NULL,
    "ticketId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Intake_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntakeFormField_formConfigId_order_idx" ON "IntakeFormField"("formConfigId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Intake_ticketId_key" ON "Intake"("ticketId");

-- AddForeignKey
ALTER TABLE "IntakeFormConfig" ADD CONSTRAINT "IntakeFormConfig_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeFormConfig" ADD CONSTRAINT "IntakeFormConfig_intakeTeamId_fkey" FOREIGN KEY ("intakeTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeFormField" ADD CONSTRAINT "IntakeFormField_formConfigId_fkey" FOREIGN KEY ("formConfigId") REFERENCES "IntakeFormConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intake" ADD CONSTRAINT "Intake_formConfigId_fkey" FOREIGN KEY ("formConfigId") REFERENCES "IntakeFormConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intake" ADD CONSTRAINT "Intake_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
