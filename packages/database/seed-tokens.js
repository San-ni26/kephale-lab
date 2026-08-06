const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding token packs...');
  await prisma.tokenPack.createMany({
    data: [
      { tokens: 100, priceEur: 1.5, label: 'Pack Découverte' },
      { tokens: 500, priceEur: 7.5, label: 'Pack Amateur', isBestValue: true },
      { tokens: 1000, priceEur: 14.0, label: 'Pack Pro' },
      { tokens: 5000, priceEur: 65.0, label: 'Pack Légende' }
    ],
    skipDuplicates: true
  });
  console.log('Token packs seeded successfully!');
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
