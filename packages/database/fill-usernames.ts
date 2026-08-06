import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { username: null as any }
  });
  
  const seen = new Set();
  const existingUsers = await prisma.user.findMany({
    where: { username: { not: null as any } }
  });
  for (const eu of existingUsers) {
    if (eu.username) seen.add(eu.username.toLowerCase());
  }

  for (const user of users) {
    let base = '@' + user.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (base === '@') base = '@user';
    
    let newName = base;
    let counter = 1;
    while (seen.has(newName)) {
      newName = `${base}${counter}`;
      counter++;
    }
    seen.add(newName);
    
    await prisma.user.update({
      where: { id: user.id },
      data: { username: newName }
    });
    console.log(`Updated user ${user.email} -> ${newName}`);
  }
  console.log("Username fill complete.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
