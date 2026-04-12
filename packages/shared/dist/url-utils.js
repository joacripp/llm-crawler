// packages/shared/src/url-utils.ts
const SKIP_EXTENSIONS = /\.(jpg|jpeg|png|gif|svg|webp|pdf|zip|tar|gz|css|js|ico|woff|woff2|ttf|eot|mp4|mp3|wav)$/i;
const SKIP_PATHS = /^\/(api|admin|login|logout|signin|signup|auth|cdn-cgi|wp-json)(\/|$)/i;
export function normalizeUrl(url) {
    const u = new URL(url);
    u.hash = '';
    u.search = '';
    if (u.pathname !== '/' && u.pathname.endsWith('/')) {
        u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
}
export function isSkippableHref(href) {
    return href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#');
}
export function isSkippableExtension(pathname) {
    return SKIP_EXTENSIONS.test(pathname);
}
export function isSkippablePath(pathname) {
    return SKIP_PATHS.test(pathname);
}
//# sourceMappingURL=url-utils.js.map