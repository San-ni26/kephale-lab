import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MediaProcessingWorker } from './media-processing.worker';
import { AudioFingerprintModule } from '../audio-fingerprint/audio-fingerprint.module';

/**
 * Module qui enregistre le worker BullMQ pour le traitement des médias.
 * Doit être importé dans AppModule pour que le worker démarre avec l'application.
 */
@Module({
  imports: [
    BullModule.registerQueue({
      name: 'media-processing',
    }),
    AudioFingerprintModule,
  ],
  providers: [MediaProcessingWorker],
  exports: [MediaProcessingWorker],
})
export class MediaProcessingModule {}
