import { Module } from '@nestjs/common';
import { LivesController } from './lives.controller';
import { LivesService } from './lives.service';
import { LivesGateway } from './lives.gateway';
import { BullModule } from '@nestjs/bullmq';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'notifications' }),
    PaymentsModule,
  ],
  controllers: [LivesController],
  providers: [LivesService, LivesGateway],
  exports: [LivesService, LivesGateway],
})
export class LivesModule {}

