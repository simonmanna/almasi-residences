import { prisma } from '@avida/db';

/**
 * §5.9 — enquiries are hard-deleted 24 months after their last status change.
 * `purgeAfter` is set on write and moved forward whenever the sales team
 * touches the row, so this only has to honour the column.
 *
 * Returns the count. The rows themselves are never logged: they are entirely
 * personal data, which is the reason this job exists.
 */
export async function purgeExpiredEnquiries(now: Date = new Date()): Promise<number> {
  const expired = await prisma.enquiry.findMany({
    where: { purgeAfter: { lt: now } },
    select: { id: true },
  });
  if (expired.length === 0) return 0;

  const ids = expired.map((e) => e.id);
  await prisma.$transaction([
    prisma.enquiryUnit.deleteMany({ where: { enquiryId: { in: ids } } }),
    prisma.enquiry.deleteMany({ where: { id: { in: ids } } }),
  ]);
  return ids.length;
}
