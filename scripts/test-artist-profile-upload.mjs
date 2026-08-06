import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { PrismaClient } from '@kephale/database';
import dotenv from 'dotenv';

dotenv.config({ path: '/Users/paulkone/Desktop/app/app-kephale/apps/backend/.env' });

const bucketName = process.env.S3_BUCKET_NAME || 'kephale-media';
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
  console.log('--- TEST COMPLET UPLOAD & LECTURE AVATAR/BANNIERE ARTISTE ---');
  
  // 1. Find the artist in DB
  const artist = await prisma.artistProfile.findFirst({
    include: { user: true },
  });

  if (!artist) {
    console.log('Aucun artiste trouvé en DB');
    return;
  }

  console.log(`Artiste trouvé : ${artist.stageName} (ID: ${artist.id}, User: ${artist.userId})`);

  // 2. Simulate upload of sample image for avatar and cover
  const avatarKey = `${artist.userId}/images/avatar_${Date.now()}.jpg`;
  const coverKey = `${artist.userId}/images/cover_${Date.now()}.jpg`;

  // 1x1 dummy JPEG buffer
  const sampleJpg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');

  console.log(`1. Upload Avatar vers S3: ${avatarKey}`);
  await s3.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: avatarKey,
    Body: sampleJpg,
    ContentType: 'image/jpeg',
  }));

  console.log(`2. Upload Bannière vers S3: ${coverKey}`);
  await s3.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: coverKey,
    Body: sampleJpg,
    ContentType: 'image/jpeg',
  }));

  // Verify objects exist in S3
  const headAvatar = await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: avatarKey }));
  const headCover = await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: coverKey }));
  console.log(`✅ Fichiers confirmés sur S3 ! (Avatar: ${headAvatar.ContentLength} octets, Cover: ${headCover.ContentLength} octets)`);

  // 3. Update DB artist profile with valid public URLs
  const supabaseBaseUrl = process.env.S3_ENDPOINT?.replace(/\/s3$/, '') || 'https://aojtioctjqarqjifgnmn.supabase.co/storage/v1/object/public';
  const publicAvatarUrl = `${supabaseBaseUrl}/${bucketName}/${avatarKey}`;
  const publicCoverUrl = `${supabaseBaseUrl}/${bucketName}/${coverKey}`;

  await prisma.artistProfile.update({
    where: { id: artist.id },
    data: {
      avatar: publicAvatarUrl,
      coverImage: publicCoverUrl,
    },
  });

  await prisma.user.update({
    where: { id: artist.userId },
    data: {
      avatar: publicAvatarUrl,
    },
  });

  console.log('✅ Profil artiste et utilisateur mis à jour avec succès en DB :');
  console.log('- Avatar URL :', publicAvatarUrl);
  console.log('- Cover URL  :', publicCoverUrl);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
