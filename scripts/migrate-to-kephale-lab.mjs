import { S3Client, ListObjectsV2Command, CopyObjectCommand } from '@aws-sdk/client-s3';
import { PrismaClient } from '@kephale/database';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '/Users/paulkone/Desktop/app/app-kephale/apps/backend/.env' });

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const prisma = new PrismaClient();

async function main() {
  console.log('--- MIGRATION VERS LE BUCKET PUBLIC kephale-lab ---');

  // 1. Copier tous les objets de kephale-media vers kephale-lab
  const list = await s3.send(new ListObjectsV2Command({ Bucket: 'kephale-media' }));
  for (const obj of list.Contents || []) {
    console.log(`Copie de ${obj.Key} vers kephale-lab...`);
    await s3.send(new CopyObjectCommand({
      CopySource: `kephale-media/${obj.Key}`,
      Bucket: 'kephale-lab',
      Key: obj.Key,
    }));
  }
  console.log('✅ Tous les objets S3 ont été copiés dans kephale-lab.');

  // 2. Mettre à jour les URLs en Base de Données
  const artists = await prisma.artistProfile.findMany();
  for (const a of artists) {
    const newAvatar = a.avatar ? a.avatar.replace('/kephale-media/', '/kephale-lab/') : a.avatar;
    const newCover = a.coverImage ? a.coverImage.replace('/kephale-media/', '/kephale-lab/') : a.coverImage;
    await prisma.artistProfile.update({
      where: { id: a.id },
      data: { avatar: newAvatar, coverImage: newCover },
    });
  }

  const users = await prisma.user.findMany();
  for (const u of users) {
    if (u.avatar && u.avatar.includes('/kephale-media/')) {
      const newAvatar = u.avatar.replace('/kephale-media/', '/kephale-lab/');
      await prisma.user.update({
        where: { id: u.id },
        data: { avatar: newAvatar },
      });
    }
  }

  const albums = await prisma.album.findMany();
  for (const alb of albums) {
    if (alb.coverUrl && alb.coverUrl.includes('/kephale-media/')) {
      await prisma.album.update({
        where: { id: alb.id },
        data: { coverUrl: alb.coverUrl.replace('/kephale-media/', '/kephale-lab/') },
      });
    }
  }

  const tracks = await prisma.track.findMany();
  for (const t of tracks) {
    const newCover = t.coverUrl ? t.coverUrl.replace('/kephale-media/', '/kephale-lab/') : t.coverUrl;
    const newAudio = t.audioUrl ? t.audioUrl.replace('/kephale-media/', '/kephale-lab/') : t.audioUrl;
    await prisma.track.update({
      where: { id: t.id },
      data: { coverUrl: newCover, audioUrl: newAudio },
    });
  }

  const videos = await prisma.video.findMany();
  for (const v of videos) {
    const newVideo = v.videoUrl ? v.videoUrl.replace('/kephale-media/', '/kephale-lab/') : v.videoUrl;
    const newThumb = v.thumbnailUrl ? v.thumbnailUrl.replace('/kephale-media/', '/kephale-lab/') : v.thumbnailUrl;
    await prisma.video.update({
      where: { id: v.id },
      data: { videoUrl: newVideo, thumbnailUrl: newThumb },
    });
  }

  console.log('✅ Base de données mise à jour avec les URLs kephale-lab.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
