import { PrismaClient } from '@kephale/database';
const prisma = new PrismaClient();

async function main() {
  const likes = await prisma.like.findMany({ take: 5, include: { video: true } });
  console.log("Recent likes:", likes);
}
main();
