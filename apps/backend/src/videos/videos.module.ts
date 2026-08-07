import { Module } from '@nestjs/common';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AudioFingerprintModule } from '../audio-fingerprint/audio-fingerprint.module';
import { BullModule } from '@nestjs/bullmq';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    SubscriptionsModule,
    NotificationsModule,
    AudioFingerprintModule,
    BullModule.registerQueue({ name: 'media-processing' }),
    UploadModule, // Provides S3Service for signed URLs
  ],
  controllers: [VideosController],
  providers: [VideosService],
})
export class VideosModule {}

