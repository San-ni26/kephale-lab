import { PrismaClient } from '@kephale/database';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@kephale.com';
  const adminPassword = 'KephaleAdmin2026!';
  
  const user = await prisma.user.findFirst({
    where: { email: { equals: adminEmail, mode: 'insensitive' } }
  });

  if (!user) {
    console.log('User not found!');
  } else {
    console.log('User found:', user.email);
    console.log('Has password:', !!user.password);
    if (user.password) {
      const isValid = await bcrypt.compare(adminPassword, user.password);
      console.log('Password valid:', isValid);
    }
  }
}

main().finally(() => prisma.$disconnect());
