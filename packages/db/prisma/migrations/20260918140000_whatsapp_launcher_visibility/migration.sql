-- The public WhatsApp launcher is enabled for existing properties by default.
ALTER TABLE "Development"
ADD COLUMN "whatsappIconVisible" BOOLEAN NOT NULL DEFAULT true;
