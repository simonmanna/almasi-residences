-- Google Maps link for the sales office; the footer and contact blocks link the address to it.
ALTER TABLE "Development" ADD COLUMN "mapsUrl" TEXT;

-- The sales office moved to 36 KG 2 Ave, and one number now serves telephone and WhatsApp.
-- Pin taken from https://maps.app.goo.gl/82UcRPaKe6UDWvN8A.
UPDATE "Development"
SET "contactPhone"   = '+250 790 600 100',
    "whatsappNumber" = '+250 790 600 100',
    "addressLine"    = '36 KG 2 Ave, Kigali',
    "officeAddress"  = '36 KG 2 Ave, Kigali, Rwanda',
    "mapsUrl"        = 'https://maps.app.goo.gl/82UcRPaKe6UDWvN8A',
    "latitude"       = -1.955683,
    "longitude"      = 30.0829147
WHERE "slug" = 'almasi-residences';

-- Nearby places are measured from the pin, so re-measure them (manual distances are kept).
UPDATE "Landmark" l
SET "distanceM" = ROUND(
  ST_Distance(
    ST_SetSRID(ST_MakePoint(l."longitude", l."latitude"), 4326)::geography,
    ST_SetSRID(ST_MakePoint(d."longitude", d."latitude"), 4326)::geography
  )
)::int
FROM "Development" d
WHERE d."slug" = 'almasi-residences' AND l."developmentId" = d."id" AND NOT l."manualDistance";

UPDATE "Landmark" l
SET "driveMinutes" = GREATEST(1, ROUND((l."distanceM" / 1000.0) / 28.0 * 60)::int),
    "walkMinutes"  = CASE WHEN l."distanceM" <= 3000
                          THEN GREATEST(1, ROUND((l."distanceM" / 1000.0) / 4.5 * 60)::int)
                          ELSE NULL END
FROM "Development" d
WHERE d."slug" = 'almasi-residences' AND l."developmentId" = d."id" AND NOT l."manualDistance";
