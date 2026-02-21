-- Baseline migration to match DB state.
-- The database already has Fill.filledAt; we mark this migration as applied.

ALTER TABLE "Fill" ADD COLUMN "filledAt" TIMESTAMP(3);