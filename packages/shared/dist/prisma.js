import { PrismaClient } from '@prisma/client';
let prisma = null;
export function getPrisma() {
    if (!prisma) {
        prisma = new PrismaClient();
    }
    return prisma;
}
export async function disconnectPrisma() {
    if (prisma) {
        await prisma.$disconnect();
        prisma = null;
    }
}
//# sourceMappingURL=prisma.js.map