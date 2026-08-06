import { S3Client, ListBucketsCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
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

async function emptyBucket(bucketName) {
  console.log(`\n--- Vidage du bucket: ${bucketName} ---`);
  let continuationToken = undefined;
  let totalDeleted = 0;

  do {
    const listRes = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        ContinuationToken: continuationToken,
      })
    );

    const objects = listRes.Contents || [];
    if (objects.length === 0) {
      console.log(`Aucun objet restant dans ${bucketName}.`);
      break;
    }

    console.log(`Trouvé ${objects.length} objets à supprimer...`);
    const deleteParams = {
      Bucket: bucketName,
      Delete: {
        Objects: objects.map((obj) => ({ Key: obj.Key })),
        Quiet: false,
      },
    };

    const deleteRes = await s3.send(new DeleteObjectsCommand(deleteParams));
    const deletedCount = deleteRes.Deleted?.length || 0;
    totalDeleted += deletedCount;
    console.log(`Supprimé ${deletedCount} objets.`);

    if (deleteRes.Errors && deleteRes.Errors.length > 0) {
      console.error('Erreurs lors de la suppression:', deleteRes.Errors);
    }

    continuationToken = listRes.NextContinuationToken;
  } while (continuationToken);

  console.log(`Total supprimé pour ${bucketName}: ${totalDeleted} objets.`);
}

async function main() {
  try {
    console.log('Connexion à S3 / Supabase Storage via:', process.env.S3_ENDPOINT);
    let buckets = [];
    try {
      const bucketsRes = await s3.send(new ListBucketsCommand({}));
      buckets = bucketsRes.Buckets || [];
      console.log('Buckets détectés:', buckets.map(b => b.Name));
    } catch (e) {
      console.log('Impossible de lister tous les buckets globaux, utilisation du bucket par défaut.');
    }

    if (buckets.length === 0) {
      const targetBucket = process.env.S3_BUCKET_NAME || 'kephale-media';
      await emptyBucket(targetBucket);
    } else {
      for (const bucket of buckets) {
        await emptyBucket(bucket.Name);
      }
    }
    console.log('\n✅ Tous les objets du S3 Supabase ont été supprimés avec succès !');
  } catch (err) {
    console.error('❌ Erreur lors du vidage S3:', err);
  }
}

main();
