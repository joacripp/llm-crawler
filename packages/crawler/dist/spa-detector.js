// packages/crawler/src/spa-detector.ts
import * as cheerio from 'cheerio';
import { isSkippableExtension } from '@llm-crawler/shared';
export function isSpa(html) {
    const $ = cheerio.load(html);
    const hasSpaRoot = $('#root, #app, #__next, #__nuxt, [data-reactroot]').length > 0;
    const hasModuleScript = $('script[type="module"]').length > 0;
    const hasStaticNavLinks = $('a[href^="/"], a[href^="./"]').filter((_, el) => {
        const href = $(el).attr('href') ?? '';
        return !isSkippableExtension(href);
    }).length > 0;
    return (hasSpaRoot || hasModuleScript) && !hasStaticNavLinks;
}
//# sourceMappingURL=spa-detector.js.map