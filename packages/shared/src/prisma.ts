import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

let prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!prisma) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL env var is required');
    const adapter = new PrismaPg({ connectionString: url });
    prisma = new PrismaClient({ adapter });
  }
  return prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) { await prisma.$disconnect(); prisma = null; }
}
