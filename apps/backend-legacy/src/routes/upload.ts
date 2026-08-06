import { FastifyInstance } from 'fastify';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { BUCKET_NAME } from '../lib/s3.js';
import crypto from 'crypto';

function getS3ClientForRequest(requestHost?: string) {
  let endpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
  if (requestHost && (endpoint.includes('localhost') || endpoint.includes('127.0.0.1'))) {
    const hostOnly = requestHost.split(':')[0];
    if (hostOnly && hostOnly !== 'localhost' && hostOnly !== '127.0.0.1') {
      endpoint = endpoint.replace('localhost', hostOnly).replace('127.0.0.1', hostOnly);
    }
  }

  return {
    client: new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
      endpoint,
      forcePathStyle: true,
    }),
    endpoint,
  };
}

export async function uploadRoutes(fastify: FastifyInstance) {
  // Generate a presigned URL for direct client upload
  fastify.post('/presigned-url', { preValidation: [authenticate] }, async (request, reply) => {
    const user = request.user;
    
    const bodySchema = z.object({
      filename: z.string(),
      contentType: z.string(),
      type: z.enum(['audio', 'video', 'image', 'document']),
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } });
    }

    const { filename, contentType, type } = parsed.data;
    
    // Generate unique key
    const ext = filename.split('.').pop() || '';
    const uniqueId = crypto.randomBytes(16).toString('hex');
    const key = `${user.userId}/${type}s/${uniqueId}.${ext}`;

    try {
      const { client, endpoint } = getS3ClientForRequest(request.headers.host);

      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: contentType,
      });

      // URL valid for 15 minutes, signed with correct host IP
      const presignedUrl = await getSignedUrl(client, command, { expiresIn: 900 });

      let publicUrl = process.env.S3_BUCKET_PUBLIC_URL 
        ? `${process.env.S3_BUCKET_PUBLIC_URL}/${key}`
        : `${endpoint}/${BUCKET_NAME}/${key}`;

      if (request.headers.host && (publicUrl.includes('localhost') || publicUrl.includes('127.0.0.1'))) {
        const hostOnly = request.headers.host.split(':')[0];
        if (hostOnly && hostOnly !== 'localhost' && hostOnly !== '127.0.0.1') {
          publicUrl = publicUrl.replace('localhost', hostOnly).replace('127.0.0.1', hostOnly);
        }
      }

      return reply.send({
        success: true,
        data: {
          uploadUrl: presignedUrl,
          publicUrl: publicUrl,
          key,
        },
      });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'UPLOAD_ERROR', message: 'Failed to generate upload URL' } });
    }
  });
}
