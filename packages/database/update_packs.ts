import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updatePacks() {
  // Supprimer les anciens packs
  await prisma.tokenPack.deleteMany();

  // Taux de référence : 1 Jeton = 10 FCFA (0.015 EUR)
  const packs = [
    { tokens: 100, priceEur: 1.50, label: 'Starter', isBestValue: false },   // 1 000 FCFA
    { tokens: 500, priceEur: 7.50, label: 'Populaire', isBestValue: true },   // 5 000 FCFA
    { tokens: 1200, priceEur: 15.00, label: 'Pro', isBestValue: false },     // 10 000 FCFA (+200 offerts)
    { tokens: 3500, priceEur: 45.00, label: 'VIP', isBestValue: false },     // 30 000 FCFA (+500 offerts)
  ];

  for (const pack of packs) {
    await prisma.tokenPack.create({
      data: pack
    });
  }
  console.log('Nouveaux packs de jetons harmonisés et injectés avec succès !');
}

updatePacks().catch(console.error).finally(() => prisma.$disconnect());
