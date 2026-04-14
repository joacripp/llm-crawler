import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  datasource: {
    // Prisma v7 requires this in config (can no longer live in schema.prisma
    // when an adapter is in use). Runtime queries still go through PrismaPg
    // adapter configured in packages/shared/src/prisma.ts — this field is
    // only consulted by migrate/introspect CLI commands.
    url: process.env.DATABASE_URL,
  },
});
