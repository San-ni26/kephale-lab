import { PrismaClient } from '@kephale/database';

const prisma = new PrismaClient();

async function main() {
  console.log('--- RECHERCHE ARTISTES ET UTILISATEURS ---');
  const artists = await prisma.artistProfile.findMany({
    include: { user: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  for (const a of artists) {
    console.log(`\nArtiste: ${a.stageName} (ID: ${a.id})`);
    console.log(`User ID: ${a.userId}`);
    console.log(`Avatar URL: ${a.avatar}`);
    console.log(`Cover URL: ${a.coverImage}`);
    console.log(`User Avatar: ${a.user.avatar}`);

    if (a.avatar) {
      try {
        const res = await fetch(a.avatar);
        console.log(`-> Avatar HTTP Fetch: ${res.status} ${res.statusText} (Type: ${res.headers.get('content-type')})`);
        if (!res.ok) {
          console.log(`-> Erreur Body:`, (await res.text()).slice(0, 300));
        }
      } catch (e) {
        console.log(`-> Avatar Fetch Exception:`, e.message);
      }
    }

    if (a.coverImage) {
      try {
        const res = await fetch(a.coverImage);
        console.log(`-> Cover HTTP Fetch: ${res.status} ${res.statusText} (Type: ${res.headers.get('content-type')})`);
        if (!res.ok) {
          console.log(`-> Erreur Body:`, (await res.text()).slice(0, 300));
        }
      } catch (e) {
        console.log(`-> Cover Fetch Exception:`, e.message);
      }
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
