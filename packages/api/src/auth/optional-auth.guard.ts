import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

interface JwtUser { id: string; email: string | null }

@Injectable()
export class OptionalAuthGuard extends AuthGuard('jwt') {
  // Override Passport's default behavior of throwing 401 on missing/invalid
  // token — for endpoints that should work for both signed-in and anonymous
  // users, we just want `req.user` to be undefined in the anonymous case.
  handleRequest<T = JwtUser>(err: Error | null, user: T | false): T | null {
    return user || null;
  }
}
