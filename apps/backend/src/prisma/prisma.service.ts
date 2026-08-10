import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const dbUrl = process.env.DATABASE_URL || '';
    let datasourceUrl = dbUrl;
    if (dbUrl && !dbUrl.includes('connect_timeout=')) {
      const sep = dbUrl.includes('?') ? '&' : '?';
      datasourceUrl = `${dbUrl}${sep}connect_timeout=30&pool_timeout=30`;
    }
    super({
      datasources: {
        db: {
          url: datasourceUrl,
        },
      },
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  }

  async onModuleInit() {
    let retries = 3;
    while (retries > 0) {
      try {
        await this.$connect();
        this.logger.log('Prisma connected to database successfully.');
        return;
      } catch (error: any) {
        retries--;
        this.logger.warn(`Prisma connection attempt failed (${3 - retries}/3): ${error.message}`);
        if (retries > 0) {
          await new Promise((r) => setTimeout(r, 1500));
        } else {
          this.logger.error('Failed to connect to database via Prisma after 3 retries', error);
        }
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Prisma disconnected from database.');
  }
}

