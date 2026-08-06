import { S3Client, PutObjectCommand, CopyObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { PrismaClient } from '@kephale/database';
import dotenv from 'dotenv';

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
  console.log('--- VERIFICATION DU STATUT PUBLIC DU BUCKET kephale-media ---');

  // 1. Tester un upload et fetch public sur kephale-media
  const testKey = `test_verification/test_${Date.now()}.jpg`;
  const sampleJpg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');

  await s3.send(new PutObjectCommand({
    Bucket: 'kephale-media',
    Key: testKey,
    Body: sampleJpg,
    ContentType: 'image/jpeg',
  }));

  const testPublicUrl = `https://aojtioctjqarqjifgnmn.supabase.co/storage/v1/object/public/kephale-media/${testKey}`;
  const res = await fetch(testPublicUrl);
  console.log(`Test Public URL: ${testPublicUrl}`);
  console.log(`Statut HTTP: ${res.status} ${res.statusText}, Content-Type: ${res.headers.get('content-type')}`);

  if (res.ok) {
    console.log('🎉 CONFIRMÉ : kephale-media est maintenant 100% PUBLIC !');
  } else {
    console.log('Réponse Supabase :', await res.text());
  }

  // 2. Synchroniser tous les fichiers de kephale-lab vers kephale-media
  console.log('\n--- COPIE DE TOUS LES FICHIERS VERS kephale-media ---');
  const labList = await s3.send(new ListObjectsV2Command({ Bucket: 'kephale-lab' }));
  for (const obj of labList.Contents || []) {
    console.log(`Synchronisation de ${obj.Key}...`);
    await s3.send(new CopyObjectCommand({
      CopySource: `kephale-lab/${obj.Key}`,
      Bucket: 'kephale-media',
      Key: obj.Key,
    }));
  }
  console.log('✅ Tous les objets synchronisés dans kephale-media.');

  // 3. Mettre à jour la base de données vers kephale-media
  console.log('\n--- MISE A JOUR DES URLS EN BASE DE DONNEES ---');
  const artists = await prisma.artistProfile.findMany();
  for (const a of artists) {
    const newAvatar = a.avatar ? a.avatar.replace('/kephale-lab/', '/kephale-media/') : a.avatar;
    const newCover = a.coverImage ? a.coverImage.replace('/kephale-lab/', '/kephale-media/') : a.coverImage;
    await prisma.artistProfile.update({
      where: { id: a.id },
      data: { avatar: newAvatar, coverImage: newCover },
    });
  }

  const users = await prisma.user.findMany();
  for (const u of users) {
    if (u.avatar && u.avatar.includes('/kephale-lab/')) {
      const newAvatar = u.avatar.replace('/kephale-lab/', '/kephale-media/');
      await prisma.user.update({
        where: { id: u.id },
        data: { avatar: newAvatar },
      });
    }
  }

  const albums = await prisma.album.findMany();
  for (const alb of albums) {
    if (alb.coverUrl && alb.coverUrl.includes('/kephale-lab/')) {
      await prisma.album.update({
        where: { id: alb.id },
        data: { coverUrl: alb.coverUrl.replace('/kephale-lab/', '/kephale-media/') },
      });
    }
  }

  const tracks = await prisma.track.findMany();
  for (const t of tracks) {
    const newCover = t.coverUrl ? t.coverUrl.replace('/kephale-lab/', '/kephale-media/') : t.coverUrl;
    const newAudio = t.audioUrl ? t.audioUrl.replace('/kephale-lab/', '/kephale-media/') : t.audioUrl;
    await prisma.track.update({
      where: { id: t.id },
      data: { coverUrl: newCover, audioUrl: newAudio },
    });
  }

  const videos = await prisma.video.findMany();
  for (const v of videos) {
    const newVideo = v.videoUrl ? v.videoUrl.replace('/kephale-lab/', '/kephale-media/') : v.videoUrl;
    const newThumb = v.thumbnailUrl ? v.thumbnailUrl.replace('/kephale-lab/', '/kephale-media/') : v.thumbnailUrl;
    await prisma.video.update({
      where: { id: v.id },
      data: { videoUrl: newVideo, thumbnailUrl: newThumb },
    });
  }

  console.log('✅ Base de données migrée avec succès vers kephale-media !');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
