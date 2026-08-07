import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { S3Service } from './s3.service';

@Module({
  controllers: [UploadController],
  providers: [UploadService, S3Service],
  exports: [S3Service], // Exported for use in TracksModule, VideosModule, etc.
})
export class UploadModule {}
