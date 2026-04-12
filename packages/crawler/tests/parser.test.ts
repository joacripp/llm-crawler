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
