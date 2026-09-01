-- Support form owner level: DEPARTMENT (department-wide) or SUB_DEPARTMENT
-- (owned by its intake sub-department). Additive; existing forms = DEPARTMENT.
ALTER TABLE "IntakeFormConfig" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'DEPARTMENT';
