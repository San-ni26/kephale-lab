import { Global, Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { PrismaReplicaService } from './prisma-replica.service';

@Global()
@Module({
  providers: [
    PrismaService,
    PrismaReplicaService,
    {
      provide: PrismaClient,
      useExisting: PrismaService,
    },
  ],
  exports: [PrismaService, PrismaClient, PrismaReplicaService],
})
export class PrismaModule {}

