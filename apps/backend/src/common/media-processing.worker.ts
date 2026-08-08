import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { AudioFingerprintService } from '../audio-fingerprint/audio-fingerprint.service';

/**
 * Worker BullMQ pour le traitement asynchrone des médias.
 * 
 * Jobs traités :
 * - GENERATE_TRACK_FINGERPRINT : Génère et sauvegarde l'empreinte Chromaprint
 *   d'une track après son upload par un artiste.
 * - TRANSCODE_AUDIO            : Transcodage audio (placeholder).
 * - TRANSCODE_VIDEO            : Transcodage vidéo (placeholder).
 * - VERIFY_VIDEO_AUDIO         : Vérification post-upload des droits audio.
 */
@Injectable()
@Processor('media-processing', {
  concurrency: 2, // Max 2 jobs en parallèle pour ne pas surcharger le serveur
})
export class MediaProcessingWorker extends WorkerHost {
  private readonly logger = new Logger(MediaProcessingWorker.name);

  constructor(
    private readonly audioFingerprintService: AudioFingerprintService,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    const { type, payload } = job.data;

    this.logger.log(`[MediaWorker] Traitement du job: ${type} — ID: ${job.id}`);

    switch (type) {
      case 'GENERATE_TRACK_FINGERPRINT':
        return this.handleGenerateTrackFingerprint(payload);

      case 'VERIFY_VIDEO_AUDIO':
        return this.handleVerifyVideoAudio(payload);

      case 'TRANSCODE_AUDIO':
        this.logger.log(`[MediaWorker] TRANSCODE_AUDIO non implémenté (track ${payload?.trackId}), skip.`);
        return { skipped: true };

      case 'TRANSCODE_VIDEO':
        this.logger.log(`[MediaWorker] TRANSCODE_VIDEO non implémenté (video ${payload?.videoId}), skip.`);
        return { skipped: true };

      default:
        this.logger.warn(`[MediaWorker] Type de job inconnu: ${type}`);
        return { unknown: true };
    }
  }

  /**
   * Génère et sauvegarde l'empreinte Chromaprint d'une track.
   * Déclenché automatiquement 10s après l'upload d'un son par un artiste.
   */
  private async handleGenerateTrackFingerprint(payload: { trackId: string }) {
    const { trackId } = payload;

    if (!trackId) {
      this.logger.error('[MediaWorker] GENERATE_TRACK_FINGERPRINT: trackId manquant');
      return { error: 'trackId missing' };
    }

    this.logger.log(`[MediaWorker] Génération empreinte acoustique pour track: ${trackId}`);

    try {
      await this.audioFingerprintService.generateAndSaveTrackFingerprint(trackId);
      this.logger.log(`[MediaWorker] ✅ Empreinte générée et sauvegardée pour track: ${trackId}`);
      return { success: true, trackId };
    } catch (error: any) {
      this.logger.error(`[MediaWorker] ❌ Échec empreinte track ${trackId}: ${error.message}`);
      throw error; // BullMQ retentera le job selon la config retry
    }
  }

  /**
   * Vérification post-upload asynchrone des droits audio d'une vidéo.
   * Si une musique protégée est détectée après publication, la vidéo est signalée.
   */
  private async handleVerifyVideoAudio(payload: { videoId: string }) {
    const { videoId } = payload;

    if (!videoId) {
      this.logger.error('[MediaWorker] VERIFY_VIDEO_AUDIO: videoId manquant');
      return { error: 'videoId missing' };
    }

    this.logger.log(`[MediaWorker] Vérification audio post-upload pour vidéo: ${videoId}`);

    try {
      const result = await this.audioFingerprintService.postUploadVerification(videoId);
      this.logger.log(`[MediaWorker] ✅ Vérification vidéo ${videoId}: ${JSON.stringify(result)}`);
      return result;
    } catch (error: any) {
      this.logger.warn(`[MediaWorker] Vérification vidéo ${videoId} échouée (non bloquante): ${error.message}`);
      return { error: error.message };
    }
  }
}
