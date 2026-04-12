var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { getPrisma } from '@llm-crawler/shared';
let SessionService = class SessionService {
    async createSession() {
        const prisma = getPrisma();
        const id = randomUUID();
        await prisma.anonSession.create({ data: { id } });
        return { id };
    }
    async findSession(id) {
        const prisma = getPrisma();
        return prisma.anonSession.findUnique({ where: { id } });
    }
    async linkToUser(sessionId, userId) {
        const prisma = getPrisma();
        await prisma.anonSession.update({ where: { id: sessionId }, data: { userId } });
    }
};
SessionService = __decorate([
    Injectable()
], SessionService);
export { SessionService };
//# sourceMappingURL=session.service.js.map