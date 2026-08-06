import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

import { fileURLToPath } from 'url';

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = '/Users/paulkone/Desktop/app/app-kephale/musique';
const DEST_DIR = path.join(__dirname, '../../public/musique');

async function seedMusique() {
  console.log('Starting seed...');
  
  // Create destination directory if it doesn't exist
  if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR, { recursive: true });
  }

  // Create or get a dummy artist
  let user = await prisma.user.findFirst({ where: { email: 'artist@kephale.com' } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: 'artist@kephale.com',
        email: 'artist@kephale.com',
        name: 'Artiste Kephale',
        role: 'ARTIST'
      }
    });
  }

  let artist = await prisma.artistProfile.findFirst({ where: { userId: user.id } });
  if (!artist) {
    artist = await prisma.artistProfile.create({
      data: {
        userId: user.id,
        stageName: 'Dena Mwana & Co',
        bio: 'Artistes de la playlist',
        isVerified: true
      }
    });
  }

  // Read files from source directory
  const files = fs.readdirSync(SOURCE_DIR);
  const audioFiles = files.filter(f => f.endsWith('.m4a') || f.endsWith('.mp3'));
  
  console.log(`Found ${audioFiles.length} audio files.`);

  for (const file of audioFiles) {
    const safeName = uuidv4() + path.extname(file);
    const sourcePath = path.join(SOURCE_DIR, file);
    const destPath = path.join(DEST_DIR, safeName);
    
    // Copy file
    fs.copyFileSync(sourcePath, destPath);
    
    const title = file.replace(/\.(m4a|mp3)$/, '').substring(0, 50);

    // Insert to DB
    await prisma.track.create({
      data: {
        title: title,
        artistId: artist.id,
        duration: 300, // 5 mins dummy
        coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=500&q=80',
        audioUrl: `/static/musique/${safeName}`, // Served by fastify-static
        status: 'ACTIVE'
      }
    });
    console.log(`Inserted track: ${title}`);
  }

  console.log('Seed completed!');
}

seedMusique().catch(console.error).finally(() => prisma.$disconnect());
