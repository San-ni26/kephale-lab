import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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
  const key = `test_public/sample_${Date.now()}.jpg`;
  const sampleJpg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');

  console.log('1. Upload d\'une image dans kephale-lab...');
  await s3.send(new PutObjectCommand({
    Bucket: 'kephale-lab',
    Key: key,
    Body: sampleJpg,
    ContentType: 'image/jpeg',
  }));

  const publicUrl = `https://aojtioctjqarqjifgnmn.supabase.co/storage/v1/object/public/kephale-lab/${key}`;
  console.log('2. Test de l\'URL publique :', publicUrl);

  const res = await fetch(publicUrl);
  console.log(`3. Réponse HTTP : ${res.status} ${res.statusText}, Content-Type: ${res.headers.get('content-type')}`);
  if (res.ok) {
    console.log('🎉 VICTOIRE : kephale-lab est bien le bucket PUBLIC de Supabase et l\'image est 100% visible et téléchargeable publiquement !');
  } else {
    console.log('Erreur :', await res.text());
  }
}

main().catch(console.error);
