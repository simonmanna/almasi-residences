-- The development is "Almasi Residence", singular. Rename it in every piece of
-- live content. History (audit log, notifications, analytics) keeps what was
-- said at the time. Idempotent: a second run finds nothing to change.

UPDATE "Development" SET "name" = replace("name", 'Almasi Residences', 'Almasi Residence') WHERE "name" LIKE '%Almasi Residences%';

UPDATE "SeoMeta" SET
  "title" = replace("title", 'Almasi Residences', 'Almasi Residence'),
  "description" = replace("description", 'Almasi Residences', 'Almasi Residence'),
  "keywords" = ARRAY(SELECT replace(k, 'Almasi Residences', 'Almasi Residence') FROM unnest("keywords") AS k)
WHERE "title" LIKE '%Almasi Residences%' OR "description" LIKE '%Almasi Residences%' OR array_to_string("keywords", '|') LIKE '%Almasi Residences%';

UPDATE "Scene" SET "label" = replace("label", 'Almasi Residences', 'Almasi Residence') WHERE "label" LIKE '%Almasi Residences%';
UPDATE "VideoChapter" SET "label" = replace("label", 'Almasi Residences', 'Almasi Residence') WHERE "label" LIKE '%Almasi Residences%';
UPDATE "Tour" SET "name" = replace("name", 'Almasi Residences', 'Almasi Residence') WHERE "name" LIKE '%Almasi Residences%';
UPDATE "Media" SET "altText" = replace("altText", 'Almasi Residences', 'Almasi Residence') WHERE "altText" LIKE '%Almasi Residences%';

UPDATE "ContentPage" SET "content" = replace("content"::text, 'Almasi Residences', 'Almasi Residence')::jsonb WHERE "content"::text LIKE '%Almasi Residences%';
