import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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

const key = 'cmsetr6ut000ib2pyu9i7l2j7/images/f5b71319bbf4f39c78d09854705c3c0b.jpg';
const bucket = 'kephale-media';

async function testUrl(label, url, headers = {}) {
  try {
    const res = await fetch(url, { headers });
    console.log(`[${label}] Status: ${res.status} ${res.statusText}, Content-Type: ${res.headers.get('content-type')}`);
    if (!res.ok) {
      const text = await res.text();
      console.log(`   -> Reponse: ${text.slice(0, 200)}`);
    } else {
      const buf = await res.arrayBuffer();
      console.log(`   -> SUCCESS! Image récupérée (${buf.byteLength} octets)`);
    }
  } catch (e) {
    console.log(`[${label}] Erreur: ${e.message}`);
  }
}

async function main() {
  console.log('--- TEST DES DIFFERENTS FORMATS D\'URL SUPABASE STORAGE ---');

  // Format 1: Public object
  await testUrl('Public Object', `https://aojtioctjqarqjifgnmn.supabase.co/storage/v1/object/public/${bucket}/${key}`);

  // Format 2: Direct object
  await testUrl('Direct Object', `https://aojtioctjqarqjifgnmn.supabase.co/storage/v1/object/${bucket}/${key}`);

  // Format 3: Direct object with anon key / service key if available
  // Format 4: S3 presigned GET URL
  const getCmd = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  const presignedGetUrl = await getSignedUrl(s3, getCmd, { expiresIn: 3600 });
  await testUrl('S3 Presigned GET', presignedGetUrl);

  // Format 5: Check Supabase bucket listing via REST
  await testUrl('Supabase REST Buckets', `https://aojtioctjqarqjifgnmn.supabase.co/storage/v1/bucket`);
}

main().catch(console.error);
