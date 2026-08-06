import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { CurrencyService } from './currency.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [SubscriptionsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, CurrencyService],
  exports: [PaymentsService, CurrencyService],
})
export class PaymentsModule {}

