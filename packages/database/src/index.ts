export { PrismaClient } from '@prisma/client';
export * from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

// Singleton pattern — prevents multiple connections in dev (Next.js HMR)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

export function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const connectionString = process.env.DATABASE_URL;
    let adapter: PrismaPg | undefined;
    if (connectionString) {
      const isRemote = !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1');
      const pool = new Pool({
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
      pool.on('error', () => {});
      globalForPrisma.pool = pool;
      adapter = new PrismaPg(pool);
    }
    
    const baseClient = new PrismaClient({
      ...(adapter ? { adapter } : {}),
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });

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

    const extendedClient = baseClient.$extends({
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

    globalForPrisma.prisma = extendedClient as unknown as PrismaClient;
  }

  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    const value = (client as any)[prop];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});

