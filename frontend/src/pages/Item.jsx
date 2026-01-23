import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { api } from '../api/client';

const DownloadIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
);

const FileIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
    </svg>
);

const BackIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
    </svg>
);

function formatBytes(bytes) {
    if (!bytes) return 'Unknown size';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
        bytes /= 1024;
        i++;
    }
    return `${bytes.toFixed(1)} ${units[i]}`;
}

export default function Item({ identifier }) {
    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [downloading, setDownloading] = useState({});

    useEffect(() => {
        async function load() {
            setLoading(true);
            try {
                const data = await api.getItem(identifier);
                setItem(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [identifier]);

    const handleDownload = async (filename) => {
        setDownloading(prev => ({ ...prev, [filename]: true }));
        try {
            await api.startDownload(identifier, [filename]);
            // Navigate to downloads page to see progress
            window.location.href = '/downloads';
        } catch (err) {
            console.error('Download failed:', err);
            setDownloading(prev => ({ ...prev, [filename]: false }));
        }
    };

    const handleDownloadAll = async () => {
        setDownloading(prev => ({ ...prev, __all__: true }));
        try {
            await api.startDownload(identifier);
            window.location.href = '/downloads';
        } catch (err) {
            console.error('Download failed:', err);
            setDownloading(prev => ({ ...prev, __all__: false }));
        }
    };

    if (loading) {
        return (
            <div class="loading-container">
                <div class="loading-spinner"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div class="empty-state">
                <h3>Error loading item</h3>
                <p>{error}</p>
                <a href="/" class="btn btn-secondary mt-md">
                    <BackIcon /> Back to Search
                </a>
            </div>
        );
    }

    return (
        <div>
            <a href="/" class="btn btn-secondary" style={{ marginBottom: 'var(--space-lg)' }}>
                <BackIcon /> Back to Search
            </a>

            <div class="card" style={{ marginBottom: 'var(--space-lg)' }}>
                <div class="card-body" style={{ display: 'flex', gap: 'var(--space-lg)' }}>
                    <img
                        src={`https://archive.org/services/img/${identifier}`}
                        alt={item?.metadata?.title || identifier}
                        style={{
                            width: '200px',
                            height: '150px',
                            objectFit: 'cover',
                            borderRadius: 'var(--radius-md)',
                            flexShrink: 0
                        }}
                    />
                    <div style={{ flex: 1 }}>
                        <h1 class="page-title">{item?.metadata?.title || identifier}</h1>
                        {item?.metadata?.creator && (
                            <p class="text-secondary">By {item.metadata.creator}</p>
                        )}
                        {item?.metadata?.description && (
                            <p style={{ marginTop: 'var(--space-md)', color: 'var(--color-text-secondary)' }}>
                                {item.metadata.description.substring(0, 300)}
                                {item.metadata.description.length > 300 ? '...' : ''}
                            </p>
                        )}
                        <div style={{ marginTop: 'var(--space-md)' }}>
                            <button
                                class="btn btn-primary"
                                onClick={handleDownloadAll}
                                disabled={downloading.__all__}
                            >
                                <DownloadIcon />
                                {downloading.__all__ ? 'Starting...' : 'Download All'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    Files ({item?.files?.length || 0})
                </div>
                <div class="card-body" style={{ padding: 0 }}>
                    <div class="job-list">
                        {item?.files?.map(file => (
                            <div key={file.name} class="job-item">
                                <div class="job-icon">
                                    <FileIcon />
                                </div>
                                <div class="job-info">
                                    <div class="job-title">{file.name}</div>
                                    <div class="job-subtitle">
                                        {formatBytes(file.size)} • {file.format || 'Unknown format'}
                                    </div>
                                </div>
                                <button
                                    class="btn btn-secondary btn-icon"
                                    onClick={() => handleDownload(file.name)}
                                    disabled={downloading[file.name]}
                                    title="Download"
                                >
                                    <DownloadIcon />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
