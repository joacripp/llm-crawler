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
  return s
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
