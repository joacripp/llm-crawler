import { Injectable, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { getPrisma } from '@llm-crawler/shared';

export interface OAuthProfile {
  oauthProvider: string;
  oauthId: string;
  email: string | null;
}

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  async signup(email: string, password: string) {
    const prisma = getPrisma();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');
    const passwordHash = await bcrypt.hash(password, 10);
    return prisma.user.create({ data: { email, passwordHash } });
  }

  async validateUser(email: string, password: string) {
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) return null;
    const valid = await bcrypt.compare(password, user.passwordHash);
    return valid ? user : null;
  }

  async findOrCreateOAuthUser(profile: OAuthProfile) {
    const prisma = getPrisma();
    const { oauthProvider, oauthId, email } = profile;

    // 1. Try to find by OAuth provider + ID (returning user)
    const existingOAuth = await prisma.user.findFirst({
      where: { oauthProvider, oauthId },
    });
    if (existingOAuth) return existingOAuth;

    // 2. Check if email is already taken by a password-based account.
    // Reject rather than auto-link — safer, avoids account takeover if
    // someone registers with an email they don't own.
    if (email) {
      const existingEmail = await prisma.user.findUnique({ where: { email } });
      if (existingEmail) {
        throw new ConflictException('An account with this email already exists. Please log in with your password.');
      }
    }

    // 3. Create new OAuth user
    return prisma.user.create({
      data: { email, oauthProvider, oauthId },
    });
  }

  generateTokens(user: { id: string; email: string | null }) {
    const payload = { sub: user.id, email: user.email };
    return {
      accessToken: this.jwtService.sign(payload, { expiresIn: '1h' }),
      refreshToken: this.jwtService.sign(payload, { expiresIn: '7d' }),
    };
  }

  verifyRefreshToken(token: string): { sub: string; email: string } | null {
    try {
      return this.jwtService.verify(token) as { sub: string; email: string };
    } catch {
      return null;
    }
  }
}
