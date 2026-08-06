import { S3Client, CreateBucketCommand, HeadBucketCommand, PutBucketPolicyCommand, ListBucketsCommand } from '@aws-sdk/client-s3';
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
  console.log('--- SETUP BUCKET VIA S3 CLIENT ---');
  try {
    const list = await s3.send(new ListBucketsCommand({}));
    console.log('Buckets S3 existants:', list.Buckets);

    // Create bucket if not exists
    try {
      await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
      console.log(`Bucket ${bucketName} créé via S3 API.`);
    } catch (e) {
      console.log(`Bucket ${bucketName} existe déjà ou error:`, e.message);
    }

    // Set Public Policy for GET objects
    const publicPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'PublicReadGetObject',
          Effect: 'Allow',
          Principal: '*',
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${bucketName}/*`],
        },
      ],
    };

    try {
      await s3.send(
        new PutBucketPolicyCommand({
          Bucket: bucketName,
          Policy: JSON.stringify(publicPolicy),
        })
      );
      console.log('Politique publique s3:GetObject appliquée avec succès !');
    } catch (e) {
      console.log('Erreur application policy:', e.message);
    }
  } catch (err) {
    console.error('Erreur setup S3:', err);
  }
}

main();
