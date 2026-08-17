-- Per-department overrides for the Classic Form default static fields
-- (label/placeholder for name, email, title, issue type). Additive only.
ALTER TABLE "Department" ADD COLUMN "intakeDefaultFields" JSONB;
