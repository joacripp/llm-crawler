FROM node:20-slim AS builder

WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY prisma ./prisma/

# Copy only the packages we need
COPY packages/shared ./packages/shared/
COPY packages/api ./packages/api/

# Install all deps
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Build shared first, then api
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=packages/api

# --- Production stage ---
FROM node:20-slim

WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist/
COPY --from=builder /app/packages/api/package.json ./packages/api/
COPY --from=builder /app/packages/api/dist ./packages/api/dist/
COPY --from=builder /app/node_modules ./node_modules/

EXPOSE 3000

CMD ["node", "packages/api/dist/main.js"]
