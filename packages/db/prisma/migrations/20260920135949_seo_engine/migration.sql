-- CreateEnum
CREATE TYPE "SeoEntityType" AS ENUM ('UNIT', 'TYPOLOGY', 'LOCATION_PAGE', 'POST', 'AMENITY', 'GALLERY', 'FLOOR');

-- AlterTable
ALTER TABLE "SeoMeta" ADD COLUMN     "bingVerification" TEXT,
ADD COLUMN     "ga4MeasurementId" TEXT,
ADD COLUMN     "gscVerification" TEXT,
ADD COLUMN     "gtmContainerId" TEXT,
ADD COLUMN     "organizationName" TEXT,
ADD COLUMN     "organizationType" TEXT NOT NULL DEFAULT 'Organization',
ADD COLUMN     "sameAs" TEXT[];

-- AlterTable
ALTER TABLE "VideoAsset" ADD COLUMN     "captionsKey" TEXT,
ADD COLUMN     "transcript" TEXT,
ADD COLUMN     "uploadDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SeoEntity" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "entityType" "SeoEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "slug" TEXT,
    "title" TEXT,
    "metaDescription" TEXT,
    "canonicalUrl" TEXT,
    "ogTitle" TEXT,
    "ogDescription" TEXT,
    "ogImageId" TEXT,
    "robotsIndex" BOOLEAN NOT NULL DEFAULT true,
    "robotsFollow" BOOLEAN NOT NULL DEFAULT true,
    "schemaType" TEXT,
    "keywords" TEXT[],
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Redirect" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "fromPath" TEXT NOT NULL,
    "toPath" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL DEFAULT 301,
    "reason" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "lastHitAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Redirect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationPage" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kicker" TEXT,
    "title" TEXT,
    "lede" TEXT,
    "body" TEXT,
    "locality" TEXT,
    "region" TEXT,
    "country" TEXT NOT NULL DEFAULT 'RW',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "categories" TEXT[],
    "heroImageId" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Guides',
    "tags" TEXT[],
    "authorName" TEXT,
    "readMinutes" INTEGER,
    "heroImageId" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeoEntity_developmentId_entityType_idx" ON "SeoEntity"("developmentId", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "SeoEntity_developmentId_entityType_entityId_key" ON "SeoEntity"("developmentId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "Redirect_developmentId_enabled_idx" ON "Redirect"("developmentId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "Redirect_developmentId_fromPath_key" ON "Redirect"("developmentId", "fromPath");

-- CreateIndex
CREATE INDEX "LocationPage_developmentId_published_idx" ON "LocationPage"("developmentId", "published");

-- CreateIndex
CREATE UNIQUE INDEX "LocationPage_developmentId_slug_key" ON "LocationPage"("developmentId", "slug");

-- CreateIndex
CREATE INDEX "Post_developmentId_published_publishedAt_idx" ON "Post"("developmentId", "published", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Post_developmentId_slug_key" ON "Post"("developmentId", "slug");

-- AddForeignKey
ALTER TABLE "SeoEntity" ADD CONSTRAINT "SeoEntity_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoEntity" ADD CONSTRAINT "SeoEntity_ogImageId_fkey" FOREIGN KEY ("ogImageId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redirect" ADD CONSTRAINT "Redirect_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPage" ADD CONSTRAINT "LocationPage_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPage" ADD CONSTRAINT "LocationPage_heroImageId_fkey" FOREIGN KEY ("heroImageId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_heroImageId_fkey" FOREIGN KEY ("heroImageId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
