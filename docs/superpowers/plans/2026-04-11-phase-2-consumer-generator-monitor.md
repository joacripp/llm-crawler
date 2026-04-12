# Phase 2: Consumer + Generator + Monitor Lambdas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the three Lambda consumers that process crawler events: Consumer (persists pages to Postgres, publishes to Redis), Generator (builds llms.txt, writes to S3), and Monitor (detects stale jobs, re-enqueues for resurrection).

**Architecture:** The Crawler Lambda (Phase 1) emits events to EventBridge. EventBridge routes `page.crawled` → SQS → Consumer Lambda, and `job.completed` → SQS → Generator Lambda. Consumer writes to Postgres and publishes progress to Redis. Generator reads pages from Postgres, generates llms.txt, writes to S3, publishes completion to Redis, and cleans up Postgres. Monitor runs on a cron, detects stale jobs, computes pending URLs, and re-enqueues to SQS.

**Tech Stack:** TypeScript, Prisma Client, AWS SDK (SQS, S3), ioredis, Vitest

**Spec:** `docs/superpowers/specs/2026-04-10-llms-txt-generator-design.md`

---

## File Structure

```
packages/
├── shared/
│   ├── src/
│   │   ├── types.ts              # (existing) add RedisMessage types
│   │   ├── prisma.ts             # Prisma client singleton
│   │   ├── redis.ts              # Redis publish helper
│   │   ├── generator.ts          # llms.txt generation logic (moved from prototype)
│   │   └── index.ts              # (update barrel)
│   └── tests/
│       ├── generator.test.ts
│       └── redis.test.ts
├── consumer/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── handler.ts            # Lambda entry: SQS → persist page + discovered_urls → Redis pub
│   │   └── index.ts
│   └── tests/
│       └── handler.test.ts
├── generator/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── handler.ts            # Lambda entry: SQS → read pages → generate → S3 → cleanup → Redis pub
│   │   └── index.ts
│   └── tests/
│       └── handler.test.ts
└── monitor/
    ├── package.json
    ├── tsconfig.json
    ├── src/
    │   ├── handler.ts            # Lambda entry: cron → find stale jobs → compute pending → re-enqueue
    │   └── index.ts
    └── tests/
        └── handler.test.ts
```

---

### Task 1: Shared — Redis Publish Helper

**Files:**
- Create: `packages/shared/src/redis.ts`
- Modify: `packages/shared/src/types.ts` (add Redis message types)
- Modify: `packages/shared/src/index.ts` (update barrel)
- Test: `packages/shared/tests/redis.test.ts`

- [ ] **Step 1: Add Redis message types to types.ts**

```typescript
// Add to packages/shared/src/types.ts

export interface RedisProgressMessage {
  type: 'progress';
  pagesFound: number;
}

export interface RedisCompletedMessage {
  type: 'completed';
  downloadUrl: string;
}

export type RedisJobMessage = RedisProgressMessage | RedisCompletedMessage;
```

- [ ] **Step 2: Write the test**

```typescript
// packages/shared/tests/redis.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { publishJobUpdate } from '../src/redis.js';

const mockPublish = vi.fn().mockResolvedValue(1);
const mockQuit = vi.fn().mockResolvedValue('OK');

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    publish: mockPublish,
    quit: mockQuit,
  })),
}));

describe('publishJobUpdate', () => {
  beforeEach(() => {
    mockPublish.mockClear();
  });

  it('publishes progress to job:{jobId} channel', async () => {
    await publishJobUpdate('abc-123', { type: 'progress', pagesFound: 42 });
    expect(mockPublish).toHaveBeenCalledWith(
      'job:abc-123',
      JSON.stringify({ type: 'progress', pagesFound: 42 })
    );
  });

  it('publishes completion to job:{jobId} channel', async () => {
    await publishJobUpdate('abc-123', { type: 'completed', downloadUrl: 'https://s3.example.com/llms.txt' });
    expect(mockPublish).toHaveBeenCalledWith(
      'job:abc-123',
      JSON.stringify({ type: 'completed', downloadUrl: 'https://s3.example.com/llms.txt' })
    );
  });
});
```

- [ ] **Step 3: Run test — should fail**

Run: `cd packages/shared && npx vitest run tests/redis.test.ts`

- [ ] **Step 4: Write redis.ts**

```typescript
// packages/shared/src/redis.ts
import Redis from 'ioredis';
import type { RedisJobMessage } from './types.js';

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL env var is required');
    redis = new Redis(url);
  }
  return redis;
}

export async function publishJobUpdate(jobId: string, message: RedisJobMessage): Promise<void> {
  const client = getRedis();
  await client.publish(`job:${jobId}`, JSON.stringify(message));
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
```

- [ ] **Step 5: Install ioredis in shared package**

Run: `npm install --workspace=packages/shared ioredis`
Run: `npm install --workspace=packages/shared -D @types/ioredis` (if needed — ioredis ships its own types, check first)

- [ ] **Step 6: Update barrel export in index.ts**

Add to `packages/shared/src/index.ts`:
```typescript
export type { RedisProgressMessage, RedisCompletedMessage, RedisJobMessage } from './types.js';
export { publishJobUpdate, disconnectRedis } from './redis.js';
```

- [ ] **Step 7: Run test — should pass**

Run: `cd packages/shared && npx vitest run tests/redis.test.ts`

- [ ] **Step 8: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): Redis pub/sub helper + message types"
```

---

### Task 2: Shared — Prisma Client Singleton

**Files:**
- Create: `packages/shared/src/prisma.ts`
- Modify: `packages/shared/src/index.ts` (update barrel)

- [ ] **Step 1: Install @prisma/client in shared package**

Run: `npm install --workspace=packages/shared @prisma/client`

- [ ] **Step 2: Generate Prisma client**

Run: `cd packages/shared && npx prisma generate --schema=../../prisma/schema.prisma`

- [ ] **Step 3: Write prisma.ts**

```typescript
// packages/shared/src/prisma.ts
import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
```

- [ ] **Step 4: Update barrel export**

Add to `packages/shared/src/index.ts`:
```typescript
export { getPrisma, disconnectPrisma } from './prisma.js';
```

- [ ] **Step 5: Build shared to verify**

Run: `cd packages/shared && npm run build`

- [ ] **Step 6: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): Prisma client singleton"
```

---

### Task 3: Shared — llms.txt Generator

**Files:**
- Create: `packages/shared/src/generator.ts`
- Test: `packages/shared/tests/generator.test.ts`
- Modify: `packages/shared/src/index.ts` (update barrel)

- [ ] **Step 1: Write the test**

```typescript
// packages/shared/tests/generator.test.ts
import { describe, it, expect } from 'vitest';
import { generateLlmsTxt } from '../src/generator.js';
import type { PageData } from '../src/types.js';

describe('generateLlmsTxt', () => {
  it('generates header from root page', () => {
    const pages: PageData[] = [
      { url: 'https://example.com/', title: 'Example Site', description: 'A great site', depth: 0 },
    ];
    const result = generateLlmsTxt(pages, 'https://example.com');
    expect(result).toContain('# Example Site');
    expect(result).toContain('> A great site');
  });

  it('groups pages by first path segment', () => {
    const pages: PageData[] = [
      { url: 'https://example.com/', title: 'Home', description: 'Homepage', depth: 0 },
      { url: 'https://example.com/docs/intro', title: 'Intro', description: 'Getting started', depth: 1 },
      { url: 'https://example.com/docs/api', title: 'API', description: 'API reference', depth: 1 },
      { url: 'https://example.com/blog/post-1', title: 'Post 1', description: 'First post', depth: 1 },
    ];
    const result = generateLlmsTxt(pages, 'https://example.com');
    expect(result).toContain('## Docs');
    expect(result).toContain('## Blog');
    expect(result).toContain('- [Intro](https://example.com/docs/intro): Getting started');
  });

  it('prioritizes docs/api/blog sections', () => {
    const pages: PageData[] = [
      { url: 'https://example.com/', title: 'Home', description: '', depth: 0 },
      { url: 'https://example.com/zebra/page', title: 'Zebra', description: '', depth: 1 },
      { url: 'https://example.com/docs/page', title: 'Doc', description: '', depth: 1 },
      { url: 'https://example.com/blog/page', title: 'Blog', description: '', depth: 1 },
    ];
    const result = generateLlmsTxt(pages, 'https://example.com');
    const docsIdx = result.indexOf('## Docs');
    const blogIdx = result.indexOf('## Blog');
    const zebraIdx = result.indexOf('## Zebra');
    expect(docsIdx).toBeLessThan(blogIdx);
    expect(blogIdx).toBeLessThan(zebraIdx);
  });

  it('returns fallback for empty pages', () => {
    const result = generateLlmsTxt([], 'https://example.com');
    expect(result).toContain('No pages could be crawled');
  });

  it('extracts site title from separator patterns', () => {
    const pages: PageData[] = [
      { url: 'https://example.com/', title: 'Home | My Brand', description: '', depth: 0 },
    ];
    const result = generateLlmsTxt(pages, 'https://example.com');
    expect(result).toContain('# My Brand');
  });
});
```

- [ ] **Step 2: Run test — should fail**

Run: `cd packages/shared && npx vitest run tests/generator.test.ts`

- [ ] **Step 3: Write generator.ts**

This is adapted from the existing prototype `src/generator.ts`:

```typescript
// packages/shared/src/generator.ts
import type { PageData } from './types.js';

export function generateLlmsTxt(pages: PageData[], rootUrl: string): string {
  if (pages.length === 0) {
    return `# ${new URL(rootUrl).hostname}\n\n> No pages could be crawled from this URL.\n`;
  }

  const rootPage =
    pages.find((p) => {
      const u = new URL(p.url);
      return u.pathname === '/' || u.pathname === '';
    }) ?? pages[0];

  const siteTitle = extractSiteTitle(rootPage.title, new URL(rootUrl).hostname);
  const lines: string[] = [];

  lines.push(`# ${siteTitle}`);
  lines.push('');

  if (rootPage.description) {
    lines.push(`> ${rootPage.description}`);
    lines.push('');
  }

  const nonRoot = pages.filter((p) => p !== rootPage);

  if (nonRoot.length === 0) {
    lines.push(`- [${rootPage.title}](${rootPage.url})`);
    return lines.join('\n');
  }

  const sectionMap = new Map<string, PageData[]>();

  for (const page of nonRoot) {
    const u = new URL(page.url);
    const segments = u.pathname.split('/').filter(Boolean);
    const sectionKey = segments.length > 0 ? segments[0] : 'pages';
    const sectionLabel = capitalize(sectionKey.replace(/[-_]/g, ' '));
    if (!sectionMap.has(sectionLabel)) sectionMap.set(sectionLabel, []);
    sectionMap.get(sectionLabel)!.push(page);
  }

  const PRIORITY = ['docs', 'documentation', 'guide', 'guides', 'api', 'blog', 'about'];
  const sorted = [...sectionMap.entries()].sort(([a], [b]) => {
    const ai = PRIORITY.indexOf(a.toLowerCase());
    const bi = PRIORITY.indexOf(b.toLowerCase());
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });

  for (const [section, sectionPages] of sorted) {
    lines.push(`## ${section}`);
    lines.push('');
    for (const page of sectionPages) {
      const desc = page.description ? `: ${page.description}` : '';
      lines.push(`- [${page.title}](${page.url})${desc}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

function extractSiteTitle(rootTitle: string, hostname: string): string {
  const separators = [' | ', ' - ', ' – ', ' — ', ' :: '];
  for (const sep of separators) {
    if (rootTitle.includes(sep)) {
      const parts = rootTitle.split(sep);
      const last = parts[parts.length - 1].trim();
      const first = parts[0].trim();
      if (last.split(' ').length <= 3) return last;
      if (first.split(' ').length <= 3) return first;
    }
  }
  return rootTitle || hostname;
}

function capitalize(s: string): string {
  return s.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
```

- [ ] **Step 4: Update barrel export**

Add to `packages/shared/src/index.ts`:
```typescript
export { generateLlmsTxt } from './generator.js';
```

- [ ] **Step 5: Run test — should pass**

Run: `cd packages/shared && npx vitest run tests/generator.test.ts`

- [ ] **Step 6: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): llms.txt generator logic"
```

---

### Task 4: Consumer Lambda Package Scaffold

**Files:**
- Create: `packages/consumer/package.json`
- Create: `packages/consumer/tsconfig.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@llm-crawler/consumer",
  "version": "0.0.1",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@llm-crawler/shared": "*",
    "@prisma/client": "^5.0.0"
  },
  "devDependencies": {
    "vitest": "^3.1.1",
    "@types/node": "^22.10.7",
    "@types/aws-lambda": "^8.10.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "references": [{ "path": "../shared" }]
}
```

- [ ] **Step 3: Install deps**

Run: `npm install`

- [ ] **Step 4: Commit**

```bash
git add packages/consumer/
git commit -m "scaffold: consumer Lambda package"
```

---

### Task 5: Consumer Lambda Handler

**Files:**
- Create: `packages/consumer/src/handler.ts`
- Create: `packages/consumer/src/index.ts`
- Test: `packages/consumer/tests/handler.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// packages/consumer/tests/handler.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma
const mockUpsertPage = vi.fn().mockResolvedValue({ id: 1 });
const mockUpsertDiscoveredUrl = vi.fn().mockResolvedValue({ id: 1 });
const mockUpdateJob = vi.fn().mockResolvedValue({ id: 'job-1' });
const mockCountPages = vi.fn().mockResolvedValue(42);

vi.mock('@llm-crawler/shared', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    getPrisma: vi.fn(() => ({
      page: { upsert: mockUpsertPage },
      discoveredUrl: { upsert: mockUpsertDiscoveredUrl },
      job: { update: mockUpdateJob },
      $transaction: vi.fn(async (fn) => fn({
        page: { upsert: mockUpsertPage, count: mockCountPages },
        discoveredUrl: { upsert: mockUpsertDiscoveredUrl },
        job: { update: mockUpdateJob },
      })),
    })),
    publishJobUpdate: vi.fn().mockResolvedValue(undefined),
    disconnectPrisma: vi.fn().mockResolvedValue(undefined),
    disconnectRedis: vi.fn().mockResolvedValue(undefined),
  };
});

const { handler } = await import('../src/handler.js');
const { publishJobUpdate } = await import('@llm-crawler/shared');

function makeSQSEvent(detail: object) {
  return {
    Records: [{
      body: JSON.stringify({
        source: 'llm-crawler',
        'detail-type': 'page.crawled',
        detail: detail,
      }),
    }],
  } as any;
}

describe('consumer handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCountPages.mockResolvedValue(42);
  });

  it('upserts page data into Postgres', async () => {
    await handler(makeSQSEvent({
      jobId: 'job-1', url: 'https://example.com/about',
      title: 'About', description: 'About page', depth: 1,
      newUrls: [],
    }));
    expect(mockUpsertPage).toHaveBeenCalled();
  });

  it('upserts discovered URLs', async () => {
    await handler(makeSQSEvent({
      jobId: 'job-1', url: 'https://example.com/',
      title: 'Home', description: '', depth: 0,
      newUrls: ['https://example.com/about', 'https://example.com/docs'],
    }));
    expect(mockUpsertDiscoveredUrl).toHaveBeenCalledTimes(2);
  });

  it('updates job.updated_at', async () => {
    await handler(makeSQSEvent({
      jobId: 'job-1', url: 'https://example.com/',
      title: 'Home', description: '', depth: 0, newUrls: [],
    }));
    expect(mockUpdateJob).toHaveBeenCalled();
  });

  it('publishes progress to Redis', async () => {
    await handler(makeSQSEvent({
      jobId: 'job-1', url: 'https://example.com/',
      title: 'Home', description: '', depth: 0, newUrls: [],
    }));
    expect(publishJobUpdate).toHaveBeenCalledWith('job-1', { type: 'progress', pagesFound: 42 });
  });
});
```

- [ ] **Step 2: Run test — should fail**

Run: `cd packages/consumer && npx vitest run`

- [ ] **Step 3: Write handler.ts**

```typescript
// packages/consumer/src/handler.ts
import type { SQSEvent } from 'aws-lambda';
import type { PageCrawledEvent } from '@llm-crawler/shared';
import { getPrisma, publishJobUpdate, disconnectPrisma, disconnectRedis } from '@llm-crawler/shared';

export async function handler(event: SQSEvent): Promise<void> {
  const prisma = getPrisma();

  try {
    for (const record of event.Records) {
      const envelope = JSON.parse(record.body);
      const detail: PageCrawledEvent = envelope.detail;
      const { jobId, url, title, description, depth, newUrls } = detail;

      await prisma.$transaction(async (tx) => {
        // Upsert page (dedup for SQS at-least-once)
        await tx.page.upsert({
          where: { jobId_url: { jobId, url } },
          create: { jobId, url, title, description, depth },
          update: { title, description, depth },
        });

        // Upsert discovered URLs for resurrection
        for (const discoveredUrl of newUrls) {
          await tx.discoveredUrl.upsert({
            where: { jobId_url: { jobId, url: discoveredUrl } },
            create: { jobId, url: discoveredUrl },
            update: {},
          });
        }

        // Update job heartbeat
        await tx.job.update({
          where: { id: jobId },
          data: { updatedAt: new Date(), status: 'running' },
        });
      });

      // Get current page count for progress
      const pagesFound = await prisma.page.count({ where: { jobId } });

      // Publish to Redis (fire-and-forget)
      await publishJobUpdate(jobId, { type: 'progress', pagesFound });
    }
  } finally {
    await disconnectPrisma();
    await disconnectRedis();
  }
}
```

- [ ] **Step 4: Create barrel export**

```typescript
// packages/consumer/src/index.ts
export { handler } from './handler.js';
```

- [ ] **Step 5: Run test — should pass**

Run: `cd packages/consumer && npx vitest run`

- [ ] **Step 6: Commit**

```bash
git add packages/consumer/
git commit -m "feat(consumer): Lambda handler — persist pages + discovered URLs, Redis progress"
```

---

### Task 6: Generator Lambda Package

**Files:**
- Create: `packages/generator/package.json`
- Create: `packages/generator/tsconfig.json`
- Create: `packages/generator/src/handler.ts`
- Create: `packages/generator/src/index.ts`
- Test: `packages/generator/tests/handler.test.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@llm-crawler/generator",
  "version": "0.0.1",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@llm-crawler/shared": "*",
    "@prisma/client": "^5.0.0",
    "@aws-sdk/client-s3": "^3.700.0"
  },
  "devDependencies": {
    "vitest": "^3.1.1",
    "@types/node": "^22.10.7",
    "@types/aws-lambda": "^8.10.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json** (same pattern as consumer)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"],
  "references": [{ "path": "../shared" }]
}
```

- [ ] **Step 3: Write the test**

```typescript
// packages/generator/tests/handler.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPages = [
  { url: 'https://example.com/', title: 'Home', description: 'Homepage', depth: 0 },
  { url: 'https://example.com/docs/intro', title: 'Intro', description: 'Getting started', depth: 1 },
];

const mockFindMany = vi.fn().mockResolvedValue(mockPages);
const mockDeleteManyPages = vi.fn().mockResolvedValue({ count: 2 });
const mockDeleteManyDiscovered = vi.fn().mockResolvedValue({ count: 5 });
const mockUpdateJob = vi.fn().mockResolvedValue({});

vi.mock('@llm-crawler/shared', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    getPrisma: vi.fn(() => ({
      page: { findMany: mockFindMany, deleteMany: mockDeleteManyPages },
      discoveredUrl: { deleteMany: mockDeleteManyDiscovered },
      job: { update: mockUpdateJob },
    })),
    publishJobUpdate: vi.fn().mockResolvedValue(undefined),
    disconnectPrisma: vi.fn().mockResolvedValue(undefined),
    disconnectRedis: vi.fn().mockResolvedValue(undefined),
  };
});

const mockPutObject = vi.fn().mockResolvedValue({});
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: mockPutObject })),
  PutObjectCommand: vi.fn().mockImplementation((input) => input),
}));

const { handler } = await import('../src/handler.js');
const { publishJobUpdate } = await import('@llm-crawler/shared');

function makeSQSEvent(detail: object) {
  return {
    Records: [{
      body: JSON.stringify({ source: 'llm-crawler', 'detail-type': 'job.completed', detail }),
    }],
  } as any;
}

describe('generator handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.S3_BUCKET = 'test-bucket';
  });

  it('reads pages from Postgres', async () => {
    await handler(makeSQSEvent({ jobId: 'job-1' }));
    expect(mockFindMany).toHaveBeenCalledWith({ where: { jobId: 'job-1' } });
  });

  it('uploads llms.txt to S3', async () => {
    await handler(makeSQSEvent({ jobId: 'job-1' }));
    expect(mockPutObject).toHaveBeenCalledTimes(2); // llms.txt + pages.json
    const firstCall = mockPutObject.mock.calls[0][0];
    expect(firstCall.Key).toBe('results/job-1/llms.txt');
    expect(firstCall.Bucket).toBe('test-bucket');
  });

  it('cleans up pages and discovered_urls from Postgres', async () => {
    await handler(makeSQSEvent({ jobId: 'job-1' }));
    expect(mockDeleteManyPages).toHaveBeenCalledWith({ where: { jobId: 'job-1' } });
    expect(mockDeleteManyDiscovered).toHaveBeenCalledWith({ where: { jobId: 'job-1' } });
  });

  it('updates job status to completed with s3_key', async () => {
    await handler(makeSQSEvent({ jobId: 'job-1' }));
    expect(mockUpdateJob).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { status: 'completed', s3Key: 'results/job-1/llms.txt' },
    });
  });

  it('publishes completion to Redis', async () => {
    await handler(makeSQSEvent({ jobId: 'job-1' }));
    expect(publishJobUpdate).toHaveBeenCalledWith('job-1', expect.objectContaining({ type: 'completed' }));
  });
});
```

- [ ] **Step 4: Run test — should fail**

- [ ] **Step 5: Write handler.ts**

```typescript
// packages/generator/src/handler.ts
import type { SQSEvent } from 'aws-lambda';
import type { JobCompletedEvent, PageData } from '@llm-crawler/shared';
import { getPrisma, generateLlmsTxt, publishJobUpdate, disconnectPrisma, disconnectRedis } from '@llm-crawler/shared';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export async function handler(event: SQSEvent): Promise<void> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error('S3_BUCKET env var is required');

  const prisma = getPrisma();
  const s3 = new S3Client();

  try {
    for (const record of event.Records) {
      const envelope = JSON.parse(record.body);
      const detail: JobCompletedEvent = envelope.detail;
      const { jobId } = detail;

      // Read job for rootUrl
      const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
      const rootUrl = job.rootUrl;

      // Read all pages
      const pages = await prisma.page.findMany({ where: { jobId } });
      const pageData: PageData[] = pages.map((p) => ({
        url: p.url,
        title: p.title ?? p.url,
        description: p.description ?? '',
        depth: p.depth ?? 0,
      }));

      // Generate llms.txt
      const llmsTxt = generateLlmsTxt(pageData, rootUrl);
      const s3Key = `results/${jobId}/llms.txt`;

      // Upload llms.txt
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        Body: llmsTxt,
        ContentType: 'text/plain',
      }));

      // Archive pages as JSON
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: `results/${jobId}/pages.json`,
        Body: JSON.stringify(pageData, null, 2),
        ContentType: 'application/json',
      }));

      // Update job
      await prisma.job.update({
        where: { id: jobId },
        data: { status: 'completed', s3Key },
      });

      // Cleanup Postgres
      await prisma.page.deleteMany({ where: { jobId } });
      await prisma.discoveredUrl.deleteMany({ where: { jobId } });

      // Publish to Redis
      const downloadUrl = `https://${bucket}.s3.amazonaws.com/${s3Key}`;
      await publishJobUpdate(jobId, { type: 'completed', downloadUrl });
    }
  } finally {
    await disconnectPrisma();
    await disconnectRedis();
  }
}
```

- [ ] **Step 6: Create barrel export**

```typescript
// packages/generator/src/index.ts
export { handler } from './handler.js';
```

- [ ] **Step 7: Install deps and run tests**

Run: `npm install && cd packages/generator && npx vitest run`

- [ ] **Step 8: Commit**

```bash
git add packages/generator/
git commit -m "feat(generator): Lambda handler — build llms.txt, S3 upload, Postgres cleanup, Redis notify"
```

---

### Task 7: Monitor Lambda Package

**Files:**
- Create: `packages/monitor/package.json`
- Create: `packages/monitor/tsconfig.json`
- Create: `packages/monitor/src/handler.ts`
- Create: `packages/monitor/src/index.ts`
- Test: `packages/monitor/tests/handler.test.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@llm-crawler/monitor",
  "version": "0.0.1",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@llm-crawler/shared": "*",
    "@prisma/client": "^5.0.0",
    "@aws-sdk/client-sqs": "^3.700.0",
    "@aws-sdk/client-s3": "^3.700.0"
  },
  "devDependencies": {
    "vitest": "^3.1.1",
    "@types/node": "^22.10.7"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"],
  "references": [{ "path": "../shared" }]
}
```

- [ ] **Step 3: Write the test**

```typescript
// packages/monitor/tests/handler.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const staleJob = {
  id: 'stale-1',
  rootUrl: 'https://example.com',
  invocations: 2,
  maxDepth: 3,
  maxPages: 200,
};

const mockFindManyJobs = vi.fn().mockResolvedValue([staleJob]);
const mockFindManyPages = vi.fn().mockResolvedValue([
  { url: 'https://example.com/' },
  { url: 'https://example.com/about' },
]);
const mockFindManyDiscovered = vi.fn().mockResolvedValue([
  { url: 'https://example.com/' },
  { url: 'https://example.com/about' },
  { url: 'https://example.com/docs' },
  { url: 'https://example.com/blog' },
]);
const mockUpdateJob = vi.fn().mockResolvedValue({});

vi.mock('@llm-crawler/shared', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    getPrisma: vi.fn(() => ({
      job: { findMany: mockFindManyJobs, update: mockUpdateJob },
      page: { findMany: mockFindManyPages },
      discoveredUrl: { findMany: mockFindManyDiscovered },
    })),
    disconnectPrisma: vi.fn().mockResolvedValue(undefined),
  };
});

const mockSendMessage = vi.fn().mockResolvedValue({});
vi.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: vi.fn().mockImplementation(() => ({ send: mockSendMessage })),
  SendMessageCommand: vi.fn().mockImplementation((input) => input),
}));

const { handler } = await import('../src/handler.js');

describe('monitor handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JOBS_QUEUE_URL = 'https://sqs.example.com/crawl-jobs';
    process.env.MAX_INVOCATIONS = '10';
    process.env.STALE_THRESHOLD_MINUTES = '3';
  });

  it('finds stale jobs', async () => {
    await handler();
    expect(mockFindManyJobs).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'running' }),
    }));
  });

  it('computes pending URLs (discovered minus visited)', async () => {
    await handler();
    const call = mockSendMessage.mock.calls[0][0];
    const body = JSON.parse(call.MessageBody);
    expect(body.urls).toContain('https://example.com/docs');
    expect(body.urls).toContain('https://example.com/blog');
    expect(body.urls).not.toContain('https://example.com/');
    expect(body.urls).not.toContain('https://example.com/about');
  });

  it('includes visited URLs in message', async () => {
    await handler();
    const call = mockSendMessage.mock.calls[0][0];
    const body = JSON.parse(call.MessageBody);
    expect(body.visited).toContain('https://example.com/');
    expect(body.visited).toContain('https://example.com/about');
  });

  it('increments job invocations', async () => {
    await handler();
    expect(mockUpdateJob).toHaveBeenCalledWith({
      where: { id: 'stale-1' },
      data: { invocations: 3, status: 'pending' },
    });
  });

  it('marks job as failed when max invocations exceeded', async () => {
    mockFindManyJobs.mockResolvedValueOnce([{ ...staleJob, invocations: 10 }]);
    await handler();
    expect(mockUpdateJob).toHaveBeenCalledWith({
      where: { id: 'stale-1' },
      data: { status: 'failed' },
    });
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('triggers generator when no pending URLs remain', async () => {
    process.env.COMPLETED_QUEUE_URL = 'https://sqs.example.com/crawl-completed';
    mockFindManyDiscovered.mockResolvedValueOnce([
      { url: 'https://example.com/' },
      { url: 'https://example.com/about' },
    ]);
    await handler();
    // All discovered = all visited, should trigger generator not re-enqueue crawler
    expect(mockSendMessage).toHaveBeenCalledOnce();
    const body = JSON.parse(mockSendMessage.mock.calls[0][0].MessageBody);
    expect(body['detail-type']).toBe('job.completed');
  });
});
```

- [ ] **Step 4: Run test — should fail**

- [ ] **Step 5: Write handler.ts**

```typescript
// packages/monitor/src/handler.ts
import { getPrisma, disconnectPrisma } from '@llm-crawler/shared';
import type { JobMessage } from '@llm-crawler/shared';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

export async function handler(): Promise<void> {
  const queueUrl = process.env.JOBS_QUEUE_URL;
  if (!queueUrl) throw new Error('JOBS_QUEUE_URL env var is required');

  const maxInvocations = parseInt(process.env.MAX_INVOCATIONS ?? '10', 10);
  const staleMinutes = parseInt(process.env.STALE_THRESHOLD_MINUTES ?? '3', 10);

  const prisma = getPrisma();
  const sqs = new SQSClient();

  try {
    const threshold = new Date(Date.now() - staleMinutes * 60 * 1000);

    const staleJobs = await prisma.job.findMany({
      where: {
        status: 'running',
        updatedAt: { lt: threshold },
      },
    });

    for (const job of staleJobs) {
      if (job.invocations >= maxInvocations) {
        await prisma.job.update({
          where: { id: job.id },
          data: { status: 'failed' },
        });
        continue;
      }

      // Get visited URLs (pages already crawled)
      const visitedRows = await prisma.page.findMany({
        where: { jobId: job.id },
        select: { url: true },
      });
      const visited = visitedRows.map((r) => r.url);
      const visitedSet = new Set(visited);

      // Get all discovered URLs
      const discoveredRows = await prisma.discoveredUrl.findMany({
        where: { jobId: job.id },
        select: { url: true },
      });

      // Pending = discovered minus visited
      const pending = discoveredRows
        .map((r) => r.url)
        .filter((url) => !visitedSet.has(url));

      if (pending.length === 0) {
        // Nothing left to crawl — trigger Generator via completed queue
        // (Don't mark completed directly — Generator handles S3 upload + cleanup)
        await sqs.send(new SendMessageCommand({
          QueueUrl: process.env.COMPLETED_QUEUE_URL!,
          MessageBody: JSON.stringify({
            source: 'llm-crawler',
            'detail-type': 'job.completed',
            detail: { jobId: job.id },
          }),
        }));
        continue;
      }

      // Build job message
      const message: JobMessage = {
        jobId: job.id,
        urls: pending,
        visited,
        maxDepth: job.maxDepth,
        maxPages: job.maxPages,
      };

      // TODO: if message > 256KB, store in S3 and pass stateS3Key instead
      // For MVP, send directly

      await sqs.send(new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message),
      }));

      await prisma.job.update({
        where: { id: job.id },
        data: { invocations: job.invocations + 1, status: 'pending' },
      });
    }
  } finally {
    await disconnectPrisma();
  }
}
```

- [ ] **Step 6: Create barrel export**

```typescript
// packages/monitor/src/index.ts
export { handler } from './handler.js';
```

- [ ] **Step 7: Install deps and run tests**

Run: `npm install && cd packages/monitor && npx vitest run`

- [ ] **Step 8: Commit**

```bash
git add packages/monitor/
git commit -m "feat(monitor): Lambda handler — detect stale jobs, compute pending, re-enqueue"
```

---

### Task 8: Build All + Final Verification

- [ ] **Step 1: Build everything**

Run: `npm run build`
Expected: all 5 packages compile (shared, crawler, consumer, generator, monitor)

- [ ] **Step 2: Run all tests**

Run: `npm run test`
Expected: all tests pass across all packages

- [ ] **Step 3: Commit if any fixes needed**

```bash
git add -A
git commit -m "chore: complete phase 2 — consumer, generator, monitor Lambdas"
```
