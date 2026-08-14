import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export interface ExpoPushMessage {
  to: string | string[];
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
  ttl?: number;
}

export interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

export interface ExpoPushReceipt {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const CHUNK_SIZE = 100;

/**
 * Construit les headers pour l'API Expo Push.
 * EXPO_ACCESS_TOKEN est requis pour les apps publiées sur EAS.
 * Sans ce token, Expo peut throttler les envois en production.
 *
 * Pour obtenir un token :
 * 1. Se connecter sur https://expo.dev
 * 2. Account Settings → Access Tokens → Create Token
 * 3. Ajouter dans .env : EXPO_ACCESS_TOKEN=expo_...
 */
function getExpoPushHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };

  const accessToken = process.env.EXPO_ACCESS_TOKEN;
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  return headers;
}

function isValidExpoPushToken(token: string): boolean {
  return /^ExponentPushToken\[.+\]$/.test(token) || /^[a-zA-Z0-9_-]{20,}$/.test(token);
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

@Injectable()
export class ExpoPushService {
  private readonly logger = new Logger(ExpoPushService.name);

  constructor(private readonly prisma: PrismaClient) {}

  private async sendChunk(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: getExpoPushHeaders(),
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      throw new Error(`Expo Push API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json() as { data: ExpoPushTicket[] };
    return result.data;
  }

  async sendToUser(
    userId: string,
    notification: { title: string; body: string; data?: Record<string, unknown> }
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { pushToken: true, name: true },
    });

    if (!user?.pushToken || !isValidExpoPushToken(user.pushToken)) return;

    await this.sendToTokens([user.pushToken], notification);
  }

  async sendToUsers(
    userIds: string[],
    notification: { title: string; body: string; data?: Record<string, unknown> }
  ): Promise<void> {
    if (userIds.length === 0) return;

    const users = await this.prisma.user.findMany({
      where: {
        id: { in: userIds },
        pushToken: { not: null },
      },
      select: { id: true, pushToken: true },
    });

    const validTokens = users
      .filter(u => u.pushToken && isValidExpoPushToken(u.pushToken))
      .map(u => ({ userId: u.id, token: u.pushToken! }));

    if (validTokens.length === 0) return;

    await this.sendToTokens(
      validTokens.map(t => t.token),
      notification,
      Object.fromEntries(validTokens.map(t => [t.token, t.userId]))
    );
  }

  async sendToTokens(
    tokens: string[],
    notification: { title: string; body: string; data?: Record<string, unknown> },
    tokenToUserId?: Record<string, string>
  ): Promise<void> {
    const chunks = chunkArray(tokens, CHUNK_SIZE);
    const invalidTokens: string[] = [];

    for (const chunk of chunks) {
      const messages: ExpoPushMessage[] = chunk.map(token => ({
        to: token,
        title: notification.title,
        body: notification.body,
        data: notification.data || {},
        sound: 'default',
        priority: 'high',
        channelId: 'default',
      }));

      try {
        const tickets = await this.sendChunk(messages);

        tickets.forEach((ticket, idx) => {
          if (ticket.status === 'error') {
            const errorCode = ticket.details?.error;
            if (errorCode === 'DeviceNotRegistered' || errorCode === 'InvalidCredentials') {
              invalidTokens.push(chunk[idx]);
            }
            this.logger.warn(`Ticket error for token ${chunk[idx].slice(0, 20)}...: ${ticket.message}`);
          }
        });
      } catch (err: any) {
        this.logger.error(`Failed to send chunk of ${chunk.length} tokens:`, err.message);
      }
    }

    if (invalidTokens.length > 0 && tokenToUserId) {
      const userIdsToClean = invalidTokens
        .map(t => tokenToUserId[t])
        .filter(Boolean);

      if (userIdsToClean.length > 0) {
        await this.prisma.user.updateMany({
          where: { id: { in: userIdsToClean } },
          data: { pushToken: null },
        }).catch(() => {});
        this.logger.log(`Cleared ${userIdsToClean.length} invalid push tokens from DB`);
      }
    }
  }

  async checkReceipts(ticketIds: string[]): Promise<Record<string, ExpoPushReceipt>> {
    if (ticketIds.length === 0) return {};

    const chunks = chunkArray(ticketIds, CHUNK_SIZE);
    const allReceipts: Record<string, ExpoPushReceipt> = {};

    for (const chunk of chunks) {
      try {
        const response = await fetch(EXPO_RECEIPTS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: chunk }),
        });
        const result = await response.json() as { data: Record<string, ExpoPushReceipt> };
        Object.assign(allReceipts, result.data);
      } catch (err: any) {
        this.logger.error('Failed to check receipts:', err.message);
      }
    }

    return allReceipts;
  }
}
