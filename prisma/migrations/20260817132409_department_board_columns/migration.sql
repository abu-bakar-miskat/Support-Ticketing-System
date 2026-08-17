-- Slice 04 — Department board + status-typed columns.
-- ADDITIVE ONLY: creates the StatusType enum, the BoardColumn table, and a
-- nullable Ticket.boardColumnId. Nothing is dropped or altered destructively, so
-- deploying the client before/after this runs is safe. Column seeding + the
-- ticket→column backfill are a SEPARATE data step (see scripts/backfill-board-columns.ts).
--
-- REVIEW NOTE: before applying to the shared DB, verify this matches the live
-- schema with:
--   npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
-- and confirm it contains ONLY the statements below (no pre-existing drift).

-- CreateEnum
CREATE TYPE "StatusType" AS ENUM ('OPEN', 'PAUSED', 'ESCALATED', 'RESOLVED');

-- CreateTable
CREATE TABLE "BoardColumn" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#94a3b8',
    "statusType" "StatusType" NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardColumn_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "boardColumnId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "BoardColumn_departmentId_label_key" ON "BoardColumn"("departmentId", "label");

-- CreateIndex
CREATE INDEX "BoardColumn_departmentId_order_idx" ON "BoardColumn"("departmentId", "order");

-- CreateIndex
CREATE INDEX "BoardColumn_tenantId_idx" ON "BoardColumn"("tenantId");

-- CreateIndex
CREATE INDEX "Ticket_boardColumnId_idx" ON "Ticket"("boardColumnId");

-- AddForeignKey
ALTER TABLE "BoardColumn" ADD CONSTRAINT "BoardColumn_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardColumn" ADD CONSTRAINT "BoardColumn_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_boardColumnId_fkey" FOREIGN KEY ("boardColumnId") REFERENCES "BoardColumn"("id") ON DELETE SET NULL ON UPDATE CASCADE;
