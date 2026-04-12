var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Injectable } from '@nestjs/common';
import { SessionService } from './session.service.js';
let SessionMiddleware = class SessionMiddleware {
    sessionService;
    constructor(sessionService) {
        this.sessionService = sessionService;
    }
    async use(req, res, next) {
        const sessionId = req.cookies?.session_id;
        if (sessionId) {
            const session = await this.sessionService.findSession(sessionId);
            if (session) {
                req.sessionId = session.id;
                req.sessionUserId = session.userId;
                return next();
            }
        }
        const { id } = await this.sessionService.createSession();
        res.cookie('session_id', id, {
            httpOnly: true, secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000,
        });
        req.sessionId = id;
        req.sessionUserId = null;
        next();
    }
};
SessionMiddleware = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [SessionService])
], SessionMiddleware);
export { SessionMiddleware };
//# sourceMappingURL=session.middleware.js.map