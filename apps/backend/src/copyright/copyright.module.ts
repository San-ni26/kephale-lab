import { Module } from '@nestjs/common';
import { CopyrightController } from './copyright.controller';
import { CopyrightService } from './copyright.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [CopyrightController],
  providers: [CopyrightService],
})
export class CopyrightModule {}
