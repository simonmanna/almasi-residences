const db = require('@avida/db');
async function main() {
  try {
    const prisma = db.prisma;
    const tables = await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
    console.log('TABLES:', tables.map((t) => t.tablename).join(', '));
    // Try model name
    const adminModels = await prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%admin%' OR table_name LIKE '%Admin%'`;
    console.log('ADMIN TABLES:', adminModels.map((t) => t.table_name).join(', '));
  } catch (e) {
    console.error('ERROR:', e.constructor.name, '-', e.message?.slice(0, 500));
  } finally {
    await prisma.$disconnect();
  }
}
main();