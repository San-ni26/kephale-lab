import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { ChatModule } from '../chat/chat.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AccessControlService } from './access.service';

@Module({
  imports: [ChatModule, NotificationsModule],
  controllers: [SubscriptionsController],
  providers: [AccessControlService, SubscriptionsService],
  exports: [AccessControlService, SubscriptionsService],
})
export class SubscriptionsModule {}
