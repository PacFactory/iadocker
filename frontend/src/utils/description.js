const ALLOWED_TAGS = new Set([
    'a',
    'b',
    'strong',
    'i',
    'em',
    'p',
    'br',
    'ul',
    'ol',
    'li',
    'code',
    'pre',
    'blockquote',
    'div',
    'span',
    'hr',
]);

const ALLOWED_ATTRS = new Set(['href', 'title', 'target', 'rel']);
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function normalizeInput(html) {
    if (html === null || html === undefined) return '';
    return String(html);
}

function getSafeHref(href) {
    const trimmed = href.trim();
    if (!trimmed) return null;
    try {
        const url = new URL(trimmed, window.location.origin);
        if (!SAFE_PROTOCOLS.has(url.protocol)) return null;
        return url.href;
    } catch {
        return null;
    }
}

export function sanitizeDescription(html) {
    const source = normalizeInput(html);
    if (!source) return '';

    if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
        return source
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(source, 'text/html');
    const elements = Array.from(doc.body.querySelectorAll('*'));

    for (const el of elements) {
        if (!el.isConnected) continue;
        const tag = el.tagName.toLowerCase();

        if (!ALLOWED_TAGS.has(tag)) {
            const textNode = doc.createTextNode(el.textContent || '');
            el.replaceWith(textNode);
            continue;
        }

        for (const attr of Array.from(el.attributes)) {
            const name = attr.name.toLowerCase();
            if (!ALLOWED_ATTRS.has(name)) {
                el.removeAttribute(attr.name);
            }
        }

        if (tag === 'a') {
            const safeHref = getSafeHref(el.getAttribute('href') || '');
            if (!safeHref) {
                el.removeAttribute('href');
                el.removeAttribute('target');
                el.removeAttribute('rel');
            } else {
                el.setAttribute('href', safeHref);
                el.setAttribute('target', '_blank');
                el.setAttribute('rel', 'noopener noreferrer');
            }
        }
    }

    return doc.body.innerHTML;
}

export function plainTextDescription(html) {
    const source = normalizeInput(html);
    if (!source) return '';

    if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
        return source.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(source, 'text/html');
    const text = doc.body.textContent || '';
    return text.replace(/\s+/g, ' ').trim();
}
