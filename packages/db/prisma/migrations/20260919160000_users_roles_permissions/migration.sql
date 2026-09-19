-- Users, roles & permissions: roles move from the AdminRole enum into a table
-- the business can edit, with per-permission data scopes, per-user overrides,
-- user status and profile fields, and approval requests.
--
-- Every existing account keeps its role: each enum value becomes a Role row
-- with the same key, and the API writes that role's default grants
-- (DEFAULT_ROLES in @avida/types) on its next start (Role.seededAt IS NULL).

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'INACTIVE');
CREATE TYPE "PermissionScope" AS ENUM ('NONE', 'OWN', 'ASSIGNED', 'TEAM', 'DEPARTMENT', 'ALL');
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 100,
    "seededAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "scope" "PermissionScope" NOT NULL DEFAULT 'ALL',

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permission")
);

CREATE TABLE "UserPermissionOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "scope" "PermissionScope" NOT NULL,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPermissionOverride_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserPermissionOverride_userId_permission_key" ON "UserPermissionOverride"("userId", "permission");

CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "developmentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "note" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ApprovalRequest_status_createdAt_idx" ON "ApprovalRequest"("status", "createdAt");
CREATE INDEX "ApprovalRequest_entity_entityId_idx" ON "ApprovalRequest"("entity", "entityId");
CREATE INDEX "ApprovalRequest_requestedById_idx" ON "ApprovalRequest"("requestedById");

-- The system roles. Names and grants are (re)written by the API from
-- DEFAULT_ROLES only while seededAt is null.
INSERT INTO "Role" ("id", "key", "name", "system", "position", "updatedAt") VALUES
  ('role_owner',            'OWNER',            'Owner / Director',     true, 10, CURRENT_TIMESTAMP),
  ('role_super_admin',      'SUPER_ADMIN',      'System Administrator', true, 20, CURRENT_TIMESTAMP),
  ('role_sales_manager',    'SALES_MANAGER',    'Sales Manager',        true, 30, CURRENT_TIMESTAMP),
  ('role_sales_agent',      'SALES_AGENT',      'Sales Agent',          true, 40, CURRENT_TIMESTAMP),
  ('role_marketing',        'MARKETING',        'Marketing Manager',    true, 50, CURRENT_TIMESTAMP),
  ('role_finance',          'FINANCE',          'Finance / Accounts',   true, 60, CURRENT_TIMESTAMP),
  ('role_viewer',           'VIEWER',           'Viewer / Auditor',     true, 70, CURRENT_TIMESTAMP),
  ('role_property_manager', 'PROPERTY_MANAGER', 'Property Manager',     true, 80, CURRENT_TIMESTAMP),
  ('role_content_manager',  'CONTENT_MANAGER',  'Content Manager',      true, 90, CURRENT_TIMESTAMP);

-- AdminUser: role enum → role row, plus status and profile.
ALTER TABLE "AdminUser"
  ADD COLUMN "roleId" TEXT,
  ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "department" TEXT,
  ADD COLUMN "jobTitle" TEXT,
  ADD COLUMN "managerId" TEXT,
  ADD COLUMN "lastActiveAt" TIMESTAMP(3),
  ADD COLUMN "deactivatedAt" TIMESTAMP(3);

UPDATE "AdminUser" SET "roleId" = 'role_' || lower("role"::text);
UPDATE "AdminUser" SET "status" = 'INACTIVE', "deactivatedAt" = "updatedAt" WHERE "active" = false;
UPDATE "AdminUser" SET "lastActiveAt" = "lastLoginAt";
UPDATE "AdminUser" SET "department" = CASE "role"::text
  WHEN 'SALES_MANAGER' THEN 'Sales'
  WHEN 'SALES_AGENT' THEN 'Sales'
  WHEN 'MARKETING' THEN 'Marketing'
  WHEN 'PROPERTY_MANAGER' THEN 'Property'
  WHEN 'CONTENT_MANAGER' THEN 'Marketing'
  WHEN 'SUPER_ADMIN' THEN 'IT'
  ELSE NULL END;

ALTER TABLE "AdminUser" ALTER COLUMN "roleId" SET NOT NULL;
ALTER TABLE "AdminUser" DROP COLUMN "role";
DROP TYPE "AdminRole";

CREATE INDEX "AdminUser_roleId_idx" ON "AdminUser"("roleId");
CREATE INDEX "AdminUser_status_idx" ON "AdminUser"("status");
CREATE INDEX "AdminUser_managerId_idx" ON "AdminUser"("managerId");

-- AddForeignKey
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserPermissionOverride" ADD CONSTRAINT "UserPermissionOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserPermissionOverride" ADD CONSTRAINT "UserPermissionOverride_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
