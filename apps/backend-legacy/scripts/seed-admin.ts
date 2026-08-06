import { PrismaClient } from '@kephale/database';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Admin account...');

  const adminEmail = 'admin@kephale.com';
  const adminPassword = 'Admin1234';
  
  // Hash password
  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  // Upsert the admin user
  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      password: hashedPassword,
      role: 'ADMIN',
      isActive: true,
    },
    create: {
      email: adminEmail,
      password: hashedPassword,
      name: 'Administrateur Kephale',
      role: 'ADMIN',
      isActive: true,
      preferredCurrency: 'XOF',
    },
  });

  console.log(`Admin user created/updated: ${adminUser.email}`);

  // Create Kephale Archives profile if not exists
  const archiveArtist = await prisma.artistProfile.upsert({
    where: { userId: adminUser.id },
    update: {
      stageName: 'Kephale Archives',
    },
    create: {
      userId: adminUser.id,
      stageName: 'Kephale Archives',
      bio: 'Profil système de conservation des droits d\'auteur.',
      country: 'SN',
      isActive: false, // Don't show in standard searches
    }
  });

  console.log(`System Artist Profile created/updated: ${archiveArtist.stageName}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
