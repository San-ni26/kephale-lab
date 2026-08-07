import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private pool?: Pool;
  private extendedClient: any;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    let adapter: PrismaPg | undefined;
    let pool: Pool | undefined;

    if (connectionString) {
      const isRemote = !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1');
      pool = new Pool({
        connectionString,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        keepAlive: true,
        keepAliveInitialDelayMillis: 5000,
        allowExitOnIdle: false,
        ...(isRemote
          ? {
              ssl: {
                rejectUnauthorized: false,
              },
            }
          : {}),
      });
      pool.on('error', (err: any) => {
        // Suppress idle closed logs as retry handles reconnecting smoothly
      });
      adapter = new PrismaPg(pool);
    }

    super({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });

    this.pool = pool;

    const isConnectionError = (err: any): boolean => {
      const msg = `${err?.message || ''} ${err?.stack || ''}`;
      return (
        msg.includes('closed the connection') ||
        msg.includes('Connection terminated') ||
        msg.includes('ECONNRESET') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('Broken pipe') ||
        msg.includes('Connection lost') ||
        msg.includes('connection is closed') ||
        msg.includes('terminating connection')
      );
    };

    this.extendedClient = this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            try {
              return await query(args);
            } catch (err: any) {
              if (isConnectionError(err)) {
                await new Promise((r) => setTimeout(r, 100));
                return await query(args);
              }
              throw err;
            }
          },
        },
      },
    });

    return new Proxy(this, {
      get(target, prop, receiver) {
        if (target.extendedClient && prop in target.extendedClient) {
          const val = target.extendedClient[prop];
          if (typeof val === 'function') {
            return val.bind(target.extendedClient);
          }
          return val;
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Prisma connected to database successfully with driver adapter and auto-retry.');
    } catch (error) {
      this.logger.error('Failed to connect to database via Prisma', error);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    if (this.pool) {
      await this.pool.end();
    }
    this.logger.log('Prisma disconnected from database.');
  }
}

