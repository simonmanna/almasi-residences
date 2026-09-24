-- The homepage film and experience sections get their own CMS pages (Website → Film, Website → Experience),
-- each with a visibility switch. Their words move out of the "home" page as they stand today, so nothing changes on the site.
INSERT INTO "ContentPage" ("id", "developmentId", "key", "title", "content", "published", "updatedAt", "createdAt")
SELECT gen_random_uuid()::text, "developmentId", 'filmSection', 'Homepage film',
       jsonb_strip_nulls(jsonb_build_object(
         'showFilmSection', true,
         'kicker', "content"::jsonb -> 'filmKicker',
         'title', "content"::jsonb -> 'filmTitle',
         'cta', "content"::jsonb -> 'filmCta')),
       true, now(), now()
FROM "ContentPage" WHERE "key" = 'home'
ON CONFLICT ("developmentId", "key") DO NOTHING;

INSERT INTO "ContentPage" ("id", "developmentId", "key", "title", "content", "published", "updatedAt", "createdAt")
SELECT gen_random_uuid()::text, "developmentId", 'experienceSection', 'Homepage experience',
       jsonb_strip_nulls(jsonb_build_object(
         'showExperienceSection', true,
         'title', "content"::jsonb -> 'storyTitle')),
       true, now(), now()
FROM "ContentPage" WHERE "key" = 'home'
ON CONFLICT ("developmentId", "key") DO NOTHING;
