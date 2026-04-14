// packages/crawler/tests/spa-detector.test.ts
import { describe, it, expect } from 'vitest';
import { isSpa } from '../src/spa-detector.js';

describe('isSpa', () => {
  describe('true SPAs (should return true)', () => {
    it('detects Vite + React SPA (div#root, empty body)', () => {
      const html = `<html><body><div id="root"></div><script type="module" src="/assets/main.js"></script></body></html>`;
      expect(isSpa(html)).toBe(true);
    });

    it('detects div#app SPA', () => {
      const html = `<html><body><div id="app"></div><script src="/app.js"></script></body></html>`;
      expect(isSpa(html)).toBe(true);
    });

    it('detects SPA with "Loading..." text', () => {
      const html = `<html><body><div id="root">Loading...</div><script type="module" src="/main.js"></script></body></html>`;
      expect(isSpa(html)).toBe(true);
    });
  });

  describe('SSR sites (should return false)', () => {
    it('rejects server-rendered site with nav links', () => {
      const html = `<html><body><nav><a href="/about">About</a><a href="/docs">Docs</a><a href="/blog">Blog</a><a href="/contact">Contact</a></nav><main><h1>Welcome</h1><p>Some content here.</p></main></body></html>`;
      expect(isSpa(html)).toBe(false);
    });

    it('rejects Vite SSR (has #root + script type=module + real content)', () => {
      const html = `<html><body><div id="root"><nav><a href="/about">About</a><a href="/docs">Docs</a><a href="/blog">Blog</a><a href="/pricing">Pricing</a></nav><main><h1>Welcome to our site</h1><p>This is a Vite SSR application with real server-rendered content that should not trigger SPA detection.</p></main></div><script type="module" src="/entry-client.js"></script></body></html>`;
      expect(isSpa(html)).toBe(false);
    });

    it('rejects Astro site (has script type=module but full static content)', () => {
      const html = `<html><body><header><a href="/">Home</a><a href="/blog">Blog</a><a href="/about">About</a><a href="/docs">Docs</a></header><main><h1>Astro Site</h1><p>Built with Astro, fully static.</p></main><script type="module" src="/astro/hoisted.js"></script></body></html>`;
      expect(isSpa(html)).toBe(false);
    });

    it('rejects Next.js SSR (has __next + nav links)', () => {
      const html = `<html><body><div id="__next"><nav><a href="/docs">Docs</a><a href="/api">API</a><a href="/blog">Blog</a><a href="/pricing">Pricing</a></nav><main><h1>Next.js Site</h1><p>Server-rendered content with hydration.</p></main></div></body></html>`;
      expect(isSpa(html)).toBe(false);
    });

    it('rejects site with #root but lots of text content (SSR with hydration)', () => {
      const longContent = 'This is a paragraph of content. '.repeat(20);
      const html = `<html><body><div id="root"><h1>Title</h1><p>${longContent}</p></div></body></html>`;
      expect(isSpa(html)).toBe(false);
    });
  });

  describe('non-SPA sites (should return false)', () => {
    it('rejects plain HTML (no SPA root)', () => {
      const html = `<html><body><h1>Hello</h1><a href="/about">About</a></body></html>`;
      expect(isSpa(html)).toBe(false);
    });

    it('rejects site with only script type=module (no SPA root)', () => {
      const html = `<html><body><h1>Regular page</h1><script type="module" src="/app.js"></script></body></html>`;
      expect(isSpa(html)).toBe(false);
    });
  });
});
