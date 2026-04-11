# Phase 1: Monorepo Scaffold + Shared Package + Crawler Lambda

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the Turborepo monorepo, create the shared types + Prisma package, and adapt the existing crawler into a Lambda-compatible package that emits events to EventBridge.

**Architecture:** The crawler Lambda receives a job message from SQS containing URLs to crawl. It maintains BFS state in memory (visited set + pending queue), fetches/parses pages using Cheerio (or Playwright for SPAs), and emits `page.crawled` events to EventBridge for each page. When the pending queue is empty, it emits `job.completed`. The crawler never touches Postgres — all persistence is handled by downstream consumers.

**Tech Stack:** TypeScript, Turborepo, npm workspaces, Prisma, Cheerio, Playwright, AWS SDK (EventBridge client), Vitest

**Spec:** `docs/superpowers/specs/2026-04-10-llms-txt-generator-design.md`

---

## File Structure

```
llm-crawler/
├── package.json                          # workspace root
├── turbo.json                            # turborepo config
├── tsconfig.base.json                    # shared TS config
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── types.ts                  # PageData, JobMessage, CrawlEvent interfaces
│   │   │   ├── url-utils.ts              # normalizeUrl, isSkippable, SKIP_EXTENSIONS, SKIP_PATHS
│   │   │   └── index.ts                  # barrel export
│   │   └── tests/
│   │       ├── types.test.ts
│   │       └── url-utils.test.ts
│   └── crawler/
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── handler.ts                # Lambda entry point: receives SQS event, orchestrates crawl
│       │   ├── crawl.ts                  # BFS engine: stateful crawl loop
│       │   ├── fetcher.ts                # fetchWithAxios, fetchWithBrowser
│       │   ├── parser.ts                 # extractPageData from HTML string
│       │   ├── spa-detector.ts           # isSpa() heuristic
│       │   ├── event-emitter.ts          # emit page.crawled / job.completed to EventBridge
│       │   └── index.ts                  # barrel export of handler
│       └── tests/
│           ├── crawl.test.ts
│           ├── parser.test.ts
│           ├── spa-detector.test.ts
│           ├── event-emitter.test.ts
│           └── handler.test.ts
├── prisma/
│   └── schema.prisma                     # DB schema (lives at root, shared by all packages)
└── docs/                                 # existing
```

---

### Task 1: Monorepo Scaffold

**Files:**
- Create: `package.json` (overwrite existing)
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/crawler/package.json`
- Create: `packages/crawler/tsconfig.json`

- [ ] **Step 1: Create root package.json with workspaces**

```json
{
  "name": "llm-crawler",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint",
    "clean": "turbo clean"
  },
  "devDependencies": {
    "turbo": "^2.5.0",
    "typescript": "^5.7.3"
  }
}
```

- [ ] **Step 2: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "lint": {},
    "clean": {
      "cache": false
    }
  }
}
```

- [ ] **Step 3: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 4: Create packages/shared/package.json**

```json
{
  "name": "@llm-crawler/shared",
  "version": "0.0.1",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "clean": "rm -rf dist"
  },
  "devDependencies": {
    "vitest": "^3.1.1"
  }
}
```

- [ ] **Step 5: Create packages/shared/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 6: Create packages/crawler/package.json**

```json
{
  "name": "@llm-crawler/crawler",
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
    "@llm-crawler/shared": "workspace:*",
    "axios": "^1.7.9",
    "cheerio": "1.0.0",
    "p-limit": "^6.2.0",
    "@aws-sdk/client-eventbridge": "^3.700.0"
  },
  "devDependencies": {
    "vitest": "^3.1.1",
    "@types/node": "^22.10.7"
  }
}
```

- [ ] **Step 7: Create packages/crawler/tsconfig.json**

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

- [ ] **Step 8: Install dependencies**

Run: `npm install`
Expected: clean install, all workspaces linked

- [ ] **Step 9: Verify workspace setup**

Run: `npx turbo build --dry`
Expected: shows build order — shared first, then crawler

- [ ] **Step 10: Commit**

```bash
git add package.json turbo.json tsconfig.base.json packages/shared packages/crawler
git commit -m "scaffold: monorepo with turborepo, shared + crawler packages"
```

---

### Task 2: Shared Types

**Files:**
- Create: `packages/shared/src/types.ts`
- Test: `packages/shared/tests/types.test.ts`

- [ ] **Step 1: Write the test for types**

```typescript
// packages/shared/tests/types.test.ts
import { describe, it, expect } from 'vitest';
import type { PageData, JobMessage, PageCrawledEvent, JobCompletedEvent } from '../src/types.js';

describe('types', () => {
  it('PageData has required fields', () => {
    const page: PageData = {
      url: 'https://example.com',
      title: 'Example',
      description: 'A test page',
      depth: 0,
    };
    expect(page.url).toBe('https://example.com');
    expect(page.depth).toBe(0);
  });

  it('JobMessage supports first run (urls only)', () => {
    const msg: JobMessage = {
      jobId: 'abc-123',
      urls: ['https://example.com'],
    };
    expect(msg.visited).toBeUndefined();
    expect(msg.stateS3Key).toBeUndefined();
  });

  it('JobMessage supports resume with visited', () => {
    const msg: JobMessage = {
      jobId: 'abc-123',
      urls: ['https://example.com/docs'],
      visited: ['https://example.com'],
    };
    expect(msg.visited).toHaveLength(1);
  });

  it('JobMessage supports resume with S3 key for large state', () => {
    const msg: JobMessage = {
      jobId: 'abc-123',
      urls: [],
      stateS3Key: 'state/abc-123/resume.json',
    };
    expect(msg.stateS3Key).toBeDefined();
  });

  it('PageCrawledEvent has required fields', () => {
    const event: PageCrawledEvent = {
      jobId: 'abc-123',
      url: 'https://example.com/about',
      title: 'About',
      description: 'About page',
      depth: 1,
      newUrls: ['https://example.com/team'],
    };
    expect(event.newUrls).toHaveLength(1);
  });

  it('JobCompletedEvent has jobId', () => {
    const event: JobCompletedEvent = { jobId: 'abc-123' };
    expect(event.jobId).toBe('abc-123');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && npx vitest run`
Expected: FAIL — module not found

- [ ] **Step 3: Write types.ts**

```typescript
// packages/shared/src/types.ts

/** Extracted page metadata */
export interface PageData {
  url: string;
  title: string;
  description: string;
  depth: number;
}

/** SQS message body for crawler Lambda */
export interface JobMessage {
  jobId: string;
  urls: string[];
  visited?: string[];
  stateS3Key?: string;  // for large resume state
  maxDepth?: number;
  maxPages?: number;
}

/** EventBridge detail for page.crawled event */
export interface PageCrawledEvent {
  jobId: string;
  url: string;
  title: string;
  description: string;
  depth: number;
  newUrls: string[];
}

/** EventBridge detail for job.completed event */
export interface JobCompletedEvent {
  jobId: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared && npx vitest run`
Expected: PASS — all 6 tests

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/tests/types.test.ts
git commit -m "feat(shared): add core types — PageData, JobMessage, events"
```

---

### Task 3: URL Utilities

**Files:**
- Create: `packages/shared/src/url-utils.ts`
- Test: `packages/shared/tests/url-utils.test.ts`

- [ ] **Step 1: Write the tests**

```typescript
// packages/shared/tests/url-utils.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeUrl, isSkippableHref, isSkippablePath, isSkippableExtension } from '../src/url-utils.js';

describe('normalizeUrl', () => {
  it('removes hash', () => {
    expect(normalizeUrl('https://example.com/page#section')).toBe('https://example.com/page');
  });

  it('removes query string', () => {
    expect(normalizeUrl('https://example.com/page?q=1')).toBe('https://example.com/page');
  });

  it('removes trailing slash except root', () => {
    expect(normalizeUrl('https://example.com/docs/')).toBe('https://example.com/docs');
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('preserves protocol and hostname', () => {
    expect(normalizeUrl('https://sub.example.com/path')).toBe('https://sub.example.com/path');
  });
});

describe('isSkippableHref', () => {
  it('skips mailto links', () => {
    expect(isSkippableHref('mailto:test@example.com')).toBe(true);
  });

  it('skips tel links', () => {
    expect(isSkippableHref('tel:+1234567890')).toBe(true);
  });

  it('skips anchor-only links', () => {
    expect(isSkippableHref('#section')).toBe(true);
  });

  it('allows normal paths', () => {
    expect(isSkippableHref('/about')).toBe(false);
    expect(isSkippableHref('https://example.com/docs')).toBe(false);
  });
});

describe('isSkippableExtension', () => {
  it('skips images', () => {
    expect(isSkippableExtension('/logo.png')).toBe(true);
    expect(isSkippableExtension('/photo.jpg')).toBe(true);
  });

  it('skips binary files', () => {
    expect(isSkippableExtension('/file.pdf')).toBe(true);
    expect(isSkippableExtension('/archive.zip')).toBe(true);
  });

  it('allows HTML-like paths', () => {
    expect(isSkippableExtension('/about')).toBe(false);
    expect(isSkippableExtension('/docs/intro.html')).toBe(false);
  });
});

describe('isSkippablePath', () => {
  it('skips api paths', () => {
    expect(isSkippablePath('/api/v1/users')).toBe(true);
  });

  it('skips admin paths', () => {
    expect(isSkippablePath('/admin/dashboard')).toBe(true);
  });

  it('skips auth paths', () => {
    expect(isSkippablePath('/login')).toBe(true);
    expect(isSkippablePath('/signup')).toBe(true);
  });

  it('allows content paths', () => {
    expect(isSkippablePath('/docs/getting-started')).toBe(false);
    expect(isSkippablePath('/blog/my-post')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && npx vitest run`
Expected: FAIL — module not found

- [ ] **Step 3: Write url-utils.ts**

```typescript
// packages/shared/src/url-utils.ts

const SKIP_EXTENSIONS = /\.(jpg|jpeg|png|gif|svg|webp|pdf|zip|tar|gz|css|js|ico|woff|woff2|ttf|eot|mp4|mp3|wav)$/i;
const SKIP_PATHS = /^\/(api|admin|login|logout|signin|signup|auth|cdn-cgi|wp-json)(\/|$)/i;

export function normalizeUrl(url: string): string {
  const u = new URL(url);
  u.hash = '';
  u.search = '';
  if (u.pathname !== '/' && u.pathname.endsWith('/')) {
    u.pathname = u.pathname.slice(0, -1);
  }
  return u.toString();
}

export function isSkippableHref(href: string): boolean {
  return href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#');
}

export function isSkippableExtension(pathname: string): boolean {
  return SKIP_EXTENSIONS.test(pathname);
}

export function isSkippablePath(pathname: string): boolean {
  return SKIP_PATHS.test(pathname);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared && npx vitest run`
Expected: PASS — all tests

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/url-utils.ts packages/shared/tests/url-utils.test.ts
git commit -m "feat(shared): add URL utility functions"
```

---

### Task 4: Shared Barrel Export + Build

**Files:**
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Create barrel export**

```typescript
// packages/shared/src/index.ts
export type { PageData, JobMessage, PageCrawledEvent, JobCompletedEvent } from './types.js';
export { normalizeUrl, isSkippableHref, isSkippableExtension, isSkippablePath } from './url-utils.js';
```

- [ ] **Step 2: Build shared package**

Run: `cd packages/shared && npm run build`
Expected: `dist/` folder created with `.js` and `.d.ts` files

- [ ] **Step 3: Run all shared tests**

Run: `cd packages/shared && npx vitest run`
Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): barrel export"
```

---

### Task 5: Crawler — Page Parser

**Files:**
- Create: `packages/crawler/src/parser.ts`
- Test: `packages/crawler/tests/parser.test.ts`

- [ ] **Step 1: Write the tests**

```typescript
// packages/crawler/tests/parser.test.ts
import { describe, it, expect } from 'vitest';
import { extractPageData, extractLinks } from '../src/parser.js';

const HTML = `
<html>
<head>
  <title>My Site | About Us</title>
  <meta name="description" content="Learn about our company">
</head>
<body>
  <nav><a href="/docs">Docs</a><a href="/blog">Blog</a></nav>
  <main>
    <h1>About Us</h1>
    <a href="/team">Team</a>
    <a href="https://external.com">External</a>
    <a href="mailto:hi@example.com">Email</a>
    <a href="#section">Anchor</a>
    <a href="/assets/logo.png">Logo</a>
    <a href="/api/v1/data">API</a>
  </main>
</body>
</html>`;

describe('extractPageData', () => {
  it('extracts title from <title> tag', () => {
    const data = extractPageData(HTML, 'https://example.com/about', 1);
    expect(data.title).toBe('My Site | About Us');
  });

  it('extracts description from meta tag', () => {
    const data = extractPageData(HTML, 'https://example.com/about', 1);
    expect(data.description).toBe('Learn about our company');
  });

  it('uses h1 as fallback title', () => {
    const html = '<html><body><h1>Fallback</h1></body></html>';
    const data = extractPageData(html, 'https://example.com', 0);
    expect(data.title).toBe('Fallback');
  });

  it('uses url as last resort title', () => {
    const html = '<html><body><p>No heading</p></body></html>';
    const data = extractPageData(html, 'https://example.com', 0);
    expect(data.title).toBe('https://example.com');
  });

  it('sets depth from argument', () => {
    const data = extractPageData(HTML, 'https://example.com/about', 3);
    expect(data.depth).toBe(3);
  });
});

describe('extractLinks', () => {
  it('extracts same-origin links', () => {
    const links = extractLinks(HTML, 'https://example.com/about');
    expect(links).toContain('https://example.com/docs');
    expect(links).toContain('https://example.com/blog');
    expect(links).toContain('https://example.com/team');
  });

  it('excludes external links', () => {
    const links = extractLinks(HTML, 'https://example.com/about');
    expect(links).not.toContain('https://external.com');
  });

  it('excludes mailto, anchor, and tel links', () => {
    const links = extractLinks(HTML, 'https://example.com/about');
    expect(links.some(l => l.includes('mailto'))).toBe(false);
    expect(links.some(l => l.includes('#section'))).toBe(false);
  });

  it('excludes asset extensions', () => {
    const links = extractLinks(HTML, 'https://example.com/about');
    expect(links.some(l => l.includes('.png'))).toBe(false);
  });

  it('excludes skippable paths', () => {
    const links = extractLinks(HTML, 'https://example.com/about');
    expect(links.some(l => l.includes('/api/'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/crawler && npx vitest run`
Expected: FAIL — module not found

- [ ] **Step 3: Write parser.ts**

```typescript
// packages/crawler/src/parser.ts
import * as cheerio from 'cheerio';
import {
  normalizeUrl,
  isSkippableHref,
  isSkippableExtension,
  isSkippablePath,
} from '@llm-crawler/shared';
import type { PageData } from '@llm-crawler/shared';

export function extractPageData(html: string, url: string, depth: number): PageData {
  const $ = cheerio.load(html);

  const title =
    $('title').first().text().trim() ||
    $('h1').first().text().trim() ||
    url;

  const description =
    $('meta[name="description"]').attr('content')?.trim() ||
    $('meta[property="og:description"]').attr('content')?.trim() ||
    '';

  return {
    url,
    title: title.replace(/\s+/g, ' ').trim(),
    description,
    depth,
  };
}

export function extractLinks(html: string, pageUrl: string): string[] {
  const $ = cheerio.load(html);
  const origin = new URL(pageUrl).origin;
  const links: string[] = [];

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || isSkippableHref(href)) return;

    try {
      const resolved = new URL(href, pageUrl);
      if (resolved.origin !== origin) return;
      if (isSkippableExtension(resolved.pathname)) return;
      if (isSkippablePath(resolved.pathname)) return;

      links.push(normalizeUrl(resolved.toString()));
    } catch {
      // ignore malformed URLs
    }
  });

  return [...new Set(links)];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/crawler && npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/crawler/src/parser.ts packages/crawler/tests/parser.test.ts
git commit -m "feat(crawler): page parser — extract metadata and links"
```

---

### Task 6: Crawler — SPA Detector

**Files:**
- Create: `packages/crawler/src/spa-detector.ts`
- Test: `packages/crawler/tests/spa-detector.test.ts`

- [ ] **Step 1: Write the tests**

```typescript
// packages/crawler/tests/spa-detector.test.ts
import { describe, it, expect } from 'vitest';
import { isSpa } from '../src/spa-detector.js';

describe('isSpa', () => {
  it('detects Vite SPA (div#root + module script, no nav links)', () => {
    const html = `
      <html><body>
        <div id="root"></div>
        <script type="module" src="/assets/main.js"></script>
      </body></html>`;
    expect(isSpa(html)).toBe(true);
  });

  it('detects React SPA (div#app)', () => {
    const html = `
      <html><body>
        <div id="app"></div>
        <script type="module" src="/app.js"></script>
      </body></html>`;
    expect(isSpa(html)).toBe(true);
  });

  it('returns false for server-rendered site with nav links', () => {
    const html = `
      <html><body>
        <nav><a href="/about">About</a><a href="/docs">Docs</a></nav>
        <main><h1>Welcome</h1></main>
        <script type="module" src="/app.js"></script>
      </body></html>`;
    expect(isSpa(html)).toBe(false);
  });

  it('returns false for plain HTML (no SPA root, no module scripts)', () => {
    const html = `
      <html><body>
        <h1>Hello</h1>
        <a href="/about">About</a>
      </body></html>`;
    expect(isSpa(html)).toBe(false);
  });

  it('returns false for Next.js SSR (has __next but also has nav links)', () => {
    const html = `
      <html><body>
        <div id="__next">
          <nav><a href="/docs">Docs</a></nav>
          <main><h1>Next.js Site</h1></main>
        </div>
      </body></html>`;
    expect(isSpa(html)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/crawler && npx vitest run tests/spa-detector.test.ts`
Expected: FAIL

- [ ] **Step 3: Write spa-detector.ts**

```typescript
// packages/crawler/src/spa-detector.ts
import * as cheerio from 'cheerio';
import { isSkippableExtension } from '@llm-crawler/shared';

export function isSpa(html: string): boolean {
  const $ = cheerio.load(html);

  const hasSpaRoot = $('#root, #app, #__next, #__nuxt, [data-reactroot]').length > 0;
  const hasModuleScript = $('script[type="module"]').length > 0;

  const hasStaticNavLinks = $('a[href^="/"], a[href^="./"]').filter((_, el) => {
    const href = $(el).attr('href') ?? '';
    return !isSkippableExtension(href);
  }).length > 0;

  return (hasSpaRoot || hasModuleScript) && !hasStaticNavLinks;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/crawler && npx vitest run tests/spa-detector.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/crawler/src/spa-detector.ts packages/crawler/tests/spa-detector.test.ts
git commit -m "feat(crawler): SPA detection heuristic"
```

---

### Task 7: Crawler — EventBridge Emitter

**Files:**
- Create: `packages/crawler/src/event-emitter.ts`
- Test: `packages/crawler/tests/event-emitter.test.ts`

- [ ] **Step 1: Write the tests**

```typescript
// packages/crawler/tests/event-emitter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from '../src/event-emitter.js';
import type { PageCrawledEvent, JobCompletedEvent } from '@llm-crawler/shared';

// Mock the AWS SDK
const mockPutEvents = vi.fn().mockResolvedValue({ FailedEntryCount: 0 });
vi.mock('@aws-sdk/client-eventbridge', () => ({
  EventBridgeClient: vi.fn().mockImplementation(() => ({
    send: mockPutEvents,
  })),
  PutEventsCommand: vi.fn().mockImplementation((input) => input),
}));

describe('EventEmitter', () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    mockPutEvents.mockClear();
    emitter = new EventEmitter('test-bus');
  });

  it('emits page.crawled event', async () => {
    const event: PageCrawledEvent = {
      jobId: 'abc',
      url: 'https://example.com/about',
      title: 'About',
      description: 'About page',
      depth: 1,
      newUrls: ['https://example.com/team'],
    };

    await emitter.emitPageCrawled(event);

    expect(mockPutEvents).toHaveBeenCalledOnce();
    const call = mockPutEvents.mock.calls[0][0];
    expect(call.Entries[0].DetailType).toBe('page.crawled');
    expect(call.Entries[0].EventBusName).toBe('test-bus');
    expect(call.Entries[0].Source).toBe('llm-crawler');
  });

  it('splits events when newUrls exceeds 200', async () => {
    const bigUrls = Array.from({ length: 350 }, (_, i) => `https://example.com/page-${i}`);
    const event: PageCrawledEvent = {
      jobId: 'abc',
      url: 'https://example.com',
      title: 'Home',
      description: '',
      depth: 0,
      newUrls: bigUrls,
    };

    await emitter.emitPageCrawled(event);

    expect(mockPutEvents).toHaveBeenCalledTimes(2);
  });

  it('emits job.completed event', async () => {
    await emitter.emitJobCompleted({ jobId: 'abc' });

    expect(mockPutEvents).toHaveBeenCalledOnce();
    const call = mockPutEvents.mock.calls[0][0];
    expect(call.Entries[0].DetailType).toBe('job.completed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/crawler && npx vitest run tests/event-emitter.test.ts`
Expected: FAIL

- [ ] **Step 3: Write event-emitter.ts**

```typescript
// packages/crawler/src/event-emitter.ts
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import type { PageCrawledEvent, JobCompletedEvent } from '@llm-crawler/shared';

const MAX_URLS_PER_EVENT = 200;

export class EventEmitter {
  private client: EventBridgeClient;
  private busName: string;

  constructor(busName: string, client?: EventBridgeClient) {
    this.busName = busName;
    this.client = client ?? new EventBridgeClient();
  }

  async emitPageCrawled(event: PageCrawledEvent): Promise<void> {
    if (event.newUrls.length <= MAX_URLS_PER_EVENT) {
      await this.putEvent('page.crawled', event);
      return;
    }

    // Split into chunks to stay under 256KB EventBridge limit
    for (let i = 0; i < event.newUrls.length; i += MAX_URLS_PER_EVENT) {
      const chunk = event.newUrls.slice(i, i + MAX_URLS_PER_EVENT);
      await this.putEvent('page.crawled', { ...event, newUrls: chunk });
    }
  }

  async emitJobCompleted(event: JobCompletedEvent): Promise<void> {
    await this.putEvent('job.completed', event);
  }

  private async putEvent(detailType: string, detail: object): Promise<void> {
    await this.client.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: 'llm-crawler',
            DetailType: detailType,
            Detail: JSON.stringify(detail),
            EventBusName: this.busName,
          },
        ],
      })
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/crawler && npx vitest run tests/event-emitter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/crawler/src/event-emitter.ts packages/crawler/tests/event-emitter.test.ts
git commit -m "feat(crawler): EventBridge emitter with URL splitting"
```

---

### Task 8: Crawler — Fetcher

**Files:**
- Create: `packages/crawler/src/fetcher.ts`

- [ ] **Step 1: Write fetcher.ts**

No unit tests for this module — it's a thin wrapper around axios and playwright with network I/O. Tested via integration in the crawl engine.

```typescript
// packages/crawler/src/fetcher.ts
import axios from 'axios';
import type { Browser } from 'playwright';

export async function fetchWithAxios(url: string): Promise<string | null> {
  try {
    const response = await axios.get<string>(url, {
      timeout: 10_000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; llms-txt-crawler/1.0)',
        Accept: 'text/html',
      },
      maxRedirects: 5,
      validateStatus: (s) => s < 400,
    });
    const contentType = response.headers['content-type'] ?? '';
    if (!contentType.includes('text/html')) return null;
    return response.data;
  } catch {
    return null;
  }
}

export async function fetchWithBrowser(browser: Browser, url: string): Promise<string | null> {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
    return await page.content();
  } catch {
    return null;
  } finally {
    await page.close();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/crawler/src/fetcher.ts
git commit -m "feat(crawler): HTTP and browser fetchers"
```

---

### Task 9: Crawler — BFS Crawl Engine

**Files:**
- Create: `packages/crawler/src/crawl.ts`
- Test: `packages/crawler/tests/crawl.test.ts`

- [ ] **Step 1: Write the tests**

```typescript
// packages/crawler/tests/crawl.test.ts
import { describe, it, expect, vi } from 'vitest';
import { crawl } from '../src/crawl.js';
import type { PageCrawledEvent } from '@llm-crawler/shared';

// Mock fetcher to return controlled HTML
vi.mock('../src/fetcher.js', () => ({
  fetchWithAxios: vi.fn().mockImplementation((url: string) => {
    const pages: Record<string, string> = {
      'https://example.com/': '<html><head><title>Home</title><meta name="description" content="Homepage"></head><body><a href="/about">About</a><a href="/docs">Docs</a></body></html>',
      'https://example.com/about': '<html><head><title>About</title></head><body><a href="/team">Team</a></body></html>',
      'https://example.com/docs': '<html><head><title>Docs</title></head><body><a href="/docs/intro">Intro</a></body></html>',
      'https://example.com/team': '<html><head><title>Team</title></head><body></body></html>',
      'https://example.com/docs/intro': '<html><head><title>Intro</title></head><body></body></html>',
    };
    return Promise.resolve(pages[url] ?? null);
  }),
  fetchWithBrowser: vi.fn(),
}));

describe('crawl', () => {
  it('crawls root and discovers child pages', async () => {
    const events: PageCrawledEvent[] = [];
    let completed = false;

    await crawl({
      urls: ['https://example.com/'],
      maxDepth: 1,
      maxPages: 10,
      concurrency: 2,
      useBrowser: false,
      onPageCrawled: async (event) => { events.push(event); },
      onCompleted: async () => { completed = true; },
    });

    expect(events.length).toBe(3); // root + about + docs
    expect(events[0].url).toBe('https://example.com/');
    expect(events[0].newUrls).toContain('https://example.com/about');
    expect(events[0].newUrls).toContain('https://example.com/docs');
    expect(completed).toBe(true);
  });

  it('respects maxDepth', async () => {
    const events: PageCrawledEvent[] = [];

    await crawl({
      urls: ['https://example.com/'],
      maxDepth: 0,
      maxPages: 10,
      concurrency: 2,
      useBrowser: false,
      onPageCrawled: async (event) => { events.push(event); },
      onCompleted: async () => {},
    });

    expect(events.length).toBe(1); // only root
  });

  it('respects maxPages', async () => {
    const events: PageCrawledEvent[] = [];

    await crawl({
      urls: ['https://example.com/'],
      maxDepth: 10,
      maxPages: 2,
      concurrency: 2,
      useBrowser: false,
      onPageCrawled: async (event) => { events.push(event); },
      onCompleted: async () => {},
    });

    expect(events.length).toBeLessThanOrEqual(2);
  });

  it('seeds visited set to skip already-crawled URLs', async () => {
    const events: PageCrawledEvent[] = [];

    await crawl({
      urls: ['https://example.com/'],
      visited: ['https://example.com/about'],
      maxDepth: 1,
      maxPages: 10,
      concurrency: 2,
      useBrowser: false,
      onPageCrawled: async (event) => { events.push(event); },
      onCompleted: async () => {},
    });

    // Should NOT crawl /about since it's in visited
    expect(events.find(e => e.url === 'https://example.com/about')).toBeUndefined();
    // Should still crawl /docs
    expect(events.find(e => e.url === 'https://example.com/docs')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/crawler && npx vitest run tests/crawl.test.ts`
Expected: FAIL

- [ ] **Step 3: Write crawl.ts**

```typescript
// packages/crawler/src/crawl.ts
import pLimit from 'p-limit';
import { normalizeUrl } from '@llm-crawler/shared';
import type { PageCrawledEvent } from '@llm-crawler/shared';
import { fetchWithAxios, fetchWithBrowser } from './fetcher.js';
import { extractPageData, extractLinks } from './parser.js';
import type { Browser } from 'playwright';

export interface CrawlConfig {
  urls: string[];
  visited?: string[];
  maxDepth: number;
  maxPages: number;
  concurrency: number;
  useBrowser: boolean;
  browser?: Browser;
  onPageCrawled: (event: PageCrawledEvent) => Promise<void>;
  onCompleted: () => Promise<void>;
}

export async function crawl(config: CrawlConfig): Promise<void> {
  const {
    urls,
    visited: initialVisited = [],
    maxDepth,
    maxPages,
    concurrency,
    useBrowser,
    browser,
    onPageCrawled,
    onCompleted,
  } = config;

  const visited = new Set<string>(initialVisited.map(normalizeUrl));
  const limit = pLimit(concurrency);
  let pageCount = 0;

  // Assign initial depth: 0 for first run, infer from URL structure is not reliable
  // so we track depth per BFS level
  let currentLevel = urls.map(normalizeUrl).filter((u) => !visited.has(u));

  // Mark initial URLs as visited
  for (const url of currentLevel) {
    visited.add(url);
  }

  for (let depth = 0; depth <= maxDepth && currentLevel.length > 0 && pageCount < maxPages; depth++) {
    const nextLevel: string[] = [];

    await Promise.all(
      currentLevel.map((url) =>
        limit(async () => {
          if (pageCount >= maxPages) return;

          const html = useBrowser && browser
            ? await fetchWithBrowser(browser, url)
            : await fetchWithAxios(url);

          if (!html) return;

          const pageData = extractPageData(html, url, depth);
          const links = extractLinks(html, url);

          const newUrls = links.filter((link) => !visited.has(link));
          for (const link of newUrls) {
            visited.add(link);
            if (depth < maxDepth) {
              nextLevel.push(link);
            }
          }

          const event: PageCrawledEvent = {
            jobId: '', // set by handler
            ...pageData,
            newUrls,
          };

          await onPageCrawled(event);
          pageCount++;
        })
      )
    );

    currentLevel = nextLevel;
  }

  await onCompleted();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/crawler && npx vitest run tests/crawl.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/crawler/src/crawl.ts packages/crawler/tests/crawl.test.ts
git commit -m "feat(crawler): BFS crawl engine with visited seeding"
```

---

### Task 10: Crawler — Lambda Handler

**Files:**
- Create: `packages/crawler/src/handler.ts`
- Create: `packages/crawler/src/index.ts`
- Test: `packages/crawler/tests/handler.test.ts`

- [ ] **Step 1: Write the tests**

```typescript
// packages/crawler/tests/handler.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock crawl module
const mockCrawl = vi.fn().mockImplementation(async (config) => {
  await config.onPageCrawled({
    jobId: '', url: 'https://example.com/', title: 'Home',
    description: '', depth: 0, newUrls: [],
  });
  await config.onCompleted();
});
vi.mock('../src/crawl.js', () => ({ crawl: mockCrawl }));

// Mock event emitter
const mockEmitPageCrawled = vi.fn().mockResolvedValue(undefined);
const mockEmitJobCompleted = vi.fn().mockResolvedValue(undefined);
vi.mock('../src/event-emitter.js', () => ({
  EventEmitter: vi.fn().mockImplementation(() => ({
    emitPageCrawled: mockEmitPageCrawled,
    emitJobCompleted: mockEmitJobCompleted,
  })),
}));

// Mock SPA detector
vi.mock('../src/spa-detector.js', () => ({
  isSpa: vi.fn().mockReturnValue(false),
}));

import { handler } from '../src/handler.js';
import type { SQSEvent } from 'aws-lambda';

function makeSQSEvent(body: object): SQSEvent {
  return {
    Records: [{ body: JSON.stringify(body) }],
  } as SQSEvent;
}

describe('handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EVENT_BUS_NAME = 'test-bus';
  });

  it('parses SQS message and starts crawl', async () => {
    const event = makeSQSEvent({
      jobId: 'abc-123',
      urls: ['https://example.com/'],
    });

    await handler(event);

    expect(mockCrawl).toHaveBeenCalledOnce();
    const config = mockCrawl.mock.calls[0][0];
    expect(config.urls).toEqual(['https://example.com/']);
    expect(config.useBrowser).toBe(false);
  });

  it('emits events for each crawled page', async () => {
    const event = makeSQSEvent({
      jobId: 'abc-123',
      urls: ['https://example.com/'],
    });

    await handler(event);

    expect(mockEmitPageCrawled).toHaveBeenCalledOnce();
    expect(mockEmitPageCrawled.mock.calls[0][0].jobId).toBe('abc-123');
  });

  it('emits job.completed when crawl finishes', async () => {
    const event = makeSQSEvent({
      jobId: 'abc-123',
      urls: ['https://example.com/'],
    });

    await handler(event);

    expect(mockEmitJobCompleted).toHaveBeenCalledWith({ jobId: 'abc-123' });
  });

  it('passes visited URLs on resume', async () => {
    const event = makeSQSEvent({
      jobId: 'abc-123',
      urls: ['https://example.com/docs'],
      visited: ['https://example.com/'],
    });

    await handler(event);

    const config = mockCrawl.mock.calls[0][0];
    expect(config.visited).toEqual(['https://example.com/']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/crawler && npx vitest run tests/handler.test.ts`
Expected: FAIL

- [ ] **Step 3: Write handler.ts**

```typescript
// packages/crawler/src/handler.ts
import type { SQSEvent } from 'aws-lambda';
import type { JobMessage } from '@llm-crawler/shared';
import { crawl } from './crawl.js';
import { EventEmitter } from './event-emitter.js';
import { isSpa } from './spa-detector.js';
import { fetchWithAxios } from './fetcher.js';

export async function handler(event: SQSEvent): Promise<void> {
  const busName = process.env.EVENT_BUS_NAME;
  if (!busName) throw new Error('EVENT_BUS_NAME env var is required');

  const record = event.Records[0];
  const message: JobMessage = JSON.parse(record.body);
  const { jobId, urls, visited, maxDepth = 3, maxPages = 200 } = message;

  const emitter = new EventEmitter(busName);

  // Detect SPA on first URL (only on fresh jobs, not resume)
  let useBrowser = false;
  if (!visited && urls.length === 1) {
    const probeHtml = await fetchWithAxios(urls[0]);
    if (probeHtml && isSpa(probeHtml)) {
      useBrowser = true;
    }
  }

  let browser;
  if (useBrowser) {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
  }

  try {
    await crawl({
      urls,
      visited,
      maxDepth,
      maxPages,
      concurrency: useBrowser ? 3 : 5,
      useBrowser,
      browser,
      onPageCrawled: async (event) => {
        await emitter.emitPageCrawled({ ...event, jobId });
      },
      onCompleted: async () => {
        await emitter.emitJobCompleted({ jobId });
      },
    });
  } finally {
    await browser?.close();
  }
}
```

- [ ] **Step 4: Write index.ts barrel**

```typescript
// packages/crawler/src/index.ts
export { handler } from './handler.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/crawler && npx vitest run tests/handler.test.ts`
Expected: PASS

- [ ] **Step 6: Run all crawler tests**

Run: `cd packages/crawler && npx vitest run`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add packages/crawler/src/handler.ts packages/crawler/src/index.ts packages/crawler/tests/handler.test.ts
git commit -m "feat(crawler): Lambda handler — SQS to EventBridge pipeline"
```

---

### Task 11: Prisma Schema

**Files:**
- Create: `prisma/schema.prisma`

- [ ] **Step 1: Write schema.prisma**

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email         String?   @unique
  passwordHash  String?   @map("password_hash")
  oauthProvider String?   @map("oauth_provider")
  oauthId       String?   @map("oauth_id")
  createdAt     DateTime  @default(now()) @map("created_at")

  jobs         Job[]
  anonSessions AnonSession[]

  @@map("users")
}

model AnonSession {
  id        String   @id @db.Uuid
  userId    String?  @map("user_id") @db.Uuid
  createdAt DateTime @default(now()) @map("created_at")

  user User? @relation(fields: [userId], references: [id])
  jobs Job[]

  @@map("anon_sessions")
}

model Job {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId         String?  @map("user_id") @db.Uuid
  anonSessionId  String?  @map("anon_session_id") @db.Uuid
  rootUrl        String   @map("root_url")
  maxDepth       Int      @default(3) @map("max_depth")
  maxPages       Int      @default(200) @map("max_pages")
  status         String   @default("pending")
  s3Key          String?  @map("s3_key")
  invocations    Int      @default(0)
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @default(now()) @updatedAt @map("updated_at")

  user        User?        @relation(fields: [userId], references: [id])
  anonSession AnonSession? @relation(fields: [anonSessionId], references: [id])
  pages       Page[]
  discoveredUrls DiscoveredUrl[]

  @@index([status, updatedAt], map: "idx_jobs_status")
  @@index([anonSessionId], map: "idx_jobs_anon")
  @@index([userId], map: "idx_jobs_user")
  @@map("jobs")
}

model Page {
  id          Int      @id @default(autoincrement())
  jobId       String   @map("job_id") @db.Uuid
  url         String
  title       String?
  description String?
  depth       Int?
  crawledAt   DateTime @default(now()) @map("crawled_at")

  job Job @relation(fields: [jobId], references: [id], onDelete: Cascade)

  @@unique([jobId, url])
  @@index([jobId], map: "idx_pages_job")
  @@map("pages")
}

model DiscoveredUrl {
  id    Int    @id @default(autoincrement())
  jobId String @map("job_id") @db.Uuid
  url   String

  job Job @relation(fields: [jobId], references: [id], onDelete: Cascade)

  @@unique([jobId, url])
  @@index([jobId], map: "idx_discovered_job")
  @@map("discovered_urls")
}
```

- [ ] **Step 2: Verify schema is valid**

Run: `npx prisma validate`
Expected: "The schema at `prisma/schema.prisma` is valid"

Note: This requires a `DATABASE_URL` env var. For validation only, set a dummy:
Run: `DATABASE_URL="postgresql://localhost:5432/dummy" npx prisma validate`

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(shared): Prisma schema — users, sessions, jobs, pages, discovered_urls"
```

---

### Task 12: Build Full Monorepo + Final Verification

- [ ] **Step 1: Build everything**

Run: `npm run build`
Expected: both shared and crawler compile successfully

- [ ] **Step 2: Run all tests**

Run: `npm run test`
Expected: all tests pass across both packages

- [ ] **Step 3: Clean up old root-level files**

The old prototype files (`src/crawler.ts`, `src/generator.ts`, `src/server.ts`, `src/benchmark.ts`, `public/index.html`, `tsconfig.json`) are superseded by the monorepo. Move them to a `_legacy/` folder for reference, or delete them.

```bash
mkdir -p _legacy
mv src/ _legacy/src
mv public/ _legacy/public
mv tsconfig.json _legacy/tsconfig.json
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: complete phase 1 — monorepo scaffold, shared types, crawler Lambda"
```
