var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Controller, Post, Body, Res, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { SessionService } from '../session/session.service.js';
import { SignupDto } from './dto/signup.dto.js';
import { LoginDto } from './dto/login.dto.js';
let AuthController = class AuthController {
    authService;
    sessionService;
    constructor(authService, sessionService) {
        this.authService = authService;
        this.sessionService = sessionService;
    }
    async signup(dto, res) {
        const user = await this.authService.signup(dto.email, dto.password);
        const sessionId = res.req.sessionId;
        if (sessionId)
            await this.sessionService.linkToUser(sessionId, user.id);
        const tokens = this.authService.generateTokens(user);
        this.setTokenCookies(res, tokens);
        return { id: user.id, email: user.email };
    }
    async login(dto, res) {
        const user = await this.authService.validateUser(dto.email, dto.password);
        if (!user)
            throw new UnauthorizedException('Invalid credentials');
        const tokens = this.authService.generateTokens(user);
        this.setTokenCookies(res, tokens);
        return { id: user.id, email: user.email };
    }
    async logout(res) {
        res.clearCookie('access_token');
        res.clearCookie('refresh_token');
        return { ok: true };
    }
    setTokenCookies(res, tokens) {
        const secure = process.env.NODE_ENV === 'production';
        res.cookie('access_token', tokens.accessToken, { httpOnly: true, secure, sameSite: 'lax', maxAge: 15 * 60 * 1000 });
        res.cookie('refresh_token', tokens.refreshToken, { httpOnly: true, secure, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    }
};
__decorate([
    Post('signup'),
    __param(0, Body()),
    __param(1, Res({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [SignupDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "signup", null);
__decorate([
    Post('login'),
    __param(0, Body()),
    __param(1, Res({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [LoginDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    Post('logout'),
    __param(0, Res({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
AuthController = __decorate([
    Controller('api/auth'),
    __metadata("design:paramtypes", [AuthService, SessionService])
], AuthController);
export { AuthController };
//# sourceMappingURL=auth.controller.js.map