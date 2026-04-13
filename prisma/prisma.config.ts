import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, 'schema.prisma'),
  migrate: {
    async url() {
      return process.env.DATABASE_URL!;
    },
    shadowDatabase: {
      async url() {
        // Used by `prisma migrate diff --from-migrations` to apply migrations
        // to a throwaway database before comparing. Falls back to DATABASE_URL
        // when SHADOW_DATABASE_URL isn't set — fine for CI where DATABASE_URL
        // already points at a disposable Postgres service container.
        return process.env.SHADOW_DATABASE_URL ?? process.env.DATABASE_URL!;
      },
    },
  },
});
