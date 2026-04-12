// packages/shared/tests/url-utils.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeUrl, isSkippableHref, isSkippablePath, isSkippableExtension } from '../src/url-utils.js';

describe('normalizeUrl', () => {
  it('removes hash', () => { expect(normalizeUrl('https://example.com/page#section')).toBe('https://example.com/page'); });
  it('removes query string', () => { expect(normalizeUrl('https://example.com/page?q=1')).toBe('https://example.com/page'); });
  it('removes trailing slash except root', () => {
    expect(normalizeUrl('https://example.com/docs/')).toBe('https://example.com/docs');
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
  });
  it('preserves protocol and hostname', () => { expect(normalizeUrl('https://sub.example.com/path')).toBe('https://sub.example.com/path'); });
});

describe('isSkippableHref', () => {
  it('skips mailto links', () => { expect(isSkippableHref('mailto:test@example.com')).toBe(true); });
  it('skips tel links', () => { expect(isSkippableHref('tel:+1234567890')).toBe(true); });
  it('skips anchor-only links', () => { expect(isSkippableHref('#section')).toBe(true); });
  it('allows normal paths', () => { expect(isSkippableHref('/about')).toBe(false); expect(isSkippableHref('https://example.com/docs')).toBe(false); });
});

describe('isSkippableExtension', () => {
  it('skips images', () => { expect(isSkippableExtension('/logo.png')).toBe(true); expect(isSkippableExtension('/photo.jpg')).toBe(true); });
  it('skips binary files', () => { expect(isSkippableExtension('/file.pdf')).toBe(true); expect(isSkippableExtension('/archive.zip')).toBe(true); });
  it('allows HTML-like paths', () => { expect(isSkippableExtension('/about')).toBe(false); expect(isSkippableExtension('/docs/intro.html')).toBe(false); });
});

describe('isSkippablePath', () => {
  it('skips api paths', () => { expect(isSkippablePath('/api/v1/users')).toBe(true); });
  it('skips admin paths', () => { expect(isSkippablePath('/admin/dashboard')).toBe(true); });
  it('skips auth paths', () => { expect(isSkippablePath('/login')).toBe(true); expect(isSkippablePath('/signup')).toBe(true); });
  it('allows content paths', () => { expect(isSkippablePath('/docs/getting-started')).toBe(false); expect(isSkippablePath('/blog/my-post')).toBe(false); });
});
