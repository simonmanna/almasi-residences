-- Session revocation (roadmap phase 0, item 12).
-- Every session token carries the account's tokenVersion. Bumping the column
-- invalidates every token issued before it, which is what a password change
-- must do and what "sign out everywhere" needs.
ALTER TABLE "AdminUser" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
