import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';

dotenv.config({ path: '/Users/paulkone/Desktop/app/app-kephale/apps/backend/.env' });

const bucketName = process.env.S3_BUCKET_NAME || 'kephale-media';
const endpoint = process.env.S3_ENDPOINT || 'https://aojtioctjqarqjifgnmn.supabase.co/storage/v1/s3';

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

async function main() {
  const key = `test_user/images/test_${Date.now()}.jpg`;
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: 'image/jpeg',
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });
  console.log('✅ BUCKET CONFIGURÉ :', bucketName);
  console.log('✅ URL PRÉ-SIGNÉE GÉNÉRÉE :', uploadUrl);

  // Test an actual binary PUT request with fetch
  const sampleJpg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
  
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'image/jpeg',
    },
    body: sampleJpg,
  });

  console.log('✅ STATUT HTTP DE L\'ENVOI S3 :', res.status, res.statusText);
  if (res.ok) {
    console.log('🎉 SUCCÈS TOTAL : Le fichier est correctement déposé sur le bucket', bucketName);
  } else {
    console.error('❌ ÉCHEC :', await res.text());
  }
}

main().catch(console.error);
