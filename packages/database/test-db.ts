import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const tracks = await prisma.track.findMany();
  console.log(tracks.map(t => t.audioUrl));
}
main().finally(() => prisma.$disconnect());
