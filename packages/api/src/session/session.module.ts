import { Module } from '@nestjs/common';
import { SessionService } from './session.service.js';
import { SessionMiddleware } from './session.middleware.js';

@Module({
  providers: [SessionService, SessionMiddleware],
  exports: [SessionService, SessionMiddleware],
})
export class SessionModule {}
