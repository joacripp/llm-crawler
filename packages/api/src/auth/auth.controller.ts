import { Controller, Post, Body, Res, UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service.js';
import { SessionService } from '../session/session.service.js';
import { SignupDto } from './dto/signup.dto.js';
import { LoginDto } from './dto/login.dto.js';

@Controller('api/auth')
export class AuthController {
  constructor(private authService: AuthService, private sessionService: SessionService) {}

  @Post('signup')
  async signup(@Body() dto: SignupDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.authService.signup(dto.email, dto.password);
    const sessionId = (res.req as any).sessionId;
    if (sessionId) await this.sessionService.linkToUser(sessionId, user.id);
    const tokens = this.authService.generateTokens(user);
    this.setTokenCookies(res, tokens);
    return { id: user.id, email: user.email };
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.authService.validateUser(dto.email, dto.password);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const tokens = this.authService.generateTokens(user);
    this.setTokenCookies(res, tokens);
    return { id: user.id, email: user.email };
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('access_token'); res.clearCookie('refresh_token');
    return { ok: true };
  }

  private setTokenCookies(res: Response, tokens: { accessToken: string; refreshToken: string }) {
    const secure = process.env.NODE_ENV === 'production';
    res.cookie('access_token', tokens.accessToken, { httpOnly: true, secure, sameSite: 'lax', maxAge: 15 * 60 * 1000 });
    res.cookie('refresh_token', tokens.refreshToken, { httpOnly: true, secure, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
  }
}
