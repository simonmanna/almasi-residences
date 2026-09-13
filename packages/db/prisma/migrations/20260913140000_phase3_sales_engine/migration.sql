-- Roadmap phase 3: the sales engine.
-- CreateEnum
CREATE TYPE "LostReason" AS ENUM ('PRICE', 'LOCATION', 'TIMING', 'CHOSE_COMPETITOR', 'FINANCING', 'NO_RESPONSE', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadNoteKind" AS ENUM ('NOTE', 'CALL', 'EMAIL', 'WHATSAPP', 'MEETING', 'STATUS', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ViewingStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'COMPLETED', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('ENQUIRY_ALERT', 'ENQUIRY_ACKNOWLEDGEMENT', 'VIEWING_REQUESTED', 'VIEWING_CONFIRMATION', 'VIEWING_REMINDER', 'LEADS_DIGEST', 'RESERVATION_EXPIRING');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- AlterEnum: the §40.3 pipeline. Existing values are renamed in place so no
-- lead changes stage: VIEWING → VIEWING_SCHEDULED, NEGOTIATION → INTERESTED,
-- CONVERTED → SOLD; VIEWED is new.
ALTER TYPE "EnquiryStatus" RENAME VALUE 'VIEWING' TO 'VIEWING_SCHEDULED';
ALTER TYPE "EnquiryStatus" RENAME VALUE 'NEGOTIATION' TO 'INTERESTED';
ALTER TYPE "EnquiryStatus" RENAME VALUE 'CONVERTED' TO 'SOLD';
ALTER TYPE "EnquiryStatus" ADD VALUE 'VIEWED' AFTER 'VIEWING_SCHEDULED';

-- AlterTable
-- The assignee becomes a real foreign key (audit §15.5); ids that no longer
-- name an admin are cleared rather than breaking the constraint.
ALTER TABLE "Enquiry" RENAME COLUMN "assignedTo" TO "assignedToId";
UPDATE "Enquiry" SET "assignedToId" = NULL WHERE "assignedToId" IS NOT NULL AND "assignedToId" NOT IN (SELECT id FROM "AdminUser");
ALTER TABLE "Enquiry"
ADD COLUMN     "contactedAt" TIMESTAMP(3),
ADD COLUMN     "duplicateOfId" TEXT,
ADD COLUMN     "followUpAt" TIMESTAMP(3),
ADD COLUMN     "lastActivityAt" TIMESTAMP(3),
ADD COLUMN     "lostNote" TEXT,
ADD COLUMN     "lostReason" "LostReason",
ADD COLUMN     "repeatCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "LeadNote" (
    "id" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "authorId" TEXT,
    "kind" "LeadNoteKind" NOT NULL DEFAULT 'NOTE',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Viewing" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "enquiryId" TEXT,
    "buyerId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "requestedDate" TIMESTAMP(3),
    "requestedSlot" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "durationMinutes" INTEGER NOT NULL DEFAULT 45,
    "agentId" TEXT,
    "status" "ViewingStatus" NOT NULL DEFAULT 'REQUESTED',
    "location" TEXT,
    "notes" TEXT,
    "outcome" TEXT,
    "confirmationSentAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Viewing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViewingUnit" (
    "viewingId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,

    CONSTRAINT "ViewingUnit_pkey" PRIMARY KEY ("viewingId","unitId")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "buyerId" TEXT,
    "enquiryId" TEXT,
    "agentId" TEXT,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "heldUntil" TIMESTAMP(3) NOT NULL,
    "depositMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "depositReceivedAt" TIMESTAMP(3),
    "previousStatus" "UnitStatus" NOT NULL DEFAULT 'AVAILABLE',
    "notes" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedReason" TEXT,
    "expiryNoticeSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "replyTo" TEXT,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "enquiryId" TEXT,
    "viewingId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "path" TEXT,
    "unitId" TEXT,
    "props" JSONB,
    "referrer" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "device" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadNote_enquiryId_createdAt_idx" ON "LeadNote"("enquiryId", "createdAt");

-- CreateIndex
CREATE INDEX "Viewing_developmentId_scheduledAt_idx" ON "Viewing"("developmentId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Viewing_status_idx" ON "Viewing"("status");

-- CreateIndex
CREATE INDEX "Viewing_agentId_idx" ON "Viewing"("agentId");

-- CreateIndex
CREATE INDEX "ViewingUnit_unitId_idx" ON "ViewingUnit"("unitId");

-- CreateIndex
CREATE INDEX "Reservation_developmentId_status_idx" ON "Reservation"("developmentId", "status");

-- CreateIndex
CREATE INDEX "Reservation_unitId_status_idx" ON "Reservation"("unitId", "status");

-- CreateIndex
CREATE INDEX "Reservation_heldUntil_idx" ON "Reservation"("heldUntil");

-- CreateIndex
CREATE INDEX "Notification_status_createdAt_idx" ON "Notification"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_enquiryId_idx" ON "Notification"("enquiryId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_developmentId_name_createdAt_idx" ON "AnalyticsEvent"("developmentId", "name", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_unitId_name_idx" ON "AnalyticsEvent"("unitId", "name");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_sessionId_idx" ON "AnalyticsEvent"("sessionId");

-- CreateIndex
CREATE INDEX "Enquiry_assignedToId_idx" ON "Enquiry"("assignedToId");

-- CreateIndex
CREATE INDEX "Enquiry_followUpAt_idx" ON "Enquiry"("followUpAt");

-- CreateIndex
CREATE INDEX "Enquiry_email_idx" ON "Enquiry"("email");

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadNote" ADD CONSTRAINT "LeadNote_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadNote" ADD CONSTRAINT "LeadNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewingUnit" ADD CONSTRAINT "ViewingUnit_viewingId_fkey" FOREIGN KEY ("viewingId") REFERENCES "Viewing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewingUnit" ADD CONSTRAINT "ViewingUnit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_viewingId_fkey" FOREIGN KEY ("viewingId") REFERENCES "Viewing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill (§15.3): a lead already past NEW was contacted; the note history starts
-- from each lead's single legacy note.
UPDATE "Enquiry" SET "contactedAt" = "updatedAt" WHERE status <> 'NEW' AND "contactedAt" IS NULL;
UPDATE "Enquiry" SET "lastActivityAt" = "updatedAt";
INSERT INTO "LeadNote" (id, "enquiryId", kind, body, "createdAt")
SELECT 'ln_' || id, id, 'NOTE', "internalNote", "updatedAt" FROM "Enquiry" WHERE "internalNote" IS NOT NULL AND "internalNote" <> '';
