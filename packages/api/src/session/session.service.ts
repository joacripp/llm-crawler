import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { getPrisma } from '@llm-crawler/shared';

@Injectable()
export class SessionService {
  async createSession(): Promise<{ id: string }> {
    const prisma = getPrisma();
    const id = randomUUID();
    await prisma.anonSession.create({ data: { id } });
    return { id };
  }

  async findSession(id: string) {
    const prisma = getPrisma();
    return prisma.anonSession.findUnique({ where: { id } });
  }

  async linkToUser(sessionId: string, userId: string): Promise<void> {
    const prisma = getPrisma();
    await prisma.anonSession.update({ where: { id: sessionId }, data: { userId } });
  }
}
