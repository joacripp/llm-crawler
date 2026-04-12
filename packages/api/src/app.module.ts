import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { SessionModule } from './session/session.module.js';
import { SessionMiddleware } from './session/session.middleware.js';
import { AuthModule } from './auth/auth.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { SseModule } from './sse/sse.module.js';

@Module({
  imports: [SessionModule, AuthModule, JobsModule, SseModule],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SessionMiddleware).forRoutes('*');
  }
}
