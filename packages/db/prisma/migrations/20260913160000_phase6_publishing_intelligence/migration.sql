-- Phase 6: versioned page content, approval requests and scheduled publication.
CREATE TABLE "ContentRevision" (
  "id" TEXT NOT NULL,
  "developmentId" TEXT NOT NULL,
  "pageKey" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContentRevision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ContentRevision_developmentId_pageKey_createdAt_idx" ON "ContentRevision"("developmentId", "pageKey", "createdAt");

CREATE TABLE "PublicationSchedule" (
  "id" TEXT NOT NULL,
  "developmentId" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "runAt" TIMESTAMP(3) NOT NULL,
  "requestedById" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "lastError" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublicationSchedule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PublicationSchedule_status_runAt_idx" ON "PublicationSchedule"("status", "runAt");
CREATE INDEX "PublicationSchedule_developmentId_entity_entityId_idx" ON "PublicationSchedule"("developmentId", "entity", "entityId");

CREATE TABLE "PublicationApproval" (
  "id" TEXT NOT NULL,
  "developmentId" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "requestedById" TEXT NOT NULL,
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublicationApproval_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PublicationApproval_developmentId_status_createdAt_idx" ON "PublicationApproval"("developmentId", "status", "createdAt");
