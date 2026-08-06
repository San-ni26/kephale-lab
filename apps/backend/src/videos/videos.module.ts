import { Module } from '@nestjs/common';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AudioFingerprintModule } from '../audio-fingerprint/audio-fingerprint.module';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    SubscriptionsModule, 
    NotificationsModule, 
    AudioFingerprintModule,
    BullModule.registerQueue({ name: 'media-processing' }),
  ],
  controllers: [VideosController],
  providers: [VideosService],
})
export class VideosModule {}
