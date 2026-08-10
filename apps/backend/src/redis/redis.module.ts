import { Global, Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { CacheService } from './cache.service';
import { REDIS_CLIENT } from './redis.constants';

export { REDIS_CLIENT };

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        const logger = new Logger('RedisClient');
        const redisUrl = configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
        
        const client = new Redis(redisUrl, {
          maxRetriesPerRequest: 3,
          retryStrategy(times) {
            const delay = Math.min(times * 300, 3000);
            return delay;
          },
          reconnectOnError(err) {
            const targetError = 'READONLY';
            if (err.message.includes(targetError)) {
              return true;
            }
            return false;
          },
          lazyConnect: false,
          enableOfflineQueue: false,
        });

        client.on('error', (err) => {
          logger.warn(`[Redis] Connection warning: ${err.message}`);
        });

        client.on('connect', () => {
          logger.log('[Redis] Connected to Redis successfully');
        });

        return client;
      },
      inject: [ConfigService],
    },
    CacheService,
  ],
  exports: [REDIS_CLIENT, CacheService],
})
export class RedisModule {}

