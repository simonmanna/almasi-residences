-- AlterEnum
-- The sales pipeline is restated as Available / Reserved / Booked / Sold.
-- ON_HOLD (a sale in negotiation) becomes BOOKED; OCCUPIED (a sold home that is
-- lived in) collapses back into SOLD, since occupancy is tracked by Residency.
-- UNAVAILABLE survives as a withheld-inventory value that no UI offers.
BEGIN;
CREATE TYPE "UnitStatus_new" AS ENUM ('AVAILABLE', 'RESERVED', 'BOOKED', 'SOLD', 'UNAVAILABLE');
ALTER TABLE "public"."Unit" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."Reservation" ALTER COLUMN "previousStatus" DROP DEFAULT;
ALTER TABLE "Unit" ALTER COLUMN "status" TYPE "UnitStatus_new" USING (
  CASE "status"::text WHEN 'ON_HOLD' THEN 'BOOKED' WHEN 'OCCUPIED' THEN 'SOLD' ELSE "status"::text END
)::"UnitStatus_new";
ALTER TABLE "UnitStatusLog" ALTER COLUMN "from" TYPE "UnitStatus_new" USING (
  CASE "from"::text WHEN 'ON_HOLD' THEN 'BOOKED' WHEN 'OCCUPIED' THEN 'SOLD' ELSE "from"::text END
)::"UnitStatus_new";
ALTER TABLE "UnitStatusLog" ALTER COLUMN "to" TYPE "UnitStatus_new" USING (
  CASE "to"::text WHEN 'ON_HOLD' THEN 'BOOKED' WHEN 'OCCUPIED' THEN 'SOLD' ELSE "to"::text END
)::"UnitStatus_new";
ALTER TABLE "Reservation" ALTER COLUMN "previousStatus" TYPE "UnitStatus_new" USING (
  CASE "previousStatus"::text WHEN 'ON_HOLD' THEN 'BOOKED' WHEN 'OCCUPIED' THEN 'SOLD' ELSE "previousStatus"::text END
)::"UnitStatus_new";
ALTER TYPE "UnitStatus" RENAME TO "UnitStatus_old";
ALTER TYPE "UnitStatus_new" RENAME TO "UnitStatus";
DROP TYPE "public"."UnitStatus_old";
ALTER TABLE "Unit" ALTER COLUMN "status" SET DEFAULT 'AVAILABLE';
ALTER TABLE "Reservation" ALTER COLUMN "previousStatus" SET DEFAULT 'AVAILABLE';
COMMIT;

-- A UnitStatusLog row whose from and to collapsed onto the same value is no
-- longer a transition, so it would render as a no-op entry in the history.
DELETE FROM "UnitStatusLog" WHERE "from" = "to";
