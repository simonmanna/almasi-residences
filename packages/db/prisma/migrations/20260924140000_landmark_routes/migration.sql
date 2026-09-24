-- Whether a place's distance and times are Google road routes (true) or straight-line estimates (false).
ALTER TABLE "Landmark" ADD COLUMN "routed" BOOLEAN NOT NULL DEFAULT false;

-- The owner's list of nearby places replaces the earlier one (2026-09-24).
-- Names and categories are theirs; every point was checked on Google Maps.
DELETE FROM "Landmark" l USING "Development" d
WHERE d."slug" = 'almasi-residences' AND l."developmentId" = d."id";

INSERT INTO "Landmark" ("id", "developmentId", "name", "category", "latitude", "longitude")
SELECT gen_random_uuid()::text, d."id", v.name, v.category, v.lat, v.lng
FROM "Development" d, (VALUES
  ('Embassy of the Republic of Turkey', 'EMBASSY'::"LandmarkCategory", -1.9552875, 30.0830114),
  ('Repub Lounge', 'LEISURE'::"LandmarkCategory", -1.9522083, 30.0815491),
  ('WAKA Fitness', 'LEISURE'::"LandmarkCategory", -1.9526577, 30.0813898),
  ('Kimihurura Roundabout Park', 'LEISURE'::"LandmarkCategory", -1.9552116, 30.0859855),
  ('Kigali Convention Centre', 'LEISURE'::"LandmarkCategory", -1.9545556, 30.0938534),
  ('Radisson Blu Hotel', 'LEISURE'::"LandmarkCategory", -1.9543355, 30.092681),
  ('The Hut Hotel & Restaurant', 'LEISURE'::"LandmarkCategory", -1.9578386, 30.0934672),
  ('Kigali Heights', 'SHOPPING'::"LandmarkCategory", -1.952861, 30.0926808),
  ('Kigali Alliance Business Centre (KABC)', 'SHOPPING'::"LandmarkCategory", -1.9522827, 30.0912714),
  ('University of Kigali (UoK)', 'SCHOOL'::"LandmarkCategory", -1.9508723, 30.0929327),
  ('Rwanda Development Board (RDB)', 'BUSINESS'::"LandmarkCategory", -1.9526603, 30.1018672),
  ('M Peace Plaza', 'BUSINESS'::"LandmarkCategory", -1.9471815, 30.0593244),
  ('Green Hills Academy', 'SCHOOL'::"LandmarkCategory", -1.9412444, 30.1044367),
  ('Kigali International Airport (KGL)', 'AIRPORT'::"LandmarkCategory", -1.9633119, 30.1350179)
) AS v(name, category, lat, lng)
WHERE d."slug" = 'almasi-residences';

-- Straight-line distance from the property pin; the API re-routes by road when a Maps key is set.
UPDATE "Landmark" l
SET "distanceM" = ROUND(
  ST_Distance(
    ST_SetSRID(ST_MakePoint(l."longitude", l."latitude"), 4326)::geography,
    ST_SetSRID(ST_MakePoint(d."longitude", d."latitude"), 4326)::geography
  )
)::int
FROM "Development" d
WHERE d."slug" = 'almasi-residences' AND l."developmentId" = d."id";

UPDATE "Landmark" l
SET "driveMinutes" = GREATEST(1, ROUND((l."distanceM" / 1000.0) / 28.0 * 60)::int),
    "walkMinutes"  = CASE WHEN l."distanceM" <= 3000
                          THEN GREATEST(1, ROUND((l."distanceM" / 1000.0) / 4.5 * 60)::int)
                          ELSE NULL END
FROM "Development" d
WHERE d."slug" = 'almasi-residences' AND l."developmentId" = d."id";
