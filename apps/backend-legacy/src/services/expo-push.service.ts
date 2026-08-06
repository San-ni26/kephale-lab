import { prisma } from '@kephale/database';

// ── Types Expo Push API ────────────────────────────────────────────────────────

interface ExpoPushMessage {
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

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoPushReceipt {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

// Expo Push API limits
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const CHUNK_SIZE = 100; // Max 100 tokens per request

// ── Helper ────────────────────────────────────────────────────────────────────

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

// ── Core send function ────────────────────────────────────────────────────────

async function sendChunk(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    throw new Error(`Expo Push API error: ${response.status} ${response.statusText}`);
  }

  const result = await response.json() as { data: ExpoPushTicket[] };
  return result.data;
}

// ── Main service ──────────────────────────────────────────────────────────────

export const ExpoPushService = {
  /**
   * Send a push notification to a single user.
   * Automatically skips users without push tokens.
   */
  async sendToUser(
    userId: string,
    notification: { title: string; body: string; data?: Record<string, unknown> }
  ): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { pushToken: true, name: true },
    });

    if (!user?.pushToken || !isValidExpoPushToken(user.pushToken)) return;

    await ExpoPushService.sendToTokens(
      [user.pushToken],
      notification
    );
  },

  /**
   * Send push notifications to multiple users (batched automatically).
   * Cleans up invalid tokens from DB.
   */
  async sendToUsers(
    userIds: string[],
    notification: { title: string; body: string; data?: Record<string, unknown> }
  ): Promise<void> {
    if (userIds.length === 0) return;

    // Fetch all push tokens in one query
    const users = await prisma.user.findMany({
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

    await ExpoPushService.sendToTokens(
      validTokens.map(t => t.token),
      notification,
      // Pass userId map for cleanup
      Object.fromEntries(validTokens.map(t => [t.token, t.userId]))
    );
  },

  /**
   * Low-level: send to raw tokens (handles chunking + invalid token cleanup)
   */
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
        const tickets = await sendChunk(messages);

        // Check for invalid tokens to clean up
        tickets.forEach((ticket, idx) => {
          if (ticket.status === 'error') {
            const errorCode = ticket.details?.error;
            if (errorCode === 'DeviceNotRegistered' || errorCode === 'InvalidCredentials') {
              invalidTokens.push(chunk[idx]);
            }
            console.warn(`[ExpoPush] Ticket error for token ${chunk[idx].slice(0, 20)}...: ${ticket.message}`);
          }
        });
      } catch (err: any) {
        // Log but don't rethrow — one chunk failing shouldn't block others
        console.error(`[ExpoPush] Failed to send chunk of ${chunk.length} tokens:`, err.message);
      }
    }

    // Clean up invalid/unregistered tokens from DB
    if (invalidTokens.length > 0 && tokenToUserId) {
      const userIdsToClean = invalidTokens
        .map(t => tokenToUserId[t])
        .filter(Boolean);

      if (userIdsToClean.length > 0) {
        await prisma.user.updateMany({
          where: { id: { in: userIdsToClean } },
          data: { pushToken: null },
        }).catch(() => {}); // Non-blocking
        console.info(`[ExpoPush] Cleared ${userIdsToClean.length} invalid push tokens from DB`);
      }
    }
  },

  /**
   * Verify delivery receipts (call after 15–30 minutes to check delivery status)
   */
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
        console.error('[ExpoPush] Failed to check receipts:', err.message);
      }
    }

    return allReceipts;
  },
};
