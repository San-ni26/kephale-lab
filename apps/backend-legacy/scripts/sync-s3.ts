import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import stream from 'stream';
import { promisify } from 'util';

const minioClient = new S3Client({
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'kephale_admin',
    secretAccessKey: 'kephale_dev_secret',
  },
  endpoint: 'http://localhost:9000',
  forcePathStyle: true,
});

const supabaseClient = new S3Client({
  region: 'us-east-1',
  credentials: {
    accessKeyId: '35873bb030c6d7c7c4efec7595f2b985',
    secretAccessKey: '3760bdbbeaf9e9c4a5ed45aa45250b64fc8a17640051149ffa9bff76419603c2',
  },
  endpoint: 'https://aojtioctjqarqjifgnmn.supabase.co/storage/v1/s3',
  forcePathStyle: true,
});

const BUCKET = 'kephale-media';

async function streamToBuffer(readable: stream.Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of readable) {
    chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function sync() {
  console.log('🔄 Starting migration from MinIO to Supabase...');
  try {
    let continuationToken: string | undefined = undefined;
    let totalCopied = 0;

    do {
      const listRes = await minioClient.send(new ListObjectsV2Command({
        Bucket: BUCKET,
        ContinuationToken: continuationToken,
      }));

      const objects = listRes.Contents || [];
      console.log(`📦 Found ${objects.length} objects in current batch.`);

      for (const obj of objects) {
        if (!obj.Key) continue;
        console.log(`➡️  Copying ${obj.Key} (${obj.Size} bytes)...`);
        
        // 1. Download from MinIO
        const getRes = await minioClient.send(new GetObjectCommand({
          Bucket: BUCKET,
          Key: obj.Key,
        }));
        
        if (!getRes.Body) {
          console.error(`❌ Could not read body for ${obj.Key}`);
          continue;
        }
        
        const buffer = await streamToBuffer(getRes.Body as stream.Readable);

        // 2. Upload to Supabase
        await supabaseClient.send(new PutObjectCommand({
          Bucket: BUCKET,
          Key: obj.Key,
          Body: buffer,
          ContentType: getRes.ContentType,
          ACL: 'public-read',
        }));
        
        console.log(`✅ Successfully copied ${obj.Key}`);
        totalCopied++;
      }

      continuationToken = listRes.NextContinuationToken;
    } while (continuationToken);

    console.log(`🎉 Migration complete! Copied ${totalCopied} files.`);
  } catch (err) {
    console.error('❌ Migration failed:', err);
  }
}

sync();
