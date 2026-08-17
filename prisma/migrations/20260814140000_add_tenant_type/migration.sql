-- Tenant category label (institution | agency | company | ...). Additive, defaulted.
ALTER TABLE "Tenant" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'company';
