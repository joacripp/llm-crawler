// packages/crawler/src/parser.ts
import * as cheerio from 'cheerio';
import { normalizeUrl, isSkippableHref, isSkippableExtension, isSkippablePath } from '@llm-crawler/shared';
export function extractPageData(html, url, depth) {
    const $ = cheerio.load(html);
    const title = $('title').first().text().trim() || $('h1').first().text().trim() || url;
    const description = $('meta[name="description"]').attr('content')?.trim() || $('meta[property="og:description"]').attr('content')?.trim() || '';
    return { url, title: title.replace(/\s+/g, ' ').trim(), description, depth };
}
export function extractLinks(html, pageUrl) {
    const $ = cheerio.load(html);
    const origin = new URL(pageUrl).origin;
    const links = [];
    $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href || isSkippableHref(href))
            return;
        try {
            const resolved = new URL(href, pageUrl);
            if (resolved.origin !== origin)
                return;
            if (isSkippableExtension(resolved.pathname))
                return;
            if (isSkippablePath(resolved.pathname))
                return;
            links.push(normalizeUrl(resolved.toString()));
        }
        catch { }
    });
    return [...new Set(links)];
}
//# sourceMappingURL=parser.js.map