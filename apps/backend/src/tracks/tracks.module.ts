import { Module } from '@nestjs/common';
import { TracksController } from './tracks.controller';
import { TracksService } from './tracks.service';

import { BullModule } from '@nestjs/bullmq';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'media-processing',
    }),
    SubscriptionsModule,
    NotificationsModule,
  ],
  controllers: [TracksController],
  providers: [TracksService],
})
export class TracksModule {}
