-- Turnstile has been removed, so there is no verification step that can be
-- skipped. The enquiry form is now defended by the honeypot field and the
-- per-IP rate limit on POST /api/v1/enquiry.
ALTER TABLE "Enquiry" DROP COLUMN "verificationSkipped";
