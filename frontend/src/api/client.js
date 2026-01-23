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
    startDownload: (identifier, files, glob, format) => request('/downloads', {
        method: 'POST',
        body: JSON.stringify({ identifier, files, glob, format }),
    }),
    getDownloads: () => request('/downloads'),
    cancelDownload: (jobId) => request(`/downloads/${jobId}`, { method: 'DELETE' }),

    // Uploads
    getUploads: () => request('/uploads'),
    cancelUpload: (jobId) => request(`/uploads/${jobId}`, { method: 'DELETE' }),
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

export function subscribeToUploads(onEvent) {
    const eventSource = new EventSource(`${API_BASE}/uploads/events`);
    eventSource.addEventListener('progress', (e) => {
        onEvent(JSON.parse(e.data));
    });
    eventSource.onerror = () => {
        eventSource.close();
    };
    return () => eventSource.close();
}
