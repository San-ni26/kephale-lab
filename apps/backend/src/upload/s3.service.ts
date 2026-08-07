import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * S3Service — Génère des URLs pré-signées à courte durée de vie pour la lecture sécurisée.
 *
 * SÉCURITÉ :
 * - Les URLs expirent après SIGNED_URL_TTL_SECONDS (défaut 60s)
 * - Impossible de partager une URL pour un accès permanent
 * - Chaque lecture nécessite une authentification + vérification d'accès côté backend
 */
@Injectable()
export class S3Service {
  /** Durée de vie des URLs signées (lecture) — 60 secondes */
  static readonly SIGNED_URL_TTL_SECONDS = 60;

  constructor(private readonly configService: ConfigService) {}

  private getS3Client(): S3Client {
    return new S3Client({
      region: this.configService.get<string>('AWS_REGION') || 'us-east-1',
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID') || '',
        secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || '',
      },
      endpoint: this.configService.get<string>('S3_ENDPOINT') || 'https://aojtioctjqarqjifgnmn.supabase.co/storage/v1/s3',
      forcePathStyle: true,
    });
  }

  private getBucketName(): string {
    return (
      this.configService.get<string>('S3_BUCKET_NAME') ||
      this.configService.get<string>('AWS_S3_BUCKET') ||
      'kephale-media'
    );
  }

  /**
   * Génère une URL pré-signée GET valide SIGNED_URL_TTL_SECONDS secondes.
   *
   * @param s3Key  Clé S3 du fichier (ex: "userId/audios/xxxx.mp3")
   * @returns      URL pré-signée à courte durée de vie
   */
  async getSignedDownloadUrl(s3Key: string): Promise<string> {
    const client = this.getS3Client();
    const command = new GetObjectCommand({
      Bucket: this.getBucketName(),
      Key: s3Key,
    });
    return getSignedUrl(client, command, {
      expiresIn: S3Service.SIGNED_URL_TTL_SECONDS,
    });
  }

  /**
   * Extrait la clé S3 depuis une URL publique S3/Supabase.
   * Utile quand seule l'URL complète est stockée (legacy).
   *
   * @param url  URL publique complète du fichier
   * @returns    Clé S3 ou null si non déductible
   */
  extractS3KeyFromUrl(url: string): string | null {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      // Supabase: /storage/v1/object/public/<bucket>/<key>
      const supabaseMatch = parsed.pathname.match(
        /\/storage\/v1\/object\/public\/[^/]+\/(.+)/
      );
      if (supabaseMatch) return supabaseMatch[1];

      // MinIO / AWS S3 path-style: /<bucket>/<key>
      const bucketName = this.getBucketName();
      const bucketMatch = parsed.pathname.match(
        new RegExp(`\\/${bucketName}\\/(.+)`)
      );
      if (bucketMatch) return bucketMatch[1];
    } catch {}
    return null;
  }
}
