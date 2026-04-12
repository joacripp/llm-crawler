import { Module } from '@nestjs/common';
import { SseController } from './sse.controller.js';
import { SseService } from './sse.service.js';

@Module({ controllers: [SseController], providers: [SseService] })
export class SseModule {}
