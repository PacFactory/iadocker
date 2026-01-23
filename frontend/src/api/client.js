const API_BASE = '/api';

async function request(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Request failed' }));
        throw new Error(error.detail || 'Request failed');
    }

    return response.json();
}

export const api = {
    // Auth
    getAuthStatus: () => request('/auth/status'),
    configure: (email, password) => request('/auth/configure', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
    }),

    // Search
    search: (query, options = {}) => {
        const params = new URLSearchParams({ q: query, ...options });
        return request(`/search?${params}`);
    },

    // Items
    getItem: (identifier) => request(`/items/${identifier}`),
    getItemFiles: (identifier) => request(`/items/${identifier}/files`),

    // Downloads
    startDownload: (identifier, options = {}) => request('/downloads', {
        method: 'POST',
        body: JSON.stringify({
            identifier,
            files: options.files || null,
            glob: options.glob || null,
            format: options.format || null,
            destdir: options.destdir || null,
            // New download options
            ignore_existing: options.ignoreExisting,
            checksum: options.checksum,
            retries: options.retries,
            timeout: options.timeout,
            no_directories: options.noDirectories,
            no_change_timestamp: options.noChangeTimestamp,
            source: options.source,
            exclude_source: options.excludeSource,
            on_the_fly: options.onTheFly,
            exclude: options.exclude,
        }),
    }),
    getDownloads: () => request('/downloads'),
    cancelDownload: (jobId) => request(`/downloads/${jobId}`, { method: 'DELETE' }),
    clearDownloads: () => request('/downloads', { method: 'DELETE' }),

    // Settings
    getSettings: () => request('/settings'),
    updateSettings: (settings) => request('/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
    }),
    getDirectories: (path = '') => {
        const params = path ? `?path=${encodeURIComponent(path)}` : '';
        return request(`/settings/directories${params}`);
    },
};

// SSE helpers
export function subscribeToDownloads(onEvent) {
    const eventSource = new EventSource(`${API_BASE}/downloads/events`);
    eventSource.addEventListener('progress', (e) => {
        onEvent(JSON.parse(e.data));
    });
    eventSource.onerror = () => {
        eventSource.close();
    };
    return () => eventSource.close();
}

