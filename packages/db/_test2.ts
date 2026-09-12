import db from '@avida/db';
const { prisma } = db;
async function main() {
  try {
    const u = await prisma.adminUser.findUnique({ where: { email: 'owner@example.invalid' } });
    console.log('user:', u?.email, 'role:', u?.role);
    if (!u) console.log('No user found');
    const count = await prisma.adminUser.count();
    console.log('total adminUsers:', count);
  } catch (e) {
    console.error('ERROR:', e.constructor.name, '-', e.message?.slice(0, 400));
  } finally {
    await prisma.$disconnect();
  }
}
main();