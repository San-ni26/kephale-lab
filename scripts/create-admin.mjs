#!/usr/bin/env node
/**
 * Crée un compte administrateur Kephale
 * Usage: node create-admin.mjs
 */

import bcrypt from 'bcryptjs';
import pkg from '@prisma/client';
const { PrismaClient } = pkg;

const EMAIL    = 'admin@kephale.com';
const PASSWORD = 'KephaleAdmin2026!';
const NAME     = 'Admin Kephale';
const USERNAME = 'admin_kephale';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Création du compte admin Kephale...\n');

  // Vérifier si le compte existe déjà
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });

  if (existing) {
    // Mettre à jour le rôle et s'assurer qu'il est actif
    const updated = await prisma.user.update({
      where: { email: EMAIL },
      data: {
        role: 'ADMIN',
        isActive: true,
        password: await bcrypt.hash(PASSWORD, 12),
      },
    });
    console.log(`✅ Compte existant mis à jour en ADMIN :`);
    console.log(`   ID       : ${updated.id}`);
    console.log(`   Email    : ${updated.email}`);
    console.log(`   Rôle     : ${updated.role}`);
    console.log(`   Actif    : ${updated.isActive}`);
  } else {
    // Créer un nouveau compte admin
    const hashedPassword = await bcrypt.hash(PASSWORD, 12);
    const user = await prisma.user.create({
      data: {
        email: EMAIL,
        password: hashedPassword,
        name: NAME,
        username: USERNAME,
        role: 'ADMIN',
        isActive: true,
        subscription: {
          create: { tier: 'FREE', status: 'ACTIVE' }
        }
      },
    });
    console.log(`✅ Compte admin créé avec succès :`);
    console.log(`   ID       : ${user.id}`);
    console.log(`   Email    : ${user.email}`);
    console.log(`   Nom      : ${user.name}`);
    console.log(`   Rôle     : ${user.role}`);
  }

  console.log('\n─────────────────────────────────────────');
  console.log('🔑 Identifiants du tableau de bord admin :');
  console.log(`   URL      : http://localhost:5173`);
  console.log(`   Email    : ${EMAIL}`);
  console.log(`   Password : ${PASSWORD}`);
  console.log('─────────────────────────────────────────\n');
}

main()
  .catch(e => { console.error('❌ Erreur :', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
