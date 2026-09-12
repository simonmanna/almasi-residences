import { prisma } from './src/index.js';
try {
  const u = await prisma.adminUser.findUnique({ where: { email: 'owner@example.invalid' } });
  console.log('user:', u?.email, 'role:', u?.role);
  if (!u) console.log('No user found — seed may have failed for admin users');
} catch (e) {
  console.error('ERROR:', e.constructor.name);
  console.error(e.message?.slice(0, 500));
}
await prisma.$disconnect();