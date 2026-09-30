-- Website → Residences page now drives the /residences header. Its old
-- kicker/title/lede were never shown on the site, so they are replaced with the
-- wording the header printed until now, written with live-figure tokens.
INSERT INTO "ContentPage" ("id", "developmentId", "key", "title", "content", "published", "updatedAt", "createdAt")
SELECT gen_random_uuid()::text, "id", 'residences', 'Residences page', '{}'::jsonb, true, now(), now()
FROM "Development"
ON CONFLICT ("developmentId", "key") DO NOTHING;

UPDATE "ContentPage"
SET "content" = (COALESCE("content", '{}'::jsonb) - 'heroKicker') || jsonb_build_object(
      'heroTitle', 'Residences',
      'heroTally', '{total} residences · {available} available',
      'heroLede', '{typeList} for sale in {place}, from {areaMin} to {areaMax} m². Availability is live from the sales team’s own records.'),
    "draftContent" = NULL,
    "draftUpdatedAt" = NULL,
    "updatedAt" = now()
WHERE "key" = 'residences';
