// packages/crawler/tests/spa-detector.test.ts
import { describe, it, expect } from 'vitest';
import { isSpa } from '../src/spa-detector.js';

describe('isSpa', () => {
  it('detects Vite SPA (div#root + module script, no nav links)', () => {
    const html = `<html><body><div id="root"></div><script type="module" src="/assets/main.js"></script></body></html>`;
    expect(isSpa(html)).toBe(true);
  });
  it('detects React SPA (div#app)', () => {
    const html = `<html><body><div id="app"></div><script type="module" src="/app.js"></script></body></html>`;
    expect(isSpa(html)).toBe(true);
  });
  it('returns false for server-rendered site with nav links', () => {
    const html = `<html><body><nav><a href="/about">About</a><a href="/docs">Docs</a></nav><main><h1>Welcome</h1></main><script type="module" src="/app.js"></script></body></html>`;
    expect(isSpa(html)).toBe(false);
  });
  it('returns false for plain HTML (no SPA root, no module scripts)', () => {
    const html = `<html><body><h1>Hello</h1><a href="/about">About</a></body></html>`;
    expect(isSpa(html)).toBe(false);
  });
  it('returns false for Next.js SSR (has __next but also has nav links)', () => {
    const html = `<html><body><div id="__next"><nav><a href="/docs">Docs</a></nav><main><h1>Next.js Site</h1></main></div></body></html>`;
    expect(isSpa(html)).toBe(false);
  });
});
