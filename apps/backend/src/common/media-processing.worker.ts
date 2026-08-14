import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { AudioFingerprintService } from '../audio-fingerprint/audio-fingerprint.service';
import { VideoTranscodeService } from './video-transcode.service';

/**
 * Worker BullMQ pour le traitement asynchrone des médias.
 *
 * Jobs traités :
 * - GENERATE_TRACK_FINGERPRINT : Génère et sauvegarde l'empreinte Chromaprint
 *   d'une track après son upload par un artiste.
 * - TRANSCODE_VIDEO            : Compresse le Reel en 720p CRF 26 (~2 Mbps)
 *   pour réduire la consommation de données mobiles (-65 à -82%).
 * - TRANSCODE_AUDIO            : Transcodage audio (placeholder futur).
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
    private readonly videoTranscodeService: VideoTranscodeService,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    const { type, payload } = job.data;

    this.logger.log(`[MediaWorker] Traitement du job: ${type} — ID: ${job.id}`);

    switch (type) {
      case 'GENERATE_TRACK_FINGERPRINT':
        return this.handleGenerateTrackFingerprint(payload);

      case 'TRANSCODE_VIDEO':
        return this.handleTranscodeVideo(payload);

      case 'VERIFY_VIDEO_AUDIO':
        return this.handleVerifyVideoAudio(payload);

      case 'TRANSCODE_AUDIO':
        this.logger.log(`[MediaWorker] TRANSCODE_AUDIO non implémenté (track ${payload?.trackId}), skip.`);
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
   * Transcoode une vidéo Reel en 720p CRF 26 pour réduire la consommation mobile.
   * Le job est ajouté avec un délai de 30s après la publication pour laisser
   * le temps à S3 de rendre le fichier disponible.
   */
  private async handleTranscodeVideo(payload: { videoId: string }) {
    const { videoId } = payload;

    if (!videoId) {
      this.logger.error('[MediaWorker] TRANSCODE_VIDEO: videoId manquant');
      return { error: 'videoId missing' };
    }

    this.logger.log(`[MediaWorker] Transcodage vidéo 720p CRF 26: ${videoId}`);

    try {
      const result = await this.videoTranscodeService.transcodeVideoById(videoId);
      if (result.success) {
        this.logger.log(
          `[MediaWorker] ✅ Transcodage terminé pour vidéo ${videoId}: ` +
          `-${result.compressionRatio}% (${((result.originalSize || 0) / (1024 * 1024)).toFixed(1)}MB → ` +
          `${((result.compressedSize || 0) / (1024 * 1024)).toFixed(1)}MB)`
        );
      }
      return result;
    } catch (error: any) {
      this.logger.error(`[MediaWorker] ❌ Échec transcodage vidéo ${videoId}: ${error.message}`);
      // Ne pas re-throw : la vidéo originale reste disponible, ce n'est pas critique
      return { success: false, error: error.message };
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
