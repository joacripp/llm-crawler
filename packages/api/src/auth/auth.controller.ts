import { Controller, Post, Get, Body, Res, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthService } from './auth.service.js';
import { SessionService } from '../session/session.service.js';
import { SignupDto } from './dto/signup.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@Controller('api/auth')
export class AuthController {
  constructor(private authService: AuthService, private sessionService: SessionService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: Request) {
    const user = (req as any).user;
    return { id: user.id, email: user.email };
  }

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
    const sessionId = (res.req as any).sessionId;
    if (sessionId) await this.sessionService.linkToUser(sessionId, user.id);
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
    const isProduction = process.env.NODE_ENV === 'production';
    const sameSite: 'none' | 'lax' = isProduction ? 'none' : 'lax';
    res.cookie('access_token', tokens.accessToken, { httpOnly: true, secure: isProduction, sameSite, maxAge: 15 * 60 * 1000 });
    res.cookie('refresh_token', tokens.refreshToken, { httpOnly: true, secure: isProduction, sameSite, maxAge: 7 * 24 * 60 * 60 * 1000 });
  }
}
