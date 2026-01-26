import DOMPurify from 'dompurify';

// Configure DOMPurify with safe defaults
const PURIFY_CONFIG = {
    ALLOWED_TAGS: [
        'a', 'b', 'strong', 'i', 'em', 'p', 'br',
        'ul', 'ol', 'li', 'code', 'pre', 'blockquote',
        'div', 'span', 'hr',
    ],
    ALLOWED_ATTR: ['href', 'title', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target', 'rel'],
};

// Hook to sanitize URLs and add safe link attributes
if (typeof window !== 'undefined') {
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
        if (node.tagName === 'A') {
            const href = node.getAttribute('href') || '';
            // Only allow http, https, mailto protocols
            if (href && !/^(https?:|mailto:)/i.test(href)) {
                node.removeAttribute('href');
            }
            // Force safe link behavior for external links
            if (node.hasAttribute('href')) {
                node.setAttribute('target', '_blank');
                node.setAttribute('rel', 'noopener noreferrer');
            }
        }
    });
}

function normalizeInput(html) {
    if (html === null || html === undefined) return '';
    return String(html);
}

export function sanitizeDescription(html) {
    const source = normalizeInput(html);
    if (!source) return '';

    // SSR fallback: escape HTML
    if (typeof window === 'undefined') {
        return source
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    return DOMPurify.sanitize(source, PURIFY_CONFIG);
}

export function plainTextDescription(html) {
    const source = normalizeInput(html);
    if (!source) return '';

    // SSR fallback: strip tags with regex
    if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
        return source.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(source, 'text/html');
    const text = doc.body.textContent || '';
    return text.replace(/\s+/g, ' ').trim();
}
