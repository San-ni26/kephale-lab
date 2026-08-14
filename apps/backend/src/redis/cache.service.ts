import { Injectable, Inject, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Get cached item by key
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await this.redis.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (err: any) {
      this.logger.warn(`Redis get error on key "${key}": ${err?.message}`);
      return null;
    }
  }

  /**
   * Set cached item with TTL in seconds
   */
  async set(key: string, value: any, ttlSeconds: number = 300): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds > 0) {
        await this.redis.set(key, serialized, 'EX', ttlSeconds);
      } else {
        await this.redis.set(key, serialized);
      }
    } catch (err: any) {
      this.logger.warn(`Redis set error on key "${key}": ${err?.message}`);
    }
  }

  /**
   * Cache-Aside pattern: Get cached value or fetch, cache and return
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds: number = 300
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    const freshData = await fetcher();
    if (freshData !== null && freshData !== undefined) {
      await this.set(key, freshData, ttlSeconds);
    }
    return freshData;
  }

  /**
   * Delete one or more keys
   */
  async del(...keys: string[]): Promise<void> {
    if (!keys.length) return;
    try {
      await this.redis.del(...keys);
    } catch (err: any) {
      this.logger.warn(`Redis del error on keys ${keys.join(', ')}: ${err?.message}`);
    }
  }

  /**
   * Invalide les clés correspondant à un pattern (ex: "tracks:*")
   *
   * ⚠️  IMPORTANT : Cette méthode retourne une vraie Promise qui se résout
   * uniquement quand le scanStream Redis est terminé. Utiliser await.
   */
  async delByPattern(pattern: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        const stream = this.redis.scanStream({
          match: pattern,
          count: 100,
        });

        stream.on('data', async (keys: string[]) => {
          if (keys.length) {
            const pipeline = this.redis.pipeline();
            keys.forEach((key) => pipeline.del(key));
            await pipeline.exec();
          }
        });

        stream.on('end', () => resolve());
        stream.on('error', (err: Error) => {
          this.logger.warn(`Redis delByPattern error on "${pattern}": ${err?.message}`);
          resolve(); // On résout quand même pour ne pas bloquer l'opération principale
        });
      } catch (err: any) {
        this.logger.warn(`Redis delByPattern error on "${pattern}": ${err?.message}`);
        resolve();
      }
    });
  }

  /**
   * Ping Redis to check health
   */
  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}
