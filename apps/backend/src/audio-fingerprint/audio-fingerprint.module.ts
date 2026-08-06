import { Module } from '@nestjs/common';
import { AudioFingerprintService } from './audio-fingerprint.service';

@Module({
  providers: [AudioFingerprintService],
  exports: [AudioFingerprintService],
})
export class AudioFingerprintModule {}
