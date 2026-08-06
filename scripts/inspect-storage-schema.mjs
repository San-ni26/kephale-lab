import { PrismaClient } from '@kephale/database';

const prisma = new PrismaClient();

async function main() {
  console.log('--- INSPECTION DE LA TABLE storage.buckets ---');
  const buckets = await prisma.$queryRawUnsafe(`SELECT * FROM storage.buckets;`);
  console.log('Buckets dans PostgreSQL storage.buckets :', buckets);
}

main().catch(console.error).finally(() => prisma.$disconnect());
