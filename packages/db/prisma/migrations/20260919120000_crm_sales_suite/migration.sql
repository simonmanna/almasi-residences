-- CRM & sales suite: configurable pipeline, tasks, deals, campaigns, documents,
-- in-app notifications, saved views, scoring/assignment settings.
-- "Interested" leads become "Negotiation" (the stage it was used for).
-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('WEBSITE', 'WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'GOOGLE', 'PROPERTY_PORTAL', 'REFERRAL', 'WALK_IN', 'PHONE', 'EMAIL', 'CAMPAIGN', 'AGENT', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadTemperature" AS ENUM ('HOT', 'WARM', 'COLD');

-- CreateEnum
CREATE TYPE "ContactMethod" AS ENUM ('PHONE', 'WHATSAPP', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "LeadPurpose" AS ENUM ('OWN_USE', 'INVESTMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "PurchaseTimeline" AS ENUM ('IMMEDIATE', 'WITHIN_3_MONTHS', 'WITHIN_6_MONTHS', 'WITHIN_12_MONTHS', 'OVER_12_MONTHS', 'UNDECIDED');

-- CreateEnum
CREATE TYPE "CrmPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('CALL', 'WHATSAPP', 'EMAIL', 'SMS', 'MEETING', 'FOLLOW_UP', 'SEND_BROCHURE', 'SEND_FLOOR_PLAN', 'SEND_QUOTATION', 'SEND_PAYMENT_PLAN', 'SCHEDULE_VIEWING', 'POST_VIEWING', 'PAYMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('NEGOTIATION', 'RESERVED', 'CONTRACT', 'SOLD', 'LOST', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('BROCHURE', 'FLOOR_PLAN', 'PAYMENT_PLAN', 'QUOTATION', 'AGREEMENT', 'ID_DOCUMENT', 'RECEIPT', 'OTHER');

-- CreateEnum
CREATE TYPE "AssignmentMode" AS ENUM ('MANUAL', 'ROUND_ROBIN', 'LEAST_LOADED');

-- CreateEnum
CREATE TYPE "ViewingInterest" AS ENUM ('VERY_INTERESTED', 'INTERESTED', 'NEEDS_FOLLOW_UP', 'NOT_INTERESTED', 'WANTS_ANOTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AdminRole" ADD VALUE 'SALES_AGENT';
ALTER TYPE "AdminRole" ADD VALUE 'MARKETING';

-- AlterEnum
BEGIN;
CREATE TYPE "EnquiryStatus_new" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'PROPERTY_INTEREST', 'VIEWING_SCHEDULED', 'VIEWED', 'NEGOTIATION', 'RESERVED', 'CONTRACT', 'SOLD', 'ON_HOLD', 'LOST', 'DISQUALIFIED', 'SPAM');
ALTER TABLE "public"."Enquiry" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Enquiry" ALTER COLUMN "status" TYPE "EnquiryStatus_new" USING ((CASE WHEN "status"::text = 'INTERESTED' THEN 'NEGOTIATION' ELSE "status"::text END)::"EnquiryStatus_new");
ALTER TYPE "EnquiryStatus" RENAME TO "EnquiryStatus_old";
ALTER TYPE "EnquiryStatus_new" RENAME TO "EnquiryStatus";
DROP TYPE "public"."EnquiryStatus_old";
ALTER TABLE "Enquiry" ALTER COLUMN "status" SET DEFAULT 'NEW';
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadNoteKind" ADD VALUE 'SMS';
ALTER TYPE "LeadNoteKind" ADD VALUE 'VIEWING';
ALTER TYPE "LeadNoteKind" ADD VALUE 'DOCUMENT';
ALTER TYPE "LeadNoteKind" ADD VALUE 'TASK';
ALTER TYPE "LeadNoteKind" ADD VALUE 'ASSIGNMENT';
ALTER TYPE "LeadNoteKind" ADD VALUE 'RESERVATION';
ALTER TYPE "LeadNoteKind" ADD VALUE 'DEAL';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ViewingStatus" ADD VALUE 'SCHEDULED';
ALTER TYPE "ViewingStatus" ADD VALUE 'RESCHEDULED';

-- AlterTable
ALTER TABLE "Enquiry" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "bedrooms" INTEGER,
ADD COLUMN     "budgetConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "budgetMaxMinor" INTEGER,
ADD COLUMN     "budgetMinMinor" INTEGER,
ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "decisionMaker" TEXT,
ADD COLUMN     "financingRequired" BOOLEAN,
ADD COLUMN     "floorPreference" TEXT,
ADD COLUMN     "lastContactAt" TIMESTAMP(3),
ADD COLUMN     "leadSource" "LeadSource" NOT NULL DEFAULT 'WEBSITE',
ADD COLUMN     "preferredContact" "ContactMethod",
ADD COLUMN     "primaryUnitId" TEXT,
ADD COLUMN     "priority" "CrmPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "purpose" "LeadPurpose",
ADD COLUMN     "score" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sizeMaxSqm" DOUBLE PRECISION,
ADD COLUMN     "sizeMinSqm" DOUBLE PRECISION,
ADD COLUMN     "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "stageId" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "temperature" "LeadTemperature",
ADD COLUMN     "timeline" "PurchaseTimeline",
ADD COLUMN     "typologyId" TEXT,
ADD COLUMN     "whatsapp" TEXT,
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "phone" DROP NOT NULL;

-- AlterTable
ALTER TABLE "LeadNote" ADD COLUMN     "direction" TEXT,
ADD COLUMN     "durationMin" INTEGER,
ADD COLUMN     "meta" JSONB,
ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Viewing" ADD COLUMN     "alternativeUnitId" TEXT,
ADD COLUMN     "feedbackAt" TIMESTAMP(3),
ADD COLUMN     "feedbackById" TEXT,
ADD COLUMN     "interestLevel" "ViewingInterest",
ADD COLUMN     "objections" TEXT,
ADD COLUMN     "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "phone" DROP NOT NULL;

-- CreateTable
CREATE TABLE "LeadStageChange" (
    "id" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT,
    "fromStatus" "EnquiryStatus",
    "toStatus" "EnquiryStatus" NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadStageChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineStage" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" "EnquiryStatus" NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'sky',
    "position" INTEGER NOT NULL,
    "probability" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadTask" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "enquiryId" TEXT,
    "unitId" TEXT,
    "dealId" TEXT,
    "title" TEXT NOT NULL,
    "type" "TaskType" NOT NULL DEFAULT 'FOLLOW_UP',
    "priority" "CrmPriority" NOT NULL DEFAULT 'NORMAL',
    "dueAt" TIMESTAMP(3),
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "remindAt" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "createdById" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "enquiryId" TEXT,
    "buyerId" TEXT,
    "unitId" TEXT NOT NULL,
    "agentId" TEXT,
    "status" "DealStatus" NOT NULL DEFAULT 'NEGOTIATION',
    "listPriceMinor" INTEGER NOT NULL,
    "agreedPriceMinor" INTEGER,
    "discountMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "reservationAmountMinor" INTEGER,
    "paymentPlanId" TEXT,
    "expectedCloseAt" TIMESTAMP(3),
    "contractSignedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "lostReason" "LostReason",
    "lostNote" TEXT,
    "notes" TEXT,
    "reservationId" TEXT,
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "LeadSource" NOT NULL DEFAULT 'CAMPAIGN',
    "utmCampaign" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "budgetMinor" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadDocument" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "enquiryId" TEXT,
    "dealId" TEXT,
    "kind" "DocumentKind" NOT NULL DEFAULT 'OTHER',
    "name" TEXT NOT NULL,
    "storageKey" TEXT,
    "url" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "sentAt" TIMESTAMP(3),
    "uploadedById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "enquiryId" TEXT,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmSettings" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "assignmentMode" "AssignmentMode" NOT NULL DEFAULT 'MANUAL',
    "assignmentPool" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "roundRobinCursor" INTEGER NOT NULL DEFAULT 0,
    "scoringRules" JSONB,
    "hotThreshold" INTEGER NOT NULL DEFAULT 70,
    "warmThreshold" INTEGER NOT NULL DEFAULT 40,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadStageChange_enquiryId_createdAt_idx" ON "LeadStageChange"("enquiryId", "createdAt");

-- CreateIndex
CREATE INDEX "LeadStageChange_createdAt_idx" ON "LeadStageChange"("createdAt");

-- CreateIndex
CREATE INDEX "PipelineStage_developmentId_position_idx" ON "PipelineStage"("developmentId", "position");

-- CreateIndex
CREATE INDEX "LeadTask_developmentId_status_dueAt_idx" ON "LeadTask"("developmentId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "LeadTask_assignedToId_status_idx" ON "LeadTask"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "LeadTask_enquiryId_status_idx" ON "LeadTask"("enquiryId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_reservationId_key" ON "Deal"("reservationId");

-- CreateIndex
CREATE INDEX "Deal_developmentId_status_idx" ON "Deal"("developmentId", "status");

-- CreateIndex
CREATE INDEX "Deal_unitId_status_idx" ON "Deal"("unitId", "status");

-- CreateIndex
CREATE INDEX "Deal_enquiryId_idx" ON "Deal"("enquiryId");

-- CreateIndex
CREATE INDEX "Campaign_developmentId_utmCampaign_idx" ON "Campaign"("developmentId", "utmCampaign");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_developmentId_name_key" ON "Campaign"("developmentId", "name");

-- CreateIndex
CREATE INDEX "LeadDocument_enquiryId_idx" ON "LeadDocument"("enquiryId");

-- CreateIndex
CREATE INDEX "LeadDocument_dealId_idx" ON "LeadDocument"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminNotification_dedupeKey_key" ON "AdminNotification"("dedupeKey");

-- CreateIndex
CREATE INDEX "AdminNotification_userId_readAt_createdAt_idx" ON "AdminNotification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "SavedView_scope_userId_idx" ON "SavedView"("scope", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmSettings_developmentId_key" ON "CrmSettings"("developmentId");

-- CreateIndex
CREATE INDEX "Enquiry_phone_idx" ON "Enquiry"("phone");

-- CreateIndex
CREATE INDEX "Enquiry_developmentId_stageId_idx" ON "Enquiry"("developmentId", "stageId");

-- CreateIndex
CREATE INDEX "Enquiry_developmentId_archivedAt_idx" ON "Enquiry"("developmentId", "archivedAt");

-- CreateIndex
CREATE INDEX "LeadNote_kind_createdAt_idx" ON "LeadNote"("kind", "createdAt");

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "PipelineStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_typologyId_fkey" FOREIGN KEY ("typologyId") REFERENCES "Typology"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_primaryUnitId_fkey" FOREIGN KEY ("primaryUnitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadStageChange" ADD CONSTRAINT "LeadStageChange_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineStage" ADD CONSTRAINT "PipelineStage_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadTask" ADD CONSTRAINT "LeadTask_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadTask" ADD CONSTRAINT "LeadTask_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadTask" ADD CONSTRAINT "LeadTask_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadTask" ADD CONSTRAINT "LeadTask_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadTask" ADD CONSTRAINT "LeadTask_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadTask" ADD CONSTRAINT "LeadTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_paymentPlanId_fkey" FOREIGN KEY ("paymentPlanId") REFERENCES "PaymentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDocument" ADD CONSTRAINT "LeadDocument_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDocument" ADD CONSTRAINT "LeadDocument_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDocument" ADD CONSTRAINT "LeadDocument_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDocument" ADD CONSTRAINT "LeadDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminNotification" ADD CONSTRAINT "AdminNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminNotification" ADD CONSTRAINT "AdminNotification_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmSettings" ADD CONSTRAINT "CrmSettings_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_alternativeUnitId_fkey" FOREIGN KEY ("alternativeUnitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

