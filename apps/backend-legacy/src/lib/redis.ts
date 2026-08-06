import { Redis } from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

let warnedNotReachable = false;

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  lazyConnect: true,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 500, 5000); // Max 5s entre les tentatives
    if (times === 4 && !warnedNotReachable) {
      warnedNotReachable = true;
      console.warn('⚠️  Redis not reachable — retrying in background, cache/queues degraded');
    }
    return delay; // Réessaie indéfiniment (ne retourne jamais null)
  },
});

redis.on('connect', () => {
  warnedNotReachable = false;
  console.log('✅ Redis connected');
});

redis.on('ready', () => {
  warnedNotReachable = false;
});

redis.on('error', (err: any) => {
  // Ignorer les erreurs de connexion répétitives (elles sont loggées par retryStrategy)
  if (
    err?.code === 'ECONNREFUSED' ||
    err?.code === 'ECONNRESET' ||
    err?.message?.includes('ECONNREFUSED') ||
    err?.message?.includes('ECONNRESET')
  ) return;
  console.error('❌ Redis error:', err?.message || err);
});
