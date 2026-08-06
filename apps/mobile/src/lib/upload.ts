import * as FileSystem from 'expo-file-system/legacy';
import { uploadAPI } from './api';

export interface UploadOptions {
  uri: string;
  type: 'image' | 'video' | 'audio' | 'document';
  filename?: string;
  contentType?: string;
  onProgress?: (progressPercent: number) => void;
}

export interface UploadResult {
  publicUrl: string;
  key: string;
  uploadUrl: string;
}

/**
 * Uploads a local file directly to Supabase S3 via a backend presigned URL.
 * Ensures BINARY_CONTENT transfer and strict HTTP 200/204 verification.
 */
export async function uploadToS3({
  uri,
  type,
  filename,
  contentType,
  onProgress,
}: UploadOptions): Promise<UploadResult> {
  if (!uri || !uri.startsWith('file://')) {
    // If it's already an HTTP URL (not a local file), return it directly
    if (uri && (uri.startsWith('http://') || uri.startsWith('https://'))) {
      return { publicUrl: uri, key: '', uploadUrl: '' };
    }
  }

  // 1. Verify that the local file actually exists
  const fileInfo = await FileSystem.getInfoAsync(uri);
  if (!fileInfo.exists) {
    throw new Error(`Le fichier sélectionné est introuvable sur l'appareil (${uri})`);
  }

  // 2. Determine file name and MIME type
  const rawExt = uri.split('.').pop()?.toLowerCase() || '';
  const ext = rawExt === 'jpg' ? 'jpeg' : rawExt || (type === 'image' ? 'jpeg' : type === 'video' ? 'mp4' : 'mp3');
  
  const finalFilename = filename || `${type}_${Date.now()}.${ext}`;

  let finalContentType = contentType;
  if (!finalContentType) {
    if (type === 'image') {
      finalContentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    } else if (type === 'video') {
      finalContentType = ext === 'mov' ? 'video/quicktime' : 'video/mp4';
    } else if (type === 'audio') {
      finalContentType = ext === 'wav' ? 'audio/wav' : ext === 'm4a' ? 'audio/m4a' : 'audio/mpeg';
    } else {
      finalContentType = 'application/octet-stream';
    }
  }

  // 3. Request presigned URL from Backend
  const presignedRes = await uploadAPI.getPresignedUrl({
    filename: finalFilename,
    contentType: finalContentType,
    type,
  });

  const { uploadUrl, publicUrl, key } = presignedRes.data.data;

  // 4. Upload binary stream directly to S3
  const uploadTask = FileSystem.createUploadTask(
    uploadUrl,
    uri,
    {
      httpMethod: 'PUT',
      headers: {
        'Content-Type': finalContentType,
      },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    },
    (progressData) => {
      if (onProgress && progressData.totalBytesExpectedToSend > 0) {
        const pct = (progressData.totalBytesSent / progressData.totalBytesExpectedToSend) * 100;
        onProgress(Math.min(Math.max(pct, 0), 100));
      }
    }
  );

  const result = await uploadTask.uploadAsync();

  if (!result || (result.status !== 200 && result.status !== 204)) {
    console.error('S3 Upload Failed:', result?.status, result?.body);
    throw new Error(`Échec de l'envoi du fichier vers le serveur S3 (Code HTTP: ${result?.status || 'Inconnu'})`);
  }

  return {
    publicUrl,
    key,
    uploadUrl,
  };
}
