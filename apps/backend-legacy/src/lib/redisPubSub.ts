import { Redis } from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const redisOptions = {
  enableReadyCheck: false,
  lazyConnect: true,
  maxRetriesPerRequest: null,
  retryStrategy: (times: number) => {
    if (times > 3) return null;
    return Math.min(times * 1000, 3000);
  },
};

// Instance for publishing messages
export const redisPub = new Redis(REDIS_URL, redisOptions);

// Instance for subscribing to channels
export const redisSub = new Redis(REDIS_URL, redisOptions);

redisPub.on('error', (err: any) => {
  // Silent catch to prevent ioredis unhandled ECONNRESET noise
});

redisSub.on('error', (err: any) => {
  // Silent catch to prevent ioredis unhandled ECONNRESET noise
});

export const CHANNELS = {
  USER_UPDATES: 'user:updates',
};

/**
 * Publish an update for a specific user
 */
export function publishUserUpdate(userId: string, data: any) {
  const payload = JSON.stringify({ userId, data });
  redisPub.publish(CHANNELS.USER_UPDATES, payload).catch((err: any) => {
    console.error('Failed to publish user update to Redis:', err);
  });
}
