import { Module } from '@nestjs/common';
import { TracksController } from './tracks.controller';
import { TracksService } from './tracks.service';

import { BullModule } from '@nestjs/bullmq';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'media-processing',
    }),
    SubscriptionsModule,
    NotificationsModule,
    UploadModule, // Provides S3Service for signed URLs
  ],
  controllers: [TracksController],
  providers: [TracksService],
})
export class TracksModule {}

