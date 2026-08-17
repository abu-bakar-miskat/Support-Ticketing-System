CREATE TABLE "Label" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#94a3b8',
  "departmentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Label_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Label_name_departmentId_key" ON "Label"("name", "departmentId");
CREATE INDEX "Label_departmentId_idx" ON "Label"("departmentId");
ALTER TABLE "Label" ADD CONSTRAINT "Label_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
