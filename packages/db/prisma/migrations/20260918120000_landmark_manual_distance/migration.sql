-- Landmarks are now edited in the admin (Website → Location). A distance the
-- admin types is kept as typed; the rest are computed from the coordinates.
ALTER TABLE "Landmark" ADD COLUMN "manualDistance" BOOLEAN NOT NULL DEFAULT false;
