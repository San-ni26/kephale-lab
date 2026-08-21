import { Injectable, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';

// ── MIME Type Whitelist ─────────────────────────────────────────────────────
// Only allow safe media MIME types to prevent malicious file hosting
const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  audio: [
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav',
    'audio/aac', 'audio/ogg', 'audio/flac', 'audio/x-flac', 'audio/mp4',
    'audio/x-m4a', 'audio/m4a', 'audio/webm', 'audio/3gpp', 'audio/3gpp2',
  ],
  video: [
    'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo',
    'video/x-matroska', 'video/webm', 'video/3gpp', 'video/3gpp2',
    'video/x-m4v', 'video/ogg', 'video/mov',
  ],
  image: [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    // Note: image/svg+xml intentionally excluded — SVG can contain JavaScript (XSS risk)
    'image/heic', 'image/heif', 'image/avif', 'image/bmp',
  ],
  document: [
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'text/csv', 'application/json', 'application/xml',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip', 'application/x-zip-compressed', 'application/octet-stream',
  ],
};

// Max file size per type (in bytes)
const MAX_FILE_SIZE: Record<string, number> = {
  audio: 200 * 1024 * 1024,    // 200 MB
  video: 2 * 1024 * 1024 * 1024, // 2 GB
  image: 20 * 1024 * 1024,     // 20 MB
  document: 50 * 1024 * 1024,  // 50 MB
};

@Injectable()
export class UploadService {
  constructor(private readonly configService: ConfigService) {}

  private getBucketName(): string {
    return (
      this.configService.get<string>('S3_BUCKET_NAME') ||
      this.configService.get<string>('AWS_S3_BUCKET') ||
      'kephale-media'
    );
  }

  private getS3ClientForRequest(requestHost?: string) {
    let endpoint = this.configService.get<string>('S3_ENDPOINT') || 'https://aojtioctjqarqjifgnmn.supabase.co/storage/v1/s3';
    if (requestHost && (endpoint.includes('localhost') || endpoint.includes('127.0.0.1'))) {
      const hostOnly = requestHost.split(':')[0];
      if (hostOnly && hostOnly !== 'localhost' && hostOnly !== '127.0.0.1') {
        endpoint = endpoint.replace('localhost', hostOnly).replace('127.0.0.1', hostOnly);
      }
    }

    return {
      client: new S3Client({
        region: this.configService.get<string>('AWS_REGION') || 'us-east-1',
        credentials: {
          accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID') || '',
          secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || '',
        },
        endpoint,
        forcePathStyle: true,
      }),
      endpoint,
    };
  }

  /**
   * Validate MIME type against whitelist to prevent malicious uploads
   */
  private validateMimeType(contentType: string, type: 'audio' | 'video' | 'image' | 'document'): void {
    const allowed = ALLOWED_MIME_TYPES[type];
    if (!allowed) {
      throw new BadRequestException({ success: false, error: { code: 'INVALID_TYPE', message: `Type de fichier inconnu: ${type}` } });
    }
    
    // Normalize content type (remove parameters like charset)
    const normalizedType = contentType.split(';')[0].trim().toLowerCase();
    
    if (!allowed.includes(normalizedType)) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'MIME_TYPE_NOT_ALLOWED',
          message: `Type MIME non autorisé: "${normalizedType}". Types acceptés pour ${type}: ${allowed.join(', ')}`,
        },
      });
    }
  }

  async generatePresignedUrl(
    userId: string,
    filename: string,
    contentType: string,
    type: 'audio' | 'video' | 'image' | 'document',
    requestHost?: string
  ) {
    // ── Security: Validate MIME type ──────────────────────────────────────────
    this.validateMimeType(contentType, type);

    // ── Security: Sanitize filename (no path traversal) ────────────────────────
    const safeFilename = filename
      .replace(/[^a-zA-Z0-9._-]/g, '_')  // Remove special chars
      .replace(/\.{2,}/g, '_')            // No double dots (path traversal)
      .substring(0, 255);                 // Max filename length

    const ext = safeFilename.split('.').pop()?.toLowerCase() || '';
    const uniqueId = crypto.randomBytes(16).toString('hex');
    const key = `${userId}/${type}s/${uniqueId}.${ext}`;
    const bucketName = this.getBucketName();

    try {
      const { client, endpoint } = this.getS3ClientForRequest(requestHost);

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        ContentType: contentType,
      });

      // Presigned URL valid for 1 hour
      const presignedUrl = await getSignedUrl(client, command, { expiresIn: 3600 });

      const bucketPublicUrl = this.configService.get<string>('S3_BUCKET_PUBLIC_URL');
      let publicUrl = bucketPublicUrl
        ? `${bucketPublicUrl}/${key}`
        : `${endpoint.replace(/\/s3$/, '')}/${bucketName}/${key}`;

      if (requestHost && (publicUrl.includes('localhost') || publicUrl.includes('127.0.0.1'))) {
        const hostOnly = requestHost.split(':')[0];
        if (hostOnly && hostOnly !== 'localhost' && hostOnly !== '127.0.0.1') {
          publicUrl = publicUrl.replace('localhost', hostOnly).replace('127.0.0.1', hostOnly);
        }
      }

      return {
        uploadUrl: presignedUrl,
        publicUrl,
        key,
        maxSizeBytes: MAX_FILE_SIZE[type],
      };
    } catch (error: any) {
      // Don't expose internal S3 errors to clients
      if (error instanceof BadRequestException) throw error;
      console.error('[Upload] Erreur génération URL pré-signée S3:', error?.message);
      throw new InternalServerErrorException({
        success: false,
        error: { code: 'UPLOAD_ERROR', message: 'Impossible de générer l\'URL d\'upload. Réessayez dans quelques instants.' },
      });
    }
  }
}

