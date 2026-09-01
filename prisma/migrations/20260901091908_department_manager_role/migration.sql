-- Department-scoped Admin tier (role-hierarchy.md): distinguish a department
-- Admin from an operational Manager on DepartmentManager. Additive; existing
-- rows default to operational Manager power.
ALTER TABLE "DepartmentManager" ADD COLUMN "role" "Role" NOT NULL DEFAULT 'manager';
