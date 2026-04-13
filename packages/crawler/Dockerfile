FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY prisma ./prisma/
COPY packages/shared ./packages/shared/
COPY packages/crawler ./packages/crawler/

RUN npm ci
RUN npx prisma generate
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=packages/crawler

# Bundle with esbuild — externalize playwright-core and @sparticuz/chromium
RUN npx esbuild packages/crawler/src/index.ts \
    --bundle --platform=node --target=node20 --format=cjs \
    --outfile=/app/bundle/index.js \
    --external:playwright-core \
    --external:@sparticuz/chromium \
    --external:@aws-sdk/client-eventbridge \
    --external:@aws-sdk/client-sqs \
    --external:@aws-sdk/client-s3

# --- Final stage ---
FROM public.ecr.aws/lambda/nodejs:20

# Install Chromium dependencies
RUN dnf install -y \
    nss \
    atk \
    at-spi2-atk \
    cups-libs \
    libdrm \
    libXcomposite \
    libXdamage \
    libXrandr \
    mesa-libgbm \
    pango \
    alsa-lib \
    libXScrnSaver \
    gtk3 \
    && dnf clean all

# Copy the bundled handler + all node_modules (for externalized deps)
COPY --from=builder /app/bundle/index.js ${LAMBDA_TASK_ROOT}/index.js
COPY --from=builder /app/node_modules ${LAMBDA_TASK_ROOT}/node_modules

CMD ["index.handler"]
