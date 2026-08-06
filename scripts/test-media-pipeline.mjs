import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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

async function runTest() {
  const testKey = `test_verification/ping_${Date.now()}.txt`;
  const testContent = 'Kephale Media Storage Verification OK - ' + new Date().toISOString();

  const putCommand = new PutObjectCommand({
    Bucket: bucketName,
    Key: testKey,
    ContentType: 'text/plain',
  });
  const presignedUploadUrl = await getSignedUrl(s3, putCommand, { expiresIn: 300 });

  const uploadRes = await fetch(presignedUploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain' },
    body: testContent,
  });

  console.log('Upload status:', uploadRes.status);

  // Direct fetch from Supabase public endpoint
  const publicUrl = `${process.env.S3_BUCKET_PUBLIC_URL}/${testKey}`;
  const fetchPublicRes = await fetch(publicUrl);
  console.log('Public URL status:', fetchPublicRes.status);
  const respBody = await fetchPublicRes.text();
  console.log('Public URL response body:', respBody);

  // Also test signed download URL
  const getCommand = new GetObjectCommand({
    Bucket: bucketName,
    Key: testKey,
  });
  const signedDownloadUrl = await getSignedUrl(s3, getCommand, { expiresIn: 300 });
  console.log('Signed download URL:', signedDownloadUrl);
  const fetchSignedRes = await fetch(signedDownloadUrl);
  console.log('Signed URL fetch status:', fetchSignedRes.status, await fetchSignedRes.text());
}

runTest().catch(console.error);
