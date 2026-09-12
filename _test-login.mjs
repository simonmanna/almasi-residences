import db from '@avida/db';
const { prisma } = db;
try {
  const u = await prisma.adminUser.findUnique({ where: { email: 'owner@example.invalid' } });
  console.log('user:', u?.email, 'role:', u?.role);
} catch (e) {
  console.error('ERROR:', e.constructor.name);
  console.error(e.message?.slice(0, 500));
}
await prisma.$disconnect();