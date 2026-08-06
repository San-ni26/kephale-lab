import { S3Client, HeadBucketCommand, CreateBucketCommand, PutBucketPolicyCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const isDev = process.env.NODE_ENV === 'development';

export const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: true, // Needed for MinIO
});

export const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'kephale-media';

export async function ensureBucketExists() {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    console.log(`[S3] Bucket "${BUCKET_NAME}" already exists.`);
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404 || error.name === 'Forbidden' || error.$metadata?.httpStatusCode === 403) {
      console.log(`[S3] Bucket "${BUCKET_NAME}" not found or forbidden. Attempting to create it...`);
      try {
        await s3Client.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
        console.log(`[S3] Bucket "${BUCKET_NAME}" created successfully.`);

        // Set bucket policy to allow public read access
        const policy = {
          Version: '2012-10-17',
          Statement: [
            {
              Sid: 'PublicReadGetObject',
              Effect: 'Allow',
              Principal: '*',
              Action: 's3:GetObject',
              Resource: `arn:aws:s3:::${BUCKET_NAME}/*`,
            },
          ],
        };
        await s3Client.send(
          new PutBucketPolicyCommand({
            Bucket: BUCKET_NAME,
            Policy: JSON.stringify(policy),
          })
        );
        console.log(`[S3] Bucket "${BUCKET_NAME}" policy set to public read.`);
      } catch (createError: any) {
        if (createError.name === 'BucketAlreadyExists' || createError.name === 'BucketAlreadyOwnedByYou') {
          console.log(`[S3] Bucket "${BUCKET_NAME}" already exists (caught during creation).`);
        } else {
          console.error(`[S3] Error creating bucket "${BUCKET_NAME}":`, createError);
        }
      }
    } else {
      console.error(`[S3] Error checking bucket "${BUCKET_NAME}":`, error);
    }
  }
}
