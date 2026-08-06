import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedPacks() {
  const packs = [
    { tokens: 50, priceEur: 5, label: 'Débutant', isBestValue: false },
    { tokens: 120, priceEur: 10, label: 'Standard', isBestValue: true },
    { tokens: 300, priceEur: 25, label: 'Premium', isBestValue: false },
    { tokens: 1000, priceEur: 75, label: 'VIP', isBestValue: false },
  ];

  for (const pack of packs) {
    await prisma.tokenPack.create({
      data: pack
    });
  }
  console.log('Packs injectés avec succès !');
}

seedPacks().catch(console.error).finally(() => prisma.$disconnect());
