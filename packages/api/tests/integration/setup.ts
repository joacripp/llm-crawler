/**
 * Integration test setup.
 *
 * Starts the compiled NestJS app as a child process against a real Postgres.
 * Tests hit it via HTTP (supertest-like, but using fetch against localhost).
 * This avoids the Vitest ESM + NestJS decorator metadata issue that breaks
 * middleware DI when importing TypeScript source directly.
 */
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';

let serverProcess: ChildProcess | null = null;
let serverPort = 0;

export async function startServer(): Promise<number> {
  if (serverProcess) return serverPort;

  serverPort = 3999 + Math.floor(Math.random() * 100);
  const repoRoot = path.resolve(import.meta.dirname, '../../../../');

  return new Promise((resolve, reject) => {
    serverProcess = spawn('node', ['packages/api/dist/main.js'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PORT: String(serverPort),
        DATABASE_URL: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5433/integration_test',
        REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
        JWT_SECRET: 'test-secret-for-integration-tests',
        JOBS_QUEUE_URL: '',
        S3_BUCKET: 'test-bucket',
        GOOGLE_CLIENT_ID: 'test',
        GOOGLE_CLIENT_SECRET: 'test',
        GH_OAUTH_CLIENT_ID: 'test',
        GH_OAUTH_CLIENT_SECRET: 'test',
        NODE_ENV: 'test',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let started = false;
    const timeout = setTimeout(() => {
      if (!started) reject(new Error('Server did not start within 15s'));
    }, 15000);

    serverProcess.stdout?.on('data', (data: Buffer) => {
      const line = data.toString();
      if (line.includes('Nest application successfully started') && !started) {
        started = true;
        clearTimeout(timeout);
        resolve(serverPort);
      }
    });

    serverProcess.stderr?.on('data', (data: Buffer) => {
      if (!started) console.error('[server stderr]', data.toString());
    });

    serverProcess.on('error', reject);
  });
}

export async function stopServer(): Promise<void> {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

// Simple HTTP helper (fetch-based, returns parsed response)
export async function api(
  method: string,
  path: string,
  options?: { body?: object; cookies?: string[] },
): Promise<{ status: number; body: Record<string, unknown>; cookies: string[] }> {
  const url = `http://localhost:${serverPort}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options?.cookies?.length) {
    headers['Cookie'] = options.cookies.join('; ');
  }

  const res = await fetch(url, {
    method,
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
    redirect: 'manual', // Don't follow redirects (OAuth)
  });

  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { _raw: text };
  }

  const setCookies = res.headers.getSetCookie?.() ?? [];

  return { status: res.status, body, cookies: setCookies };
}

// Clean all data between tests
export async function cleanDatabase(): Promise<void> {
  // Import dynamically to avoid the ESM metadata issue
  const { getPrisma } = await import('@llm-crawler/shared');
  const prisma = getPrisma();
  await prisma.discoveredUrl.deleteMany();
  await prisma.page.deleteMany();
  await prisma.job.deleteMany();
  await prisma.anonSession.deleteMany();
  await prisma.user.deleteMany();
}

// Extract cookie values from set-cookie headers
export function extractCookies(setCookies: string[]): string[] {
  return setCookies.map((c) => c.split(';')[0]);
}
