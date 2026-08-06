import { PrismaClient } from '@kephale/database';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Token Packs...');

  const packs = [
    {
      tokens: 100,
      priceEur: 5,
      label: 'Starter',
      isBestValue: false,
    },
    {
      tokens: 250,
      priceEur: 10,
      label: 'Popular',
      isBestValue: true,
    },
    {
      tokens: 1000,
      priceEur: 30,
      label: 'VIP',
      isBestValue: false,
    }
  ];

  for (const pack of packs) {
    const existing = await prisma.tokenPack.findFirst({
      where: { tokens: pack.tokens }
    });
    
    if (!existing) {
      await prisma.tokenPack.create({
        data: pack
      });
      console.log(`Created pack: ${pack.label} (${pack.tokens} jetons)`);
    } else {
      console.log(`Pack already exists: ${pack.label}`);
    }
  }

  console.log('Token Packs seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
