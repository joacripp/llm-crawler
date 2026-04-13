FROM public.ecr.aws/lambda/nodejs:20 AS base

# Install dependencies needed by Chromium
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

# --- Build stage ---
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY prisma ./prisma/
COPY packages/shared ./packages/shared/
COPY packages/crawler ./packages/crawler/

RUN npm ci

# Install Playwright Chromium (both full and headless shell)
RUN npx playwright-core install chromium
RUN npx playwright-core install chromium-headless-shell

RUN npx prisma generate
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=packages/crawler

# Bundle with esbuild — externalize playwright-core (it has native deps that can't be bundled)
RUN npx esbuild packages/crawler/src/index.ts \
    --bundle --platform=node --target=node20 --format=cjs \
    --outfile=/app/bundle/index.js \
    --external:playwright-core \
    --external:@aws-sdk/client-eventbridge \
    --external:@aws-sdk/client-sqs \
    --external:@aws-sdk/client-s3

# --- Final stage ---
FROM base

# Copy Playwright's Chromium to a Lambda-accessible path
COPY --from=builder /root/.cache/ms-playwright /opt/ms-playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright

# Copy playwright-core module (externalized from bundle)
COPY --from=builder /app/node_modules/playwright-core ${LAMBDA_TASK_ROOT}/node_modules/playwright-core

# Copy the bundled handler
COPY --from=builder /app/bundle/index.js ${LAMBDA_TASK_ROOT}/index.js

CMD ["index.handler"]
