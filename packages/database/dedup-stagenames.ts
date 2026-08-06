import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const artists = await prisma.artistProfile.findMany();
  const seen = new Set();
  
  for (const artist of artists) {
    let newName = artist.stageName;
    let counter = 1;
    while (seen.has(newName.toLowerCase())) {
      newName = `${artist.stageName} ${counter}`;
      counter++;
    }
    seen.add(newName.toLowerCase());
    
    if (newName !== artist.stageName) {
      await prisma.artistProfile.update({
        where: { id: artist.id },
        data: { stageName: newName }
      });
      console.log(`Updated duplicate stageName: ${artist.stageName} -> ${newName}`);
    }
  }
  console.log("Deduplication complete.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
