import { S3Client, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
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

async function main() {
  console.log('--- LISTING OBJETS DANS BUCKET S3 ---');
  const res = await s3.send(new ListObjectsV2Command({ Bucket: bucketName }));
  console.log(`Nombre total d'objets dans ${bucketName} : ${res.KeyCount}`);
  if (res.Contents) {
    for (const item of res.Contents) {
      console.log(`- ${item.Key} (${item.Size} octets, modifié le ${item.LastModified})`);
    }
  } else {
    console.log('Aucun objet trouvé dans le bucket !');
  }

  // Check specific keys
  const avatarKey = 'cmset7w6p000ab2pyr1lsirai/images/b99c311d7b4361ed93fbd1f07d111b3f.jpg';
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: avatarKey }));
    console.log('Avatar key existe dans S3 ! Taille:', head.ContentLength, 'Type:', head.ContentType);
  } catch (e) {
    console.log('Avatar key NON trouvée dans S3:', e.message);
  }
}

main().catch(console.error);
