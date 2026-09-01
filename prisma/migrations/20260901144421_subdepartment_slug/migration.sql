-- SubDepartment (table "Team") URL slug, unique per department (different
-- departments may reuse sub-department names). Additive & nullable.
ALTER TABLE "Team" ADD COLUMN "slug" TEXT;
CREATE UNIQUE INDEX "Team_departmentId_slug_key" ON "Team"("departmentId", "slug");
