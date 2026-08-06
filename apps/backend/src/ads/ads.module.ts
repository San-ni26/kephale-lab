import { Module } from '@nestjs/common';
import { AdsService } from './ads.service';
import { AdsController } from './ads.controller';
import { AdminAdsController } from './admin-ads.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [AdsController, AdminAdsController],
  providers: [AdsService],
  exports: [AdsService],
})
export class AdsModule {}
