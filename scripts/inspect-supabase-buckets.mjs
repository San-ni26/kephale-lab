import { S3Client, ListBucketsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
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

async function main() {
  console.log('--- INSPECTION BUCKETS SUPABASE S3 ---');
  const buckets = await s3.send(new ListBucketsCommand({}));
  console.log('Buckets existants via S3 API :', buckets.Buckets);

  for (const b of buckets.Buckets || []) {
    console.log(`\nContenu du bucket "${b.Name}":`);
    const objects = await s3.send(new ListObjectsV2Command({ Bucket: b.Name }));
    console.log(`Nombre d'objets: ${objects.KeyCount}`);
    for (const obj of objects.Contents || []) {
      console.log(`- ${obj.Key} (${obj.Size} octets)`);
    }
  }
}

main().catch(console.error);
