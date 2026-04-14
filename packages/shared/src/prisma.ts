import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

let prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!prisma) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL env var is required');
    const isLocal = url.includes('localhost') || url.includes('127.0.0.1');
    const adapter = new PrismaPg({
      connectionString: url,
      ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
    });
    prisma = new PrismaClient({ adapter });
  }
  return prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}

export async function pingPrisma(): Promise<boolean> {
  try {
    const client = getPrisma();
    // Verify both reachability AND that our schema is applied.
    // to_regclass returns null when the table doesn't exist — catches the case
    // where DB is up but migrations haven't run yet (e.g. fresh container
    // still starting up, or a botched migrate deploy).
    const rows = await client.$queryRawUnsafe<Array<{ table: string | null }>>(
      `SELECT to_regclass('public.jobs')::text AS "table"`,
    );
    return rows[0]?.table === 'jobs';
  } catch {
    return false;
  }
}
