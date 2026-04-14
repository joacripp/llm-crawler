// Augment Express's Request type so we can type the fields our middleware
// and Passport strategy attach (instead of casting `req as any` everywhere).
//
// - `user`: set by Passport when JwtAuthGuard / OptionalAuthGuard validates
//   the access_token cookie. Shape comes from JwtStrategy.validate().
// - `sessionId` / `sessionUserId`: set by SessionMiddleware on every request
//   (anonymous sessions are tracked via a session_id cookie).

import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user?: Record<string, any>;
    sessionId?: string;
    sessionUserId?: string | null;
  }
}
