import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TracksModule } from './tracks/tracks.module';
import { ArtistsModule } from './artists/artists.module';
import { VideosModule } from './videos/videos.module';
import { LivesModule } from './lives/lives.module';
import { PaymentsModule } from './payments/payments.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { FeedModule } from './feed/feed.module';
import { NotificationsModule } from './notifications/notifications.module';
import { UploadModule } from './upload/upload.module';
import { PlaylistsModule } from './playlists/playlists.module';
import { AlbumsModule } from './albums/albums.module';
import { ChatModule } from './chat/chat.module';
import { AdminModule } from './admin/admin.module';
import { CopyrightModule } from './copyright/copyright.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { AudioFingerprintModule } from './audio-fingerprint/audio-fingerprint.module';
import { MediaProcessingModule } from './common/media-processing.module';
import { AdsModule } from './ads/ads.module';

@Module({
  imports: [
    // Global Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),

    // Cron Jobs
    ScheduleModule.forRoot(),

    // Rate Limiting (Anti-brute force & DDoS)
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,        // 1 second window
        limit: 10,        // 10 requests/second max (burst protection)
      },
      {
        name: 'medium',
        ttl: 60000,       // 1 minute window
        limit: 120,       // 120 requests/minute (2 req/sec sustained)
      },
      {
        name: 'long',
        ttl: 900000,      // 15 minutes window
        limit: 500,       // Global ceiling per IP
      },
    ]),

    // BullMQ (Queues)
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          url: configService.get<string>('REDIS_URL') || 'redis://localhost:6379',
        },
      }),
    }),

    // Custom Global Modules
    PrismaModule,
    RedisModule,

    // Feature Modules
    AuthModule,
    UsersModule,
    TracksModule,
    ArtistsModule,
    VideosModule,
    LivesModule,
    PaymentsModule,
    SubscriptionsModule,
    FeedModule,
    NotificationsModule,
    UploadModule,
    PlaylistsModule,
    AlbumsModule,
    ChatModule,
    AdminModule,
    CopyrightModule,
    WebhooksModule, // (We can leave this if it exists, or remove it since logic is in Payments)
    AudioFingerprintModule,
    MediaProcessingModule, // ✅ Worker BullMQ : génère les empreintes des tracks automatiquement
    AdsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Apply rate limiting globally to all routes
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
