import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { SessionModule } from './session/session.module.js';
import { SessionMiddleware } from './session/session.middleware.js';
import { AuthModule } from './auth/auth.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [SessionModule, AuthModule, JobsModule],
  controllers: [HealthController],
  providers: [],
})
export class LambdaAppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SessionMiddleware).exclude('api/health', 'api/health/ready').forRoutes('*');
  }
}
