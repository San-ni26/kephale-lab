import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const tracks = await prisma.track.findMany();
  console.log(tracks.map(t => ({ id: t.id, title: t.title, audioUrl: t.audioUrl })));
}
main().finally(() => prisma.$disconnect());
