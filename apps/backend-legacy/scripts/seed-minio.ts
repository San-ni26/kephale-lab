import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand, CreateBucketCommand, HeadBucketCommand, PutBucketPolicyCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = '/Users/paulkone/Desktop/app/app-kephale/musique';
const BUCKET_NAME = 'kephale-audio';
const MINIO_URL = 'http://localhost:9000';
const PUBLIC_MINIO_URL = 'http://172.20.10.3:9000';

const s3 = new S3Client({
  endpoint: MINIO_URL,
  region: 'us-east-1', // MinIO doesn't care but AWS SDK requires it
  credentials: {
    accessKeyId: 'kephale_admin',
    secretAccessKey: 'kephale_dev_secret'
  },
  forcePathStyle: true // Important for MinIO (uses /bucket/key instead of bucket.endpoint/key)
});

async function setupBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    console.log(`Bucket ${BUCKET_NAME} already exists.`);
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      console.log(`Creating bucket ${BUCKET_NAME}...`);
      await s3.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
      
      // Make bucket public read
      const policy = {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: "*",
            Action: ["s3:GetObject"],
            Resource: [`arn:aws:s3:::${BUCKET_NAME}/*`]
          }
        ]
      };
      
      await s3.send(new PutBucketPolicyCommand({
        Bucket: BUCKET_NAME,
        Policy: JSON.stringify(policy)
      }));
      console.log(`Bucket ${BUCKET_NAME} created and made public.`);
    } else {
      throw error;
    }
  }
}

async function seedMinio() {
  console.log('Starting MinIO seed...');
  await setupBucket();

  // Create or get a dummy artist
  let user = await prisma.user.findFirst({ where: { email: 'artist@kephale.com' } });
  if (!user) {
    user = await prisma.user.create({
      data: {
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

  // Clear existing tracks to avoid duplicates
  await prisma.track.deleteMany({});
  console.log('Cleared existing tracks.');

  const files = fs.readdirSync(SOURCE_DIR);
  const audioFiles = files.filter(f => f.endsWith('.m4a') || f.endsWith('.mp3'));
  
  console.log(`Found ${audioFiles.length} audio files to upload...`);

  for (const file of audioFiles) {
    const safeName = uuidv4() + path.extname(file);
    const sourcePath = path.join(SOURCE_DIR, file);
    const fileStream = fs.createReadStream(sourcePath);
    const contentType = file.endsWith('.m4a') ? 'audio/mp4' : 'audio/mpeg';
    
    // Upload to MinIO
    console.log(`Uploading ${file}...`);
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: safeName,
      Body: fileStream,
      ContentType: contentType
    }));
    
    const title = file.replace(/\.(m4a|mp3)$/, '').substring(0, 50);
    const audioUrl = `${PUBLIC_MINIO_URL}/${BUCKET_NAME}/${safeName}`;

    // Insert to DB
    await prisma.track.create({
      data: {
        title: title,
        artistId: artist.id,
        duration: 300,
        coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=500&q=80',
        audioUrl: audioUrl,
        status: 'ACTIVE'
      }
    });
    console.log(`Inserted track: ${title}`);
  }

  console.log('MinIO Seed completed successfully!');
}

seedMinio().catch(console.error).finally(() => prisma.$disconnect());
