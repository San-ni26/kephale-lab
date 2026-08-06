const fs = require('fs');

let content = fs.readFileSync('apps/backend/src/audio-fingerprint/audio-fingerprint.service.ts', 'utf-8');

// Replace imports
content = content.replace(/import \{ prisma \} from '@kephale\/database';/, "import { PrismaClient } from '@kephale/database';\nimport { Injectable } from '@nestjs/common';\nimport { InjectRedis } from '@nestjs-modules/ioredis';\nimport Redis from 'ioredis';\nimport { S3Client } from '@aws-sdk/client-s3';");

content = content.replace(/import \{ s3Client, BUCKET_NAME \} from '\.\.\/lib\/s3\.js';/, "const BUCKET_NAME = process.env.AWS_S3_BUCKET || 'kephale-bucket';\n// Inject S3 later or initialize locally for now\nconst s3Client = new S3Client({ region: process.env.AWS_REGION || 'eu-west-3' });");

content = content.replace(/import \{ redis \} from '\.\.\/lib\/redis\.js';/, "");

// Replace class declaration
content = content.replace(/export class AudioFingerprintService \{/, `@Injectable()\nexport class AudioFingerprintService {\n  constructor(\n    private readonly prisma: PrismaClient,\n    @InjectRedis() private readonly redis: Redis\n  ) {}\n`);

// Replace public static
content = content.replace(/public static /g, 'public ');
content = content.replace(/private static /g, 'private ');

// Replace prisma. with this.prisma.
content = content.replace(/ prisma\./g, ' this.prisma.');
content = content.replace(/await prisma\./g, 'await this.prisma.');
content = content.replace(/prisma\$/g, 'this.prisma$');
content = content.replace(/prisma\./g, 'this.prisma.'); // catch all

// Replace redis. with this.redis.
content = content.replace(/ redis\./g, ' this.redis.');
content = content.replace(/await redis\./g, 'await this.redis.');

fs.writeFileSync('apps/backend/src/audio-fingerprint/audio-fingerprint.service.ts', content);
console.log('Done refactoring');
