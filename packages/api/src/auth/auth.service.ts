import { Injectable, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { getPrisma } from '@llm-crawler/shared';

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

  generateTokens(user: { id: string; email: string | null }) {
    const payload = { sub: user.id, email: user.email };
    return {
      accessToken: this.jwtService.sign(payload, { expiresIn: '15m' }),
      refreshToken: this.jwtService.sign(payload, { expiresIn: '7d' }),
    };
  }
}
