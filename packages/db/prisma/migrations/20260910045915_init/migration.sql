-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "fuzzystrmatch";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis_tiger_geocoder";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis_topology";

-- CreateEnum
CREATE TYPE "DevelopmentStatus" AS ENUM ('ANNOUNCED', 'SELLING', 'SOLD_OUT', 'COMPLETED');

-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'BOOKED', 'SOLD', 'NOT_RELEASED');

-- CreateEnum
CREATE TYPE "Orientation" AS ENUM ('N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW');

-- CreateEnum
CREATE TYPE "MediaSetKind" AS ENUM ('EXTERIOR', 'INTERIOR', 'AERIAL', 'AMENITY', 'CONTEXT', 'PLAN');

-- CreateEnum
CREATE TYPE "TimeState" AS ENUM ('DAWN', 'DAY', 'DUSK', 'NIGHT');

-- CreateEnum
CREATE TYPE "AssetRole" AS ENUM ('PRIMARY', 'ALTERNATE', 'DETAIL');

-- CreateEnum
CREATE TYPE "VideoKind" AS ENUM ('WALKTHROUGH', 'TIMELAPSE', 'AERIAL', 'AMBIENT');

-- CreateEnum
CREATE TYPE "FrameSeqKind" AS ENUM ('ORBIT', 'DOLLY', 'TIMELAPSE', 'ASSEMBLY');

-- CreateEnum
CREATE TYPE "HotspotKind" AS ENUM ('NAVIGATE', 'INFO', 'MEASURE', 'VIEW_OUT');

-- CreateEnum
CREATE TYPE "MilestoneTrigger" AS ENUM ('ON_RESERVATION', 'ON_SIGNING', 'ON_DATE', 'ON_CONSTRUCTION_STAGE', 'ON_HANDOVER');

-- CreateEnum
CREATE TYPE "LandmarkCategory" AS ENUM ('SCHOOL', 'EMBASSY', 'HOSPITAL', 'SHOPPING', 'AIRPORT', 'LEISURE', 'BUSINESS');

-- CreateEnum
CREATE TYPE "EnquiryIntent" AS ENUM ('INFORMATION', 'VIEWING', 'RESERVATION', 'BROKER');

-- CreateEnum
CREATE TYPE "EnquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST', 'SPAM');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'MARKETING', 'SALES');

-- CreateTable
CREATE TABLE "Development" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "descriptionMd" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "addressLine" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "handoverDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "totalUnits" INTEGER NOT NULL DEFAULT 0,
    "status" "DevelopmentStatus" NOT NULL DEFAULT 'SELLING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Development_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Building" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "floorCount" INTEGER NOT NULL,
    "groundLabel" TEXT NOT NULL DEFAULT 'Ground',
    "modelUrl" TEXT,
    "modelScale" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Floor" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "heightM" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Floor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "typologyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "UnitStatus" NOT NULL DEFAULT 'AVAILABLE',
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "areaSqm" DOUBLE PRECISION NOT NULL,
    "balconySqm" DOUBLE PRECISION,
    "orientation" "Orientation" NOT NULL,
    "viewTags" TEXT[],
    "positionIndex" INTEGER NOT NULL,
    "widthRatio" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "meshName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitStatusLog" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "from" "UnitStatus" NOT NULL,
    "to" "UnitStatus" NOT NULL,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnitStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Typology" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bedrooms" INTEGER NOT NULL,
    "bathrooms" DOUBLE PRECISION NOT NULL,
    "areaSqmMin" DOUBLE PRECISION NOT NULL,
    "areaSqmMax" DOUBLE PRECISION NOT NULL,
    "descriptionMd" TEXT,
    "floorPlanSvgUrl" TEXT,
    "floorPlanPngUrl" TEXT,
    "glbUrl" TEXT,
    "frameSeqId" TEXT,

    CONSTRAINT "Typology_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaSet" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT,
    "typologyId" TEXT,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "MediaSetKind" NOT NULL,
    "cameraNote" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MediaSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "mediaSetId" TEXT NOT NULL,
    "timeState" "TimeState" NOT NULL,
    "role" "AssetRole" NOT NULL DEFAULT 'PRIMARY',
    "originalKey" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "variants" JSONB NOT NULL,
    "depthKey" TEXT,
    "thumbhash" TEXT NOT NULL,
    "dominantHex" TEXT,
    "altText" TEXT,
    "credit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoAsset" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "VideoKind" NOT NULL,
    "typologyId" TEXT,
    "posterKey" TEXT NOT NULL,
    "hlsKey" TEXT,
    "mp4Key" TEXT,
    "durationSec" DOUBLE PRECISION NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoChapter" (
    "id" TEXT NOT NULL,
    "videoAssetId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startSec" DOUBLE PRECISION NOT NULL,
    "thumbKey" TEXT,
    "linkedSceneId" TEXT,

    CONSTRAINT "VideoChapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FrameSequence" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "FrameSeqKind" NOT NULL,
    "frameCount" INTEGER NOT NULL,
    "ladders" JSONB NOT NULL,
    "loopable" BOOLEAN NOT NULL DEFAULT true,
    "hotspots" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FrameSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tour" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "typologyId" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startSceneId" TEXT,

    CONSTRAINT "Tour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scene" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "yawDeg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pitchDeg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fovDeg" DOUBLE PRECISION NOT NULL DEFAULT 70,
    "planX" DOUBLE PRECISION,
    "planY" DOUBLE PRECISION,
    "planRotDeg" DOUBLE PRECISION,

    CONSTRAINT "Scene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PanoramaAsset" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "timeState" "TimeState" NOT NULL,
    "previewKey" TEXT NOT NULL,
    "originalKey" TEXT NOT NULL,
    "tiles" JSONB NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,

    CONSTRAINT "PanoramaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hotspot" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "kind" "HotspotKind" NOT NULL,
    "yawDeg" DOUBLE PRECISION NOT NULL,
    "pitchDeg" DOUBLE PRECISION NOT NULL,
    "label" TEXT,
    "targetSceneId" TEXT,
    "infoMd" TEXT,
    "mediaAssetId" TEXT,

    CONSTRAINT "Hotspot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMilestone" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,
    "triggerType" "MilestoneTrigger" NOT NULL,
    "triggerDate" TIMESTAMP(3),
    "triggerNote" TEXT,

    CONSTRAINT "PaymentMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Amenity" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "descriptionMd" TEXT,
    "iconKey" TEXT,
    "mediaAssetId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Amenity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Landmark" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "LandmarkCategory" NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "distanceM" INTEGER,
    "driveMinutes" INTEGER,
    "walkMinutes" INTEGER,

    CONSTRAINT "Landmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enquiry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "countryIso" TEXT,
    "message" TEXT,
    "intent" "EnquiryIntent" NOT NULL DEFAULT 'INFORMATION',
    "source" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "referrer" TEXT,
    "landingPath" TEXT,
    "userAgent" TEXT,
    "status" "EnquiryStatus" NOT NULL DEFAULT 'NEW',
    "assignedTo" TEXT,
    "internalNote" TEXT,
    "verificationSkipped" BOOLEAN NOT NULL DEFAULT false,
    "purgeAfter" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnquiryUnit" (
    "enquiryId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,

    CONSTRAINT "EnquiryUnit_pkey" PRIMARY KEY ("enquiryId","unitId")
);

-- CreateTable
CREATE TABLE "ProgressUpdate" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "capturedOn" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "bodyMd" TEXT,
    "percentComplete" INTEGER,
    "mediaAssetIds" TEXT[],
    "splatUrl" TEXT,

    CONSTRAINT "ProgressUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Faq" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answerMd" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Faq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoMeta" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ogImageKey" TEXT,
    "keywords" TEXT[],

    CONSTRAINT "SeoMeta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaJob" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'SALES',
    "totpSecret" TEXT,
    "totpEnrolledAt" TIMESTAMP(3),
    "recoveryCodeHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "rowCount" INTEGER,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Development_slug_key" ON "Development"("slug");

-- CreateIndex
CREATE INDEX "Building_developmentId_idx" ON "Building"("developmentId");

-- CreateIndex
CREATE INDEX "Floor_buildingId_idx" ON "Floor"("buildingId");

-- CreateIndex
CREATE UNIQUE INDEX "Floor_buildingId_level_key" ON "Floor"("buildingId", "level");

-- CreateIndex
CREATE INDEX "Unit_status_idx" ON "Unit"("status");

-- CreateIndex
CREATE INDEX "Unit_typologyId_idx" ON "Unit"("typologyId");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_floorId_code_key" ON "Unit"("floorId", "code");

-- CreateIndex
CREATE INDEX "UnitStatusLog_unitId_idx" ON "UnitStatusLog"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "Typology_developmentId_slug_key" ON "Typology"("developmentId", "slug");

-- CreateIndex
CREATE INDEX "MediaSet_typologyId_idx" ON "MediaSet"("typologyId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaSet_developmentId_key_key" ON "MediaSet"("developmentId", "key");

-- CreateIndex
CREATE INDEX "MediaAsset_mediaSetId_idx" ON "MediaAsset"("mediaSetId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_mediaSetId_timeState_role_key" ON "MediaAsset"("mediaSetId", "timeState", "role");

-- CreateIndex
CREATE UNIQUE INDEX "VideoAsset_key_key" ON "VideoAsset"("key");

-- CreateIndex
CREATE INDEX "VideoChapter_videoAssetId_idx" ON "VideoChapter"("videoAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "FrameSequence_key_key" ON "FrameSequence"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Tour_developmentId_slug_key" ON "Tour"("developmentId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Scene_tourId_key_key" ON "Scene"("tourId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "PanoramaAsset_sceneId_timeState_key" ON "PanoramaAsset"("sceneId", "timeState");

-- CreateIndex
CREATE INDEX "Hotspot_sceneId_idx" ON "Hotspot"("sceneId");

-- CreateIndex
CREATE INDEX "PaymentMilestone_developmentId_idx" ON "PaymentMilestone"("developmentId");

-- CreateIndex
CREATE INDEX "Landmark_developmentId_idx" ON "Landmark"("developmentId");

-- CreateIndex
CREATE INDEX "Enquiry_status_idx" ON "Enquiry"("status");

-- CreateIndex
CREATE INDEX "Enquiry_createdAt_idx" ON "Enquiry"("createdAt");

-- CreateIndex
CREATE INDEX "Enquiry_purgeAfter_idx" ON "Enquiry"("purgeAfter");

-- CreateIndex
CREATE INDEX "ProgressUpdate_developmentId_capturedOn_idx" ON "ProgressUpdate"("developmentId", "capturedOn");

-- CreateIndex
CREATE UNIQUE INDEX "SeoMeta_developmentId_key" ON "SeoMeta"("developmentId");

-- CreateIndex
CREATE INDEX "MediaJob_status_idx" ON "MediaJob"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "AdminAuditLog_actorId_idx" ON "AdminAuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_action_createdAt_idx" ON "AdminAuditLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Floor" ADD CONSTRAINT "Floor_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_typologyId_fkey" FOREIGN KEY ("typologyId") REFERENCES "Typology"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitStatusLog" ADD CONSTRAINT "UnitStatusLog_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Typology" ADD CONSTRAINT "Typology_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaSet" ADD CONSTRAINT "MediaSet_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaSet" ADD CONSTRAINT "MediaSet_typologyId_fkey" FOREIGN KEY ("typologyId") REFERENCES "Typology"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_mediaSetId_fkey" FOREIGN KEY ("mediaSetId") REFERENCES "MediaSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoChapter" ADD CONSTRAINT "VideoChapter_videoAssetId_fkey" FOREIGN KEY ("videoAssetId") REFERENCES "VideoAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tour" ADD CONSTRAINT "Tour_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tour" ADD CONSTRAINT "Tour_typologyId_fkey" FOREIGN KEY ("typologyId") REFERENCES "Typology"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanoramaAsset" ADD CONSTRAINT "PanoramaAsset_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hotspot" ADD CONSTRAINT "Hotspot_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hotspot" ADD CONSTRAINT "Hotspot_targetSceneId_fkey" FOREIGN KEY ("targetSceneId") REFERENCES "Scene"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMilestone" ADD CONSTRAINT "PaymentMilestone_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Amenity" ADD CONSTRAINT "Amenity_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Landmark" ADD CONSTRAINT "Landmark_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnquiryUnit" ADD CONSTRAINT "EnquiryUnit_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnquiryUnit" ADD CONSTRAINT "EnquiryUnit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressUpdate" ADD CONSTRAINT "ProgressUpdate_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Faq" ADD CONSTRAINT "Faq_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoMeta" ADD CONSTRAINT "SeoMeta_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
