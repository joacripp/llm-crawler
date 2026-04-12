var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Injectable, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { getPrisma } from '@llm-crawler/shared';
let AuthService = class AuthService {
    jwtService;
    constructor(jwtService) {
        this.jwtService = jwtService;
    }
    async signup(email, password) {
        const prisma = getPrisma();
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing)
            throw new ConflictException('Email already registered');
        const passwordHash = await bcrypt.hash(password, 10);
        return prisma.user.create({ data: { email, passwordHash } });
    }
    async validateUser(email, password) {
        const prisma = getPrisma();
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash)
            return null;
        const valid = await bcrypt.compare(password, user.passwordHash);
        return valid ? user : null;
    }
    generateTokens(user) {
        const payload = { sub: user.id, email: user.email };
        return {
            accessToken: this.jwtService.sign(payload, { expiresIn: '15m' }),
            refreshToken: this.jwtService.sign(payload, { expiresIn: '7d' }),
        };
    }
};
AuthService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [JwtService])
], AuthService);
export { AuthService };
//# sourceMappingURL=auth.service.js.map