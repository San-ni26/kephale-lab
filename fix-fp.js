const fs = require('fs');

let content = fs.readFileSync('apps/backend/src/audio-fingerprint/audio-fingerprint.service.ts', 'utf-8');

// Fix this.this.prisma
content = content.replace(/this\.this\.prisma/g, 'this.prisma');

// Fix Redis injection
content = content.replace(/import \{ InjectRedis \} from '@nestjs-modules\/ioredis';/, "import { Inject } from '@nestjs/common';\nimport { REDIS_CLIENT } from '../redis/redis.module';");
content = content.replace(/@InjectRedis\(\) private readonly redis: Redis/, "@Inject(REDIS_CLIENT) private readonly redis: Redis");

fs.writeFileSync('apps/backend/src/audio-fingerprint/audio-fingerprint.service.ts', content);
console.log('Fixed');
