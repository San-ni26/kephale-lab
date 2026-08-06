import { PrismaClient } from '@kephale/database';
import dotenv from 'dotenv';

dotenv.config({ path: '/Users/paulkone/Desktop/app/app-kephale/apps/backend/.env' });

const prisma = new PrismaClient();

async function main() {
  console.log('--- RECHERCHE DES PROFILS ARTISTES EN BASE DE DONNÉES ---');
  const artists = await prisma.artistProfile.findMany({
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          role: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  console.log(`Nombre d'artistes trouvés : ${artists.length}`);
  for (const a of artists) {
    console.log({
      id: a.id,
      stageName: a.stageName,
      userEmail: a.user?.email,
      userAvatar: a.user?.avatar,
      artistAvatar: a.avatar,
      artistCoverImage: a.coverImage,
      createdAt: a.createdAt,
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
