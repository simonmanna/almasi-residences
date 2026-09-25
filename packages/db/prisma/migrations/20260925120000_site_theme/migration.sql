-- The public website's look, chosen by the admin. Existing sites keep Wooden.
ALTER TABLE "Development"
ADD COLUMN "siteTheme" TEXT NOT NULL DEFAULT 'wooden';
