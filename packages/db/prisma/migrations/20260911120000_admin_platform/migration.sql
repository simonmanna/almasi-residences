-- Admin platform (DECISIONS D-33, D-34). Generated with `prisma migrate diff`,
-- then edited by hand so existing rows survive: enum values are mapped rather
-- than cast, and the new required Unit columns are backfilled before NOT NULL.

-- CreateEnum
CREATE TYPE "ConstructionStatus" AS ENUM ('PLANNING', 'SITE_PREPARATION', 'FOUNDATION', 'STRUCTURE', 'ENVELOPE', 'FINISHES', 'HANDOVER', 'COMPLETED');

-- CreateEnum
CREATE TYPE "RoomType" AS ENUM ('LIVING', 'DINING', 'KITCHEN', 'BEDROOM', 'BATHROOM', 'WC', 'STUDY', 'BALCONY', 'TERRACE', 'STORAGE', 'LAUNDRY', 'HALL', 'OTHER');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO', 'DOCUMENT', 'MODEL');

-- CreateEnum
CREATE TYPE "MediaCollection" AS ENUM ('LIBRARY', 'FLOOR_PLAN', 'DESIGN');

-- CreateEnum
CREATE TYPE "ParkingType" AS ENUM ('STANDARD', 'COMPACT', 'ACCESSIBLE', 'EV', 'VISITOR', 'MOTORCYCLE');

-- CreateEnum
CREATE TYPE "ParkingStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'ASSIGNED', 'SOLD', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "ResidentType" AS ENUM ('OWNER', 'TENANT', 'FAMILY', 'OTHER');

-- CreateEnum
CREATE TYPE "OccupancyStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'MOVED_OUT');

-- CreateEnum
CREATE TYPE "BuyerStage" AS ENUM ('PROSPECT', 'ENQUIRY', 'INTERESTED', 'RESERVATION', 'BUYER', 'OWNER', 'RESIDENT');

-- AlterEnum
BEGIN;
CREATE TYPE "AdminRole_new" AS ENUM ('SUPER_ADMIN', 'PROPERTY_MANAGER', 'SALES_MANAGER', 'CONTENT_MANAGER', 'VIEWER');
ALTER TABLE "public"."AdminUser" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "AdminUser" ALTER COLUMN "role" TYPE "AdminRole_new" USING (
  CASE "role"::text
    WHEN 'OWNER' THEN 'SUPER_ADMIN'
    WHEN 'MARKETING' THEN 'CONTENT_MANAGER'
    WHEN 'SALES' THEN 'SALES_MANAGER'
    ELSE 'VIEWER'
  END
)::"AdminRole_new";
ALTER TYPE "AdminRole" RENAME TO "AdminRole_old";
ALTER TYPE "AdminRole_new" RENAME TO "AdminRole";
DROP TYPE "public"."AdminRole_old";
ALTER TABLE "AdminUser" ALTER COLUMN "role" SET DEFAULT 'VIEWER';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "EnquiryStatus_new" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING', 'NEGOTIATION', 'RESERVED', 'CONVERTED', 'LOST', 'SPAM');
ALTER TABLE "public"."Enquiry" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Enquiry" ALTER COLUMN "status" TYPE "EnquiryStatus_new" USING (
  CASE "status"::text WHEN 'WON' THEN 'CONVERTED' ELSE "status"::text END
)::"EnquiryStatus_new";
ALTER TYPE "EnquiryStatus" RENAME TO "EnquiryStatus_old";
ALTER TYPE "EnquiryStatus_new" RENAME TO "EnquiryStatus";
DROP TYPE "public"."EnquiryStatus_old";
ALTER TABLE "Enquiry" ALTER COLUMN "status" SET DEFAULT 'NEW';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "UnitStatus_new" AS ENUM ('AVAILABLE', 'RESERVED', 'ON_HOLD', 'SOLD', 'OCCUPIED', 'UNAVAILABLE');
ALTER TABLE "public"."Unit" ALTER COLUMN "status" DROP DEFAULT;
-- BOOKED (a sale in negotiation) becomes ON_HOLD; NOT_RELEASED becomes UNAVAILABLE.
ALTER TABLE "Unit" ALTER COLUMN "status" TYPE "UnitStatus_new" USING (
  CASE "status"::text WHEN 'BOOKED' THEN 'ON_HOLD' WHEN 'NOT_RELEASED' THEN 'UNAVAILABLE' ELSE "status"::text END
)::"UnitStatus_new";
ALTER TABLE "UnitStatusLog" ALTER COLUMN "from" TYPE "UnitStatus_new" USING (
  CASE "from"::text WHEN 'BOOKED' THEN 'ON_HOLD' WHEN 'NOT_RELEASED' THEN 'UNAVAILABLE' ELSE "from"::text END
)::"UnitStatus_new";
ALTER TABLE "UnitStatusLog" ALTER COLUMN "to" TYPE "UnitStatus_new" USING (
  CASE "to"::text WHEN 'BOOKED' THEN 'ON_HOLD' WHEN 'NOT_RELEASED' THEN 'UNAVAILABLE' ELSE "to"::text END
)::"UnitStatus_new";
ALTER TYPE "UnitStatus" RENAME TO "UnitStatus_old";
ALTER TYPE "UnitStatus_new" RENAME TO "UnitStatus";
DROP TYPE "public"."UnitStatus_old";
ALTER TABLE "Unit" ALTER COLUMN "status" SET DEFAULT 'AVAILABLE';
COMMIT;

-- DropForeignKey
ALTER TABLE "Unit" DROP CONSTRAINT "Unit_floorId_fkey";

-- AlterTable
ALTER TABLE "AdminAuditLog" ADD COLUMN     "after" JSONB,
ADD COLUMN     "before" JSONB,
ADD COLUMN     "entity" TEXT,
ADD COLUMN     "entityId" TEXT,
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "userAgent" TEXT;

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "role" SET DEFAULT 'VIEWER';

-- AlterTable
ALTER TABLE "Amenity" ADD COLUMN     "location" TEXT,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "shortDescription" TEXT,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "specifications" JSONB;

-- AlterTable
ALTER TABLE "Development" ADD COLUMN     "architect" TEXT,
ADD COLUMN     "buildingConfig" TEXT,
ADD COLUMN     "constructionPercent" INTEGER,
ADD COLUMN     "constructionStatus" "ConstructionStatus" NOT NULL DEFAULT 'STRUCTURE',
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "contractor" TEXT,
ADD COLUMN     "developerName" TEXT,
ADD COLUMN     "heroMediaId" TEXT,
ADD COLUMN     "logoMediaId" TEXT,
ADD COLUMN     "mainMediaId" TEXT,
ADD COLUMN     "officeAddress" TEXT,
ADD COLUMN     "officeHours" TEXT,
ADD COLUMN     "propertyType" TEXT NOT NULL DEFAULT 'Residential apartments',
ADD COLUMN     "socials" JSONB,
ADD COLUMN     "videoMediaId" TEXT,
ADD COLUMN     "whatsappNumber" TEXT,
ADD COLUMN     "yearStarted" INTEGER;

-- AlterTable
ALTER TABLE "Enquiry" ADD COLUMN     "buyerId" TEXT;

-- AlterTable
ALTER TABLE "Faq" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'General',
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Floor" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "PaymentMilestone" ADD COLUMN     "paymentPlanId" TEXT;

-- AlterTable
ALTER TABLE "ProgressUpdate" ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Typology" ADD COLUMN     "isPenthouse" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "availabilityDate" TIMESTAMP(3),
ADD COLUMN     "bathrooms" DOUBLE PRECISION,
ADD COLUMN     "bedrooms" INTEGER,
ADD COLUMN     "buyerId" TEXT,
ADD COLUMN     "depositPercent" DOUBLE PRECISION,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "developmentId" TEXT,
ADD COLUMN     "discountMinor" INTEGER,
ADD COLUMN     "exteriorSqm" DOUBLE PRECISION,
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasStorage" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "interiorSqm" DOUBLE PRECISION,
ADD COLUMN     "parkingIncluded" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paymentPlanId" TEXT,
ADD COLUMN     "promoEndsAt" TIMESTAMP(3),
ADD COLUMN     "promoPriceMinor" INTEGER,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reservationFeeMinor" INTEGER,
ADD COLUMN     "shortDescription" TEXT,
ADD COLUMN     "storageNote" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "terraceSqm" DOUBLE PRECISION;

-- Backfill: bedrooms and bathrooms were read from the typology; they now live
-- on the residence. The property comes from floor → building.
UPDATE "Unit" u
SET "bedrooms" = t."bedrooms", "bathrooms" = t."bathrooms"
FROM "Typology" t
WHERE t."id" = u."typologyId";

UPDATE "Unit" u
SET "developmentId" = b."developmentId"
FROM "Floor" f JOIN "Building" b ON b."id" = f."buildingId"
WHERE f."id" = u."floorId";

ALTER TABLE "Unit" ALTER COLUMN "bedrooms" SET NOT NULL,
ALTER COLUMN "bathrooms" SET NOT NULL,
ALTER COLUMN "developmentId" SET NOT NULL;

-- AlterTable
ALTER TABLE "UnitStatusLog" ADD COLUMN     "note" TEXT;

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "fromMinor" INTEGER NOT NULL,
    "toMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "RoomType" NOT NULL,
    "areaSqm" DOUBLE PRECISION,
    "description" TEXT,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "planX" DOUBLE PRECISION,
    "planY" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feature" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'General',
    "iconKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Feature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitFeature" (
    "unitId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "UnitFeature_pkey" PRIMARY KEY ("unitId","featureId")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "collection" "MediaCollection" NOT NULL DEFAULT 'LIBRARY',
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "title" TEXT,
    "caption" TEXT,
    "altText" TEXT,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" DOUBLE PRECISION,
    "variants" JSONB,
    "posterKey" TEXT,
    "blurDataUrl" TEXT,
    "dominantHex" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "unitId" TEXT,
    "floorId" TEXT,
    "amenityId" TEXT,
    "roomId" TEXT,
    "typologyId" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gallery" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coverMediaId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gallery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryItem" (
    "galleryId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GalleryItem_pkey" PRIMARY KEY ("galleryId","mediaId")
);

-- CreateTable
CREATE TABLE "PaymentPlan" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "depositPercent" DOUBLE PRECISION,
    "reservationFeeMinor" INTEGER,
    "installmentCount" INTEGER,
    "durationMonths" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParkingSpace" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'Basement',
    "type" "ParkingType" NOT NULL DEFAULT 'STANDARD',
    "sizeSqm" DOUBLE PRECISION,
    "status" "ParkingStatus" NOT NULL DEFAULT 'AVAILABLE',
    "unitId" TEXT,
    "residentId" TEXT,
    "priceMinor" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParkingSpace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resident" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "countryIso" TEXT,
    "unitId" TEXT,
    "residentType" "ResidentType" NOT NULL DEFAULT 'OWNER',
    "occupancyStatus" "OccupancyStatus" NOT NULL DEFAULT 'UPCOMING',
    "moveInDate" TIMESTAMP(3),
    "moveOutDate" TIMESTAMP(3),
    "notes" TEXT,
    "profileMediaId" TEXT,
    "buyerId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Residency" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "actor" TEXT NOT NULL,

    CONSTRAINT "Residency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Buyer" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "countryIso" TEXT,
    "stage" "BuyerStage" NOT NULL DEFAULT 'PROSPECT',
    "source" TEXT,
    "assignedToId" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Buyer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerInterest" (
    "buyerId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyerInterest_pkey" PRIMARY KEY ("buyerId","unitId")
);

-- CreateTable
CREATE TABLE "ContentPage" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceHistory_unitId_createdAt_idx" ON "PriceHistory"("unitId", "createdAt");

-- CreateIndex
CREATE INDEX "Room_unitId_idx" ON "Room"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "Feature_developmentId_name_key" ON "Feature"("developmentId", "name");

-- CreateIndex
CREATE INDEX "UnitFeature_featureId_idx" ON "UnitFeature"("featureId");

-- CreateIndex
CREATE UNIQUE INDEX "Media_storageKey_key" ON "Media"("storageKey");

-- CreateIndex
CREATE INDEX "Media_developmentId_collection_kind_idx" ON "Media"("developmentId", "collection", "kind");

-- CreateIndex
CREATE INDEX "Media_unitId_idx" ON "Media"("unitId");

-- CreateIndex
CREATE INDEX "Media_floorId_idx" ON "Media"("floorId");

-- CreateIndex
CREATE INDEX "Media_amenityId_idx" ON "Media"("amenityId");

-- CreateIndex
CREATE INDEX "Media_roomId_idx" ON "Media"("roomId");

-- CreateIndex
CREATE INDEX "Media_typologyId_idx" ON "Media"("typologyId");

-- CreateIndex
CREATE UNIQUE INDEX "Gallery_developmentId_slug_key" ON "Gallery"("developmentId", "slug");

-- CreateIndex
CREATE INDEX "GalleryItem_mediaId_idx" ON "GalleryItem"("mediaId");

-- CreateIndex
CREATE INDEX "PaymentPlan_developmentId_idx" ON "PaymentPlan"("developmentId");

-- CreateIndex
CREATE INDEX "ParkingSpace_status_idx" ON "ParkingSpace"("status");

-- CreateIndex
CREATE INDEX "ParkingSpace_unitId_idx" ON "ParkingSpace"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "ParkingSpace_developmentId_code_key" ON "ParkingSpace"("developmentId", "code");

-- CreateIndex
CREATE INDEX "Resident_unitId_idx" ON "Resident"("unitId");

-- CreateIndex
CREATE INDEX "Resident_developmentId_archivedAt_idx" ON "Resident"("developmentId", "archivedAt");

-- CreateIndex
CREATE INDEX "Residency_residentId_idx" ON "Residency"("residentId");

-- CreateIndex
CREATE INDEX "Residency_unitId_idx" ON "Residency"("unitId");

-- CreateIndex
CREATE INDEX "Buyer_stage_idx" ON "Buyer"("stage");

-- CreateIndex
CREATE INDEX "Buyer_developmentId_archivedAt_idx" ON "Buyer"("developmentId", "archivedAt");

-- CreateIndex
CREATE INDEX "BuyerInterest_unitId_idx" ON "BuyerInterest"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentPage_developmentId_key_key" ON "ContentPage"("developmentId", "key");

-- CreateIndex
CREATE INDEX "AdminAuditLog_entity_entityId_idx" ON "AdminAuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Amenity_developmentId_idx" ON "Amenity"("developmentId");

-- CreateIndex
CREATE INDEX "Enquiry_buyerId_idx" ON "Enquiry"("buyerId");

-- CreateIndex
CREATE INDEX "EnquiryUnit_unitId_idx" ON "EnquiryUnit"("unitId");

-- CreateIndex
CREATE INDEX "PaymentMilestone_paymentPlanId_idx" ON "PaymentMilestone"("paymentPlanId");

-- CreateIndex
CREATE INDEX "Unit_floorId_idx" ON "Unit"("floorId");

-- CreateIndex
CREATE INDEX "Unit_published_archivedAt_idx" ON "Unit"("published", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_developmentId_code_key" ON "Unit"("developmentId", "code");

-- CreateIndex
CREATE INDEX "UnitStatusLog_createdAt_idx" ON "UnitStatusLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Development" ADD CONSTRAINT "Development_logoMediaId_fkey" FOREIGN KEY ("logoMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Development" ADD CONSTRAINT "Development_heroMediaId_fkey" FOREIGN KEY ("heroMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Development" ADD CONSTRAINT "Development_mainMediaId_fkey" FOREIGN KEY ("mainMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Development" ADD CONSTRAINT "Development_videoMediaId_fkey" FOREIGN KEY ("videoMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_paymentPlanId_fkey" FOREIGN KEY ("paymentPlanId") REFERENCES "PaymentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feature" ADD CONSTRAINT "Feature_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitFeature" ADD CONSTRAINT "UnitFeature_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitFeature" ADD CONSTRAINT "UnitFeature_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_amenityId_fkey" FOREIGN KEY ("amenityId") REFERENCES "Amenity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_typologyId_fkey" FOREIGN KEY ("typologyId") REFERENCES "Typology"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gallery" ADD CONSTRAINT "Gallery_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gallery" ADD CONSTRAINT "Gallery_coverMediaId_fkey" FOREIGN KEY ("coverMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryItem" ADD CONSTRAINT "GalleryItem_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "Gallery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryItem" ADD CONSTRAINT "GalleryItem_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMilestone" ADD CONSTRAINT "PaymentMilestone_paymentPlanId_fkey" FOREIGN KEY ("paymentPlanId") REFERENCES "PaymentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingSpace" ADD CONSTRAINT "ParkingSpace_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingSpace" ADD CONSTRAINT "ParkingSpace_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingSpace" ADD CONSTRAINT "ParkingSpace_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resident" ADD CONSTRAINT "Resident_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resident" ADD CONSTRAINT "Resident_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resident" ADD CONSTRAINT "Resident_profileMediaId_fkey" FOREIGN KEY ("profileMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resident" ADD CONSTRAINT "Resident_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Residency" ADD CONSTRAINT "Residency_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Residency" ADD CONSTRAINT "Residency_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Buyer" ADD CONSTRAINT "Buyer_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Buyer" ADD CONSTRAINT "Buyer_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerInterest" ADD CONSTRAINT "BuyerInterest_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerInterest" ADD CONSTRAINT "BuyerInterest_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPage" ADD CONSTRAINT "ContentPage_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing milestones become the default payment plan of their property.
INSERT INTO "PaymentPlan" ("id", "developmentId", "name", "isDefault", "published", "updatedAt")
SELECT 'plan_' || d."id", d."id", 'Standard plan', true, true, CURRENT_TIMESTAMP
FROM "Development" d;

UPDATE "PaymentMilestone" SET "paymentPlanId" = 'plan_' || "developmentId";
