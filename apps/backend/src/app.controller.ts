import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaClient } from '@prisma/client';
import { CacheService } from './redis/cache.service';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaClient,
    private readonly cacheService: CacheService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * Health Check Endpoint
   * Returns live status of Database, Redis, Memory, and Uptime
   */
  @Get('health')
  @SkipThrottle()
  async getHealth() {
    const startTime = Date.now();
    let dbStatus = 'UNKNOWN';
    let dbLatencyMs = 0;

    try {
      const dbStart = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - dbStart;
      dbStatus = 'HEALTHY';
    } catch (err: any) {
      dbStatus = `UNHEALTHY: ${err?.message || 'DB Error'}`;
    }

    const isRedisHealthy = await this.cacheService.isHealthy();
    const memoryUsage = process.memoryUsage();

    const overallStatus = dbStatus === 'HEALTHY' && isRedisHealthy ? 'ok' : 'degraded';

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
      checks: {
        database: {
          status: dbStatus,
          latencyMs: dbLatencyMs,
        },
        redis: {
          status: isRedisHealthy ? 'HEALTHY' : 'UNHEALTHY',
        },
        memory: {
          rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
          heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heapTotalMb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        },
      },
      responseTimeMs: Date.now() - startTime,
    };
  }
}

