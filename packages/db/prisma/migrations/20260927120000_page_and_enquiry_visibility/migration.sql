-- Website → Enquiry and Website → Pages and navigation get their own CMS pages.
-- Every switch starts on, so the site keeps every page and button it has today.
INSERT INTO "ContentPage" ("id", "developmentId", "key", "title", "content", "published", "updatedAt", "createdAt")
SELECT gen_random_uuid()::text, "id", 'enquirySection', 'Enquiry',
       jsonb_build_object('showEnquireButton', true, 'showEnquirySection', true),
       true, now(), now()
FROM "Development"
ON CONFLICT ("developmentId", "key") DO NOTHING;

INSERT INTO "ContentPage" ("id", "developmentId", "key", "title", "content", "published", "updatedAt", "createdAt")
SELECT gen_random_uuid()::text, "id", 'pageVisibility', 'Pages and navigation',
       jsonb_build_object(
         'residences', true, 'tour', true, 'design3d', true, 'amenities', true,
         'location', true, 'gallery', true, 'buying', true, 'film', true,
         'progress', true, 'enquire', true),
       true, now(), now()
FROM "Development"
ON CONFLICT ("developmentId", "key") DO NOTHING;
