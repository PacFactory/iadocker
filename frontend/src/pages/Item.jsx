import { h } from 'preact';
import { useState, useEffect, useMemo } from 'preact/hooks';
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

const SearchIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
    </svg>
);

const ExternalIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
);

function formatBytes(bytes) {
    if (!bytes) return 'Unknown size';
    const num = parseInt(bytes);
    if (isNaN(num)) return 'Unknown size';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let size = num;
    while (size >= 1024 && i < units.length - 1) {
        size /= 1024;
        i++;
    }
    return `${size.toFixed(1)} ${units[i]}`;
}

// Get file extension
function getExtension(filename) {
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop().toUpperCase() : '?';
}

// Common file type groups
const FILE_GROUPS = {
    'Video': ['MP4', 'WEBM', 'OGV', 'AVI', 'MKV', 'MOV', 'MPEG'],
    'Audio': ['MP3', 'OGG', 'FLAC', 'WAV', 'M4A', 'AAC'],
    'Image': ['JPG', 'JPEG', 'PNG', 'GIF', 'WEBP', 'BMP', 'TIFF'],
    'Document': ['PDF', 'TXT', 'DOC', 'DOCX', 'EPUB', 'MOBI'],
    'Archive': ['ZIP', 'RAR', '7Z', 'TAR', 'GZ', 'BZ2'],
    'Data': ['XML', 'JSON', 'CSV', 'SQL', 'SQLITE'],
};

function getFileGroup(ext) {
    for (const [group, exts] of Object.entries(FILE_GROUPS)) {
        if (exts.includes(ext)) return group;
    }
    return 'Other';
}

export default function Item({ identifier }) {
    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [downloading, setDownloading] = useState({});

    // File filtering
    const [fileSearch, setFileSearch] = useState('');
    const [fileType, setFileType] = useState('');
    const [showOriginalOnly, setShowOriginalOnly] = useState(false);

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

    // Filter files
    const filteredFiles = useMemo(() => {
        if (!item?.files) return [];

        return item.files.filter(file => {
            // Search filter
            if (fileSearch && !file.name.toLowerCase().includes(fileSearch.toLowerCase())) {
                return false;
            }

            // Type filter
            if (fileType) {
                const ext = getExtension(file.name);
                if (getFileGroup(ext) !== fileType) {
                    return false;
                }
            }

            // Original only
            if (showOriginalOnly && file.source !== 'original') {
                return false;
            }

            return true;
        });
    }, [item?.files, fileSearch, fileType, showOriginalOnly]);

    // Get unique file types present
    const availableTypes = useMemo(() => {
        if (!item?.files) return [];
        const types = new Set();
        item.files.forEach(f => types.add(getFileGroup(getExtension(f.name))));
        return Array.from(types).sort();
    }, [item?.files]);

    const handleDownload = async (filename) => {
        setDownloading(prev => ({ ...prev, [filename]: true }));
        try {
            await api.startDownload(identifier, [filename]);
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

    const handleDownloadFiltered = async () => {
        setDownloading(prev => ({ ...prev, __filtered__: true }));
        try {
            const filenames = filteredFiles.map(f => f.name);
            await api.startDownload(identifier, filenames);
            window.location.href = '/downloads';
        } catch (err) {
            console.error('Download failed:', err);
            setDownloading(prev => ({ ...prev, __filtered__: false }));
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

    const hasFilters = fileSearch || fileType || showOriginalOnly;
    const totalSize = filteredFiles.reduce((sum, f) => sum + (parseInt(f.size) || 0), 0);

    return (
        <div>
            <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
                <a href="/" class="btn btn-secondary">
                    <BackIcon /> Back to Search
                </a>
                <a
                    href={`https://archive.org/details/${identifier}`}
                    target="_blank"
                    rel="noopener"
                    class="btn btn-secondary"
                >
                    <ExternalIcon /> View on Archive.org
                </a>
            </div>

            {/* Item header */}
            <div class="card" style={{ marginBottom: 'var(--space-lg)' }}>
                <div class="card-body" style={{ display: 'flex', gap: 'var(--space-lg)', flexWrap: 'wrap' }}>
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
                    <div style={{ flex: 1, minWidth: '250px' }}>
                        <h1 class="page-title" style={{ marginBottom: 'var(--space-sm)' }}>
                            {item?.metadata?.title || identifier}
                        </h1>
                        <p class="text-secondary" style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                            {identifier}
                        </p>
                        {item?.metadata?.creator && (
                            <p style={{ marginTop: 'var(--space-sm)' }}>
                                By <strong>{item.metadata.creator}</strong>
                            </p>
                        )}
                        {item?.metadata?.date && (
                            <p class="text-secondary">{item.metadata.date}</p>
                        )}
                        {item?.metadata?.description && (
                            <p style={{ marginTop: 'var(--space-md)', color: 'var(--color-text-secondary)' }}>
                                {item.metadata.description.substring(0, 400)}
                                {item.metadata.description.length > 400 ? '...' : ''}
                            </p>
                        )}
                        <div style={{ marginTop: 'var(--space-md)', display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                            {item?.metadata?.mediatype && (
                                <span class="result-badge">{item.metadata.mediatype}</span>
                            )}
                            {item?.metadata?.collection && (
                                <span class="result-badge" style={{ background: 'var(--color-accent-muted)' }}>
                                    {Array.isArray(item.metadata.collection) ? item.metadata.collection[0] : item.metadata.collection}
                                </span>
                            )}
                        </div>
                        <div style={{ marginTop: 'var(--space-lg)' }}>
                            <button
                                class="btn btn-primary btn-lg"
                                onClick={handleDownloadAll}
                                disabled={downloading.__all__}
                            >
                                <DownloadIcon />
                                {downloading.__all__ ? 'Starting...' : 'Download All Files'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Files section */}
            <div class="card">
                <div class="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
                    <span>Files ({item?.files?.length || 0})</span>
                    {hasFilters && filteredFiles.length > 0 && filteredFiles.length < (item?.files?.length || 0) && (
                        <button
                            class="btn btn-primary"
                            onClick={handleDownloadFiltered}
                            disabled={downloading.__filtered__}
                            style={{ fontSize: '0.85rem' }}
                        >
                            <DownloadIcon />
                            Download {filteredFiles.length} Filtered ({formatBytes(totalSize)})
                        </button>
                    )}
                </div>

                {/* File filters */}
                <div style={{
                    padding: 'var(--space-md)',
                    borderBottom: '1px solid var(--color-border)',
                    display: 'flex',
                    gap: 'var(--space-md)',
                    flexWrap: 'wrap',
                    alignItems: 'center'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flex: '1 1 200px' }}>
                        <SearchIcon />
                        <input
                            type="text"
                            class="form-input"
                            placeholder="Search files..."
                            value={fileSearch}
                            onInput={(e) => setFileSearch(e.target.value)}
                            style={{ margin: 0 }}
                        />
                    </div>

                    <select
                        class="form-input"
                        value={fileType}
                        onChange={(e) => setFileType(e.target.value)}
                        style={{ margin: 0, width: 'auto' }}
                    >
                        <option value="">All Types</option>
                        {availableTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={showOriginalOnly}
                            onChange={(e) => setShowOriginalOnly(e.target.checked)}
                        />
                        Original files only
                    </label>

                    {hasFilters && (
                        <span class="text-secondary">
                            Showing {filteredFiles.length} of {item?.files?.length}
                        </span>
                    )}
                </div>

                <div class="card-body" style={{ padding: 0 }}>
                    <div class="job-list">
                        {filteredFiles.length === 0 ? (
                            <div class="empty-state" style={{ padding: 'var(--space-xl)' }}>
                                <p>No files match your filters</p>
                            </div>
                        ) : (
                            filteredFiles.map(file => (
                                <div key={file.name} class="job-item">
                                    <div class="job-icon">
                                        <FileIcon />
                                    </div>
                                    <div class="job-info" style={{ minWidth: 0 }}>
                                        <div class="job-title" style={{ wordBreak: 'break-all' }}>{file.name}</div>
                                        <div class="job-subtitle">
                                            {formatBytes(file.size)} • {file.format || getExtension(file.name)}
                                            {file.source && <span style={{ marginLeft: '8px', opacity: 0.7 }}>({file.source})</span>}
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
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
