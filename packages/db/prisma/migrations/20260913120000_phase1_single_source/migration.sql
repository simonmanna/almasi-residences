-- Roadmap phase 1: the database becomes the source of truth for presentation.
-- CreateEnum
CREATE TYPE "MediaProvenance" AS ENUM ('PHOTOGRAPH', 'SUPPLIED_RENDER', 'CONCEPT_RENDER', 'DRAWING');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- AlterTable
ALTER TABLE "Enquiry" ADD COLUMN     "developmentId" TEXT;
-- Backfill (§40.5): a lead belongs to the property of the residences it names,
-- and a lead that names none belongs to the only property there has been.
UPDATE "Enquiry" e SET "developmentId" = (
  SELECT u."developmentId" FROM "EnquiryUnit" eu JOIN "Unit" u ON u.id = eu."unitId"
  WHERE eu."enquiryId" = e.id LIMIT 1
);
UPDATE "Enquiry" SET "developmentId" = (SELECT id FROM "Development" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "developmentId" IS NULL;
ALTER TABLE "Enquiry" ALTER COLUMN "developmentId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "focusX" DOUBLE PRECISION,
ADD COLUMN     "focusY" DOUBLE PRECISION,
ADD COLUMN     "provenance" "MediaProvenance" NOT NULL DEFAULT 'PHOTOGRAPH';

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "planH" DOUBLE PRECISION,
ADD COLUMN     "planOpen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "planW" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Scene" ADD COLUMN     "body" TEXT,
ADD COLUMN     "imageId" TEXT,
ADD COLUMN     "place" TEXT,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "videoId" TEXT;

-- AlterTable
ALTER TABLE "Tour" ADD COLUMN     "description" TEXT,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "modelSlot" TEXT;

-- AlterTable
ALTER TABLE "VideoAsset" ADD COLUMN     "description" TEXT,
ADD COLUMN     "developmentId" TEXT,
ADD COLUMN     "mediaId" TEXT,
ADD COLUMN     "posterMediaId" TEXT,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "VideoChapter" ADD COLUMN     "place" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "MediaSlot" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "imageId" TEXT,
    "videoId" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoPage" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "ogImageId" TEXT,
    "noindex" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Specification" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "typologyId" TEXT,
    "category" TEXT NOT NULL DEFAULT 'General',
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Specification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncEvent" (
    "id" TEXT NOT NULL,
    "developmentSlug" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "tags" TEXT[],
    "status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaSlot_developmentId_key_key" ON "MediaSlot"("developmentId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "SeoPage_developmentId_path_key" ON "SeoPage"("developmentId", "path");

-- CreateIndex
CREATE INDEX "Specification_developmentId_typologyId_idx" ON "Specification"("developmentId", "typologyId");

-- CreateIndex
CREATE INDEX "SyncEvent_status_nextAttemptAt_idx" ON "SyncEvent"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "SyncEvent_createdAt_idx" ON "SyncEvent"("createdAt");

-- CreateIndex
CREATE INDEX "Enquiry_developmentId_createdAt_idx" ON "Enquiry"("developmentId", "createdAt");

-- AddForeignKey
ALTER TABLE "MediaSlot" ADD CONSTRAINT "MediaSlot_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaSlot" ADD CONSTRAINT "MediaSlot_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaSlot" ADD CONSTRAINT "MediaSlot_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAsset" ADD CONSTRAINT "VideoAsset_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAsset" ADD CONSTRAINT "VideoAsset_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAsset" ADD CONSTRAINT "VideoAsset_posterMediaId_fkey" FOREIGN KEY ("posterMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoPage" ADD CONSTRAINT "SeoPage_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoPage" ADD CONSTRAINT "SeoPage_ogImageId_fkey" FOREIGN KEY ("ogImageId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Specification" ADD CONSTRAINT "Specification_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Specification" ADD CONSTRAINT "Specification_typologyId_fkey" FOREIGN KEY ("typologyId") REFERENCES "Typology"("id") ON DELETE CASCADE ON UPDATE CASCADE;
