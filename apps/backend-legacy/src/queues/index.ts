import { Queue, Worker, type Job } from 'bullmq';
import { redis } from '../lib/redis.js';
import { prisma } from '@kephale/database';
import { processAudioTranscoding } from './transcode.js';
import { ExpoPushService } from '../services/expo-push.service.js';
import { AudioFingerprintService } from '../services/audio-fingerprint.service.js';

// ── Queue Definitions ──────────────────────────────────────────────────────────

export const mediaProcessingQueue = new Queue('media-processing', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 50,
    removeOnFail: 100,
  },
});

export const notificationQueue = new Queue('notifications', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'fixed', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

export const payoutQueue = new Queue('payouts', {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: 50,
    removeOnFail: 200,
  },
});

// ── Notification Job Types ─────────────────────────────────────────────────────

/**
 * Helper: ajouter une notification push dans la queue.
 *
 * Types supportés :
 *  - SEND_TO_USER          → 1 utilisateur
 *  - SEND_TO_USERS         → liste d'utilisateurs
 *  - NOTIFY_FOLLOWERS      → tous les followers d'un artiste (filtre par préférence)
 *  - LIVE_STARTED          → notification "X est en live"
 *  - NEW_CONTENT           → notification "Nouveau contenu de X"
 *  - DONATION_RECEIVED     → notification pour l'artiste qui reçoit un don
 *  - DISCUSSION_ACCEPTED   → notification pour le spectateur accepté en discussion
 */

type NotificationJobData =
  | {
      type: 'SEND_TO_USER';
      userId: string;
      title: string;
      body: string;
      data?: Record<string, unknown>;
    }
  | {
      type: 'SEND_TO_USERS';
      userIds: string[];
      title: string;
      body: string;
      data?: Record<string, unknown>;
    }
  | {
      type: 'NOTIFY_FOLLOWERS';
      artistId: string;
      contentType: 'NEW_TRACK' | 'NEW_ALBUM' | 'NEW_VIDEO' | 'LIVE_STARTED';
      title: string;
      body: string;
      data?: Record<string, unknown>;
    }
  | {
      type: 'LIVE_STARTED';
      artistId: string;
      liveId: string;
      artistName: string;
      liveTitle: string;
    }
  | {
      type: 'DONATION_RECEIVED';
      artistUserId: string;
      fromUserName: string;
      tokens: number;
      liveId: string;
    }
  | {
      type: 'DISCUSSION_ACCEPTED';
      viewerUserId: string;
      artistName: string;
      liveId: string;
      privateRoomId: string;
    };

export async function addNotificationJob(data: NotificationJobData, opts?: { delay?: number }) {
  return notificationQueue.add(data.type, data, {
    delay: opts?.delay,
    priority: data.type === 'LIVE_STARTED' ? 1 : undefined, // lives en haute priorité
  });
}

// ── Workers ────────────────────────────────────────────────────────────────────

export async function setupBullMQ() {
  // ── 1. Media Processing Worker ───────────────────────────────────────────────
  const mediaWorker = new Worker(
    'media-processing',
    async (job: Job) => {
      const { type, payload } = job.data;

      switch (type) {
        case 'TRANSCODE_AUDIO': {
          await processAudioTranscoding(payload.trackId);
          break;
        }
        case 'TRANSCODE_VIDEO': {
          // TODO: Run FFmpeg to convert video to HLS (480p, 720p, 1080p)
          console.log(`[BullMQ] TODO Transcoding video: ${payload.videoId}`);
          break;
        }
        case 'GENERATE_WAVEFORM': {
          // TODO: Generate waveform data for audio visualization
          console.log(`[BullMQ] TODO Generating waveform: ${payload.trackId}`);
          break;
        }
        case 'GENERATE_TRACK_FINGERPRINT': {
          // Génère et sauvegarde l'empreinte acoustique Chromaprint d'un track
          console.log(`[BullMQ] Generating Chromaprint fingerprint for track: ${payload.trackId}`);
          await AudioFingerprintService.generateAndSaveTrackFingerprint(payload.trackId);
          break;
        }
        case 'VERIFY_VIDEO_AUDIO': {
          // Vérification post-upload : extrait l'audio de la vidéo et vérifie les droits
          console.log(`[BullMQ] Post-upload audio verification for video: ${payload.videoId}`);
          const result = await AudioFingerprintService.postUploadVerification(payload.videoId);
          if (result.violation) {
            console.warn(`[BullMQ] ⚠️ Copyright violation detected for video ${payload.videoId} — matched track ${result.trackId} via ${result.method}`);
          } else {
            console.log(`[BullMQ] ✅ Video ${payload.videoId} passed post-upload audio verification`);
          }
          break;
        }
        case 'PROCESS_LIVE_RECORDING': {
          // TODO: Process LiveKit Egress recording, upload to S3
          console.log(`[BullMQ] TODO Processing live recording: ${payload.liveId}`);
          break;
        }
        default:
          console.warn(`[BullMQ] Unknown media job type: ${type}`);
      }
    },
    { connection: redis, concurrency: 2 }
  );

  // ── 2. Notification Worker ───────────────────────────────────────────────────
  const notificationWorker = new Worker(
    'notifications',
    async (job: Job<NotificationJobData>) => {
      const data = job.data;

      switch (data.type) {
        // ── Envoyer à 1 utilisateur ──────────────────────────────────────────
        case 'SEND_TO_USER': {
          await ExpoPushService.sendToUser(data.userId, {
            title: data.title,
            body: data.body,
            data: data.data,
          });
          break;
        }

        // ── Envoyer à une liste d'utilisateurs ───────────────────────────────
        case 'SEND_TO_USERS': {
          await ExpoPushService.sendToUsers(data.userIds, {
            title: data.title,
            body: data.body,
            data: data.data,
          });
          break;
        }

        // ── Notifier les followers d'un artiste (avec filtrage préférence) ───
        case 'NOTIFY_FOLLOWERS': {
          const prefField =
            data.contentType === 'NEW_TRACK' ? 'notifyTracks' :
            data.contentType === 'NEW_ALBUM' ? 'notifyAlbums' :
            data.contentType === 'NEW_VIDEO' ? 'notifyVideos' :
            'notifyAll'; // LIVE_STARTED → notifyAll

          // Récupérer l'userId de l'artiste pour l'exclure
          const artist = await prisma.artistProfile.findUnique({
            where: { id: data.artistId },
            select: { userId: true },
          });
          if (!artist) break;

          // Récupérer les followers avec la préférence activée
          const follows = await prisma.follow.findMany({
            where: {
              artistId: data.artistId,
              userId: { not: artist.userId },
              OR: [
                { [prefField]: true },
                { notifyAll: true },
              ],
            },
            select: { userId: true },
          });

          if (follows.length === 0) break;

          const userIds = follows.map(f => f.userId);

          // Persister les notifications en DB
          await prisma.notification.createMany({
            data: userIds.map(userId => ({
              userId,
              type: data.contentType,
              title: data.title,
              body: data.body,
              data: (data.data || {}) as object,
            })),
          });

          // Envoyer les push notifications (batché automatiquement)
          await ExpoPushService.sendToUsers(userIds, {
            title: data.title,
            body: data.body,
            data: data.data,
          });
          break;
        }

        // ── Live démarré → notifier les followers ────────────────────────────
        case 'LIVE_STARTED': {
          const title = `🎙️ ${data.artistName} est en live !`;
          const body = data.liveTitle;

          // Réutiliser NOTIFY_FOLLOWERS pour respecter les préférences
          await addNotificationJob({
            type: 'NOTIFY_FOLLOWERS',
            artistId: data.artistId,
            contentType: 'LIVE_STARTED',
            title,
            body,
            data: { liveId: data.liveId, screen: 'live', type: 'LIVE_STARTED' },
          });
          break;
        }

        // ── Don reçu → notifier l'artiste ────────────────────────────────────
        case 'DONATION_RECEIVED': {
          const tokenWord = data.tokens === 1 ? 'jeton' : 'jetons';
          await ExpoPushService.sendToUser(data.artistUserId, {
            title: `💰 Nouveau don reçu !`,
            body: `${data.fromUserName} vous a envoyé ${data.tokens} ${tokenWord}`,
            data: { liveId: data.liveId, screen: 'live', type: 'DONATION_RECEIVED' },
          });
          // Persister aussi la notification en DB
          await prisma.notification.create({
            data: {
              userId: data.artistUserId,
              type: 'DONATION_RECEIVED',
              title: `💰 Nouveau don reçu !`,
              body: `${data.fromUserName} vous a envoyé ${data.tokens} ${tokenWord}`,
              data: { liveId: data.liveId },
            },
          });
          break;
        }

        // ── Discussion acceptée → notifier le spectateur ──────────────────────
        case 'DISCUSSION_ACCEPTED': {
          await ExpoPushService.sendToUser(data.viewerUserId, {
            title: `🎤 Votre demande a été acceptée !`,
            body: `${data.artistName} vous invite à rejoindre la discussion privée`,
            data: {
              liveId: data.liveId,
              privateRoomId: data.privateRoomId,
              screen: 'live-discussion',
              type: 'DISCUSSION_ACCEPTED',
            },
          });
          await prisma.notification.create({
            data: {
              userId: data.viewerUserId,
              type: 'DISCUSSION_ACCEPTED',
              title: `🎤 Votre demande a été acceptée !`,
              body: `${data.artistName} vous invite à rejoindre la discussion privée`,
              data: { liveId: data.liveId, privateRoomId: data.privateRoomId },
            },
          });
          break;
        }

        default:
          console.warn(`[BullMQ] Unknown notification job type: ${(data as any).type}`);
      }
    },
    { connection: redis, concurrency: 10 }
  );

  // ── 3. Payout Worker ─────────────────────────────────────────────────────────
  const payoutWorker = new Worker(
    'payouts',
    async (job: Job) => {
      const { type, payload } = job.data;

      switch (type) {
        case 'LIVE_DONATION_PAYOUT': {
          // TODO: Convert tokens to EUR, transfer via Stripe Connect to artist
          console.log(`[BullMQ] TODO Processing live payout: ${payload.liveId}`);
          break;
        }
        default:
          console.warn(`[BullMQ] Unknown payout job type: ${type}`);
      }
    },
    { connection: redis, concurrency: 5 }
  );

  // ── Error Handlers ────────────────────────────────────────────────────────────

  mediaWorker.on('failed', (job, err) => {
    console.error(`[BullMQ] Media job ${job?.id} (${job?.data?.type}) failed:`, err.message);
  });

  notificationWorker.on('failed', (job, err) => {
    console.error(`[BullMQ] Notification job ${job?.id} (${job?.data?.type}) failed:`, err.message);
  });

  payoutWorker.on('failed', (job, err) => {
    console.error(`[BullMQ] Payout job ${job?.id} (${job?.data?.type}) failed:`, err.message);
  });

  notificationWorker.on('completed', (job) => {
    console.info(`[BullMQ] Notification sent: ${job?.data?.type} (job ${job?.id})`);
  });

  console.log('✅ BullMQ workers started (media, notifications, payouts)');
}
