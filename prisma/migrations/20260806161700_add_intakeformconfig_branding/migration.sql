-- Add per-form public-page branding (logo, colors, intro/confirmation text).
-- Additive, nullable column; safe to apply while the app is live.
ALTER TABLE "IntakeFormConfig" ADD COLUMN IF NOT EXISTS "branding" JSONB;
