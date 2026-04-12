import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { SessionService } from './session.service.js';

@Injectable()
export class SessionMiddleware implements NestMiddleware {
  constructor(private sessionService: SessionService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const sessionId = req.cookies?.session_id;
    if (sessionId) {
      const session = await this.sessionService.findSession(sessionId);
      if (session) {
        (req as any).sessionId = session.id;
        (req as any).sessionUserId = session.userId;
        return next();
      }
    }
    const { id } = await this.sessionService.createSession();
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('session_id', id, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',  // 'none' required for cross-origin cookies
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    (req as any).sessionId = id;
    (req as any).sessionUserId = null;
    next();
  }
}
