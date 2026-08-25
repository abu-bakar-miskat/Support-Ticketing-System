-- Per-support-form ticket-assignment method override (null = inherit the
-- sub-department's method, then the parent department, then ROUND_ROBIN).
ALTER TABLE "IntakeFormConfig" ADD COLUMN "assignmentMethod" "AssignmentMethod";
