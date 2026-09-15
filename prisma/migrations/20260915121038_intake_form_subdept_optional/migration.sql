-- Make IntakeFormConfig.intakeSubDepartmentId (column "intakeTeamId") optional.
-- Department-level forms have no fixed sub-department; each issue (SlaPolicy)
-- routes its ticket via SlaPolicy.subDepartmentId. Additive, non-destructive:
-- no data is dropped and existing NOT NULL rows remain valid.
ALTER TABLE "IntakeFormConfig" ALTER COLUMN "intakeTeamId" DROP NOT NULL;
