import { h } from 'preact';
import { useState, useEffect, useMemo } from 'preact/hooks';
import { api } from '../api/client';
import { useToast } from '../components/Toast';
import { sanitizeDescription, plainTextDescription } from '../utils/description';

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

const BookmarkIcon = ({ filled }) => (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" stroke-width="2" width="20" height="20">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
);

const FolderIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
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

// Download Modal Component
function DownloadModal({ isOpen, onClose, onConfirm, identifier, filename, fileCount }) {
    const [destdir, setDestdir] = useState('');
    const [ignoreExisting, setIgnoreExisting] = useState(true);
    const [checksum, setChecksum] = useState(false);
    const [noDirectories, setNoDirectories] = useState(true);
    const [sourceFilter, setSourceFilter] = useState('');

    // Directory browser state
    const [showBrowser, setShowBrowser] = useState(false);
    const [browsePath, setBrowsePath] = useState('');
    const [directories, setDirectories] = useState([]);
    const [loadingDirs, setLoadingDirs] = useState(false);

    // Load last used path from server on mount
    useEffect(() => {
        if (isOpen) {
            api.getSettings().then(settings => {
                if (settings.last_destdir) {
                    setDestdir(settings.last_destdir);
                }
            }).catch(() => { });
        }
    }, [isOpen]);

    // Load directories when browser is opened or path changes
    useEffect(() => {
        if (showBrowser) {
            setLoadingDirs(true);
            api.getDirectories(browsePath)
                .then(data => setDirectories(data.directories || []))
                .catch(() => setDirectories([]))
                .finally(() => setLoadingDirs(false));
        }
    }, [showBrowser, browsePath]);

    if (!isOpen) return null;

    const handleConfirm = () => {
        const options = {
            destdir: destdir.trim() || null,
            ignoreExisting,
            checksum,
            noDirectories,
        };
        if (sourceFilter) {
            options.source = [sourceFilter];
        }
        // Save last used path to server
        if (destdir.trim()) {
            api.updateSettings({ last_destdir: destdir.trim() }).catch(() => { });
        }
        onConfirm(options);
        setShowBrowser(false);
    };

    const handleClose = () => {
        setShowBrowser(false);
        onClose();
    };

    const selectDirectory = (dir) => {
        const newPath = browsePath ? `${browsePath}/${dir}` : dir;
        setDestdir(newPath);
        setBrowsePath(newPath);
    };

    const displayName = filename || `${fileCount} files`;
    const customPath = destdir ? `/data/${destdir.replace(/^\/+/, '')}/` : `/data/`;

    return (
        <div class="modal-overlay" onClick={handleClose}>
            <div class="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                <div class="modal-header">
                    <h3 style={{ margin: 0 }}>📥 Download Options</h3>
                </div>
                <div class="modal-body">
                    <p style={{ marginBottom: 'var(--space-md)', color: 'var(--color-text-secondary)' }}>
                        Downloading: <strong>{displayName}</strong> from <code>{identifier}</code>
                    </p>

                    {/* Destination Path */}
                    <label class="form-label"><FolderIcon /> Download Location</label>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                        <input
                            type="text"
                            class="form-input"
                            placeholder="Leave empty for /data root"
                            value={destdir}
                            onInput={(e) => setDestdir(e.target.value)}
                            style={{ flex: 1, margin: 0 }}
                        />
                        <button
                            class="btn btn-secondary"
                            onClick={() => setShowBrowser(!showBrowser)}
                            title="Browse directories"
                            style={{ padding: '8px 12px' }}
                        >📁</button>
                    </div>

                    {/* Directory Browser */}
                    {showBrowser && (
                        <div style={{
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-md)',
                            marginBottom: 'var(--space-sm)',
                            background: 'var(--color-bg-secondary)',
                            maxHeight: '150px',
                            overflow: 'auto'
                        }}>
                            <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--color-border)', fontSize: '0.8rem', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                <button onClick={() => setBrowsePath('')} class="btn btn-secondary" style={{ padding: '2px 6px', fontSize: '0.75rem' }}>/data</button>
                                {browsePath && browsePath.split('/').map((part, i, arr) => (
                                    <span key={i}>
                                        <span style={{ opacity: 0.5 }}>/</span>
                                        <button onClick={() => setBrowsePath(arr.slice(0, i + 1).join('/'))} class="btn btn-secondary" style={{ padding: '2px 6px', fontSize: '0.75rem' }}>{part}</button>
                                    </span>
                                ))}
                            </div>
                            <div style={{ padding: '4px' }}>
                                {loadingDirs ? (
                                    <div style={{ padding: '8px', opacity: 0.6, fontSize: '0.8rem' }}>Loading...</div>
                                ) : directories.length === 0 ? (
                                    <div style={{ padding: '8px', opacity: 0.6, fontSize: '0.8rem' }}>No subdirectories</div>
                                ) : directories.map(dir => (
                                    <button key={dir} onClick={() => selectDirectory(dir)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', color: 'var(--color-text)' }}>📁 {dir}</button>
                                ))}
                            </div>
                        </div>
                    )}

                    <p class="text-secondary" style={{ fontSize: '0.8rem', marginBottom: 'var(--space-lg)' }}>
                        Files will be saved to: <code>{customPath}</code>
                    </p>

                    {/* Download Options */}
                    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
                        <label class="form-label" style={{ marginBottom: 'var(--space-sm)' }}>Options (override global defaults)</label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-sm)', cursor: 'pointer' }}>
                            <input type="checkbox" checked={ignoreExisting} onChange={(e) => setIgnoreExisting(e.target.checked)} />
                            <span>Skip existing files</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-sm)', cursor: 'pointer' }}>
                            <input type="checkbox" checked={checksum} onChange={(e) => setChecksum(e.target.checked)} />
                            <span>Verify checksums</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-md)', cursor: 'pointer' }}>
                            <input type="checkbox" checked={noDirectories} onChange={(e) => setNoDirectories(e.target.checked)} />
                            <span>Flatten directory structure</span>
                        </label>
                    </div>

                    {/* Source Filter */}
                    <label class="form-label">Source Filter (optional)</label>
                    <select class="form-input" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} style={{ marginBottom: 0 }}>
                        <option value="">All sources</option>
                        <option value="original">Original files only</option>
                        <option value="derivative">Derivatives only</option>
                        <option value="metadata">Metadata only</option>
                    </select>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onClick={handleClose}>Cancel</button>
                    <button class="btn btn-primary" onClick={handleConfirm}><DownloadIcon /> Start Download</button>
                </div>
            </div>
        </div>
    );
}


export default function Item({ identifier }) {
    const { addToast } = useToast();
    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [downloading, setDownloading] = useState({});

    // Download modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [pendingDownload, setPendingDownload] = useState(null);

    // File filtering
    const [fileSearch, setFileSearch] = useState('');
    const [fileType, setFileType] = useState('');
    const [showOriginalOnly, setShowOriginalOnly] = useState(false);
    const [descriptionExpanded, setDescriptionExpanded] = useState(false);

    // Bookmark state
    const [isBookmarked, setIsBookmarked] = useState(false);
    const [bookmarkLoading, setBookmarkLoading] = useState(false);

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

    // Check bookmark status on load
    useEffect(() => {
        async function checkBookmark() {
            try {
                await api.getBookmark(identifier);
                setIsBookmarked(true);
            } catch {
                setIsBookmarked(false);
            }
        }
        checkBookmark();
    }, [identifier]);

    const toggleBookmark = async () => {
        if (bookmarkLoading) return;
        setBookmarkLoading(true);
        try {
            if (isBookmarked) {
                await api.deleteBookmark(identifier);
                setIsBookmarked(false);
                addToast('Bookmark removed', 'success');
            } else {
                await api.createBookmark(identifier);
                setIsBookmarked(true);
                addToast('Bookmark added', 'success');
            }
        } catch (err) {
            addToast('Failed to update bookmark', 'error');
        } finally {
            setBookmarkLoading(false);
        }
    };

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

    // Description processing - must be before early returns (Rules of Hooks)
    const descriptionSource = item?.metadata?.description || '';
    const descriptionHtml = useMemo(() => sanitizeDescription(descriptionSource), [descriptionSource]);
    const descriptionText = useMemo(() => plainTextDescription(descriptionSource), [descriptionSource]);
    const descriptionIsLong = descriptionText.length > 360;

    useEffect(() => {
        setDescriptionExpanded(false);
    }, [descriptionSource]);

    // Open download modal with pending download info
    const openDownloadModal = (type, files = null, filename = null) => {
        setPendingDownload({ type, files, filename });
        setModalOpen(true);
    };

    // Execute download after modal confirmation
    const executeDownload = async (options) => {
        if (!pendingDownload) return;

        const { type, files, filename } = pendingDownload;
        const downloadKey = filename || (type === 'all' ? '__all__' : '__filtered__');

        setModalOpen(false);
        setDownloading(prev => ({ ...prev, [downloadKey]: true }));

        try {
            await api.startDownload(identifier, {
                files,
                ...options,
            });
            const message = filename
                ? `📥 Added ${filename} to queue`
                : type === 'all'
                    ? `📥 Added all files from ${identifier} to queue`
                    : `📥 Added ${files.length} files to queue`;
            addToast(message, 'success');
        } catch (err) {
            console.error('Download failed:', err);
            addToast('Failed to start download', 'error');
        } finally {
            setDownloading(prev => ({ ...prev, [downloadKey]: false }));
            setPendingDownload(null);
        }
    };

    const handleDownload = (filename) => {
        openDownloadModal('single', [filename], filename);
    };

    const handleDownloadAll = () => {
        openDownloadModal('all', null, null);
    };

    const handleDownloadFiltered = () => {
        const filenames = filteredFiles.map(f => f.name);
        openDownloadModal('filtered', filenames, null);
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
            <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)', flexWrap: 'wrap' }}>
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
                <button
                    class={`btn ${isBookmarked ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={toggleBookmark}
                    disabled={bookmarkLoading}
                    title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
                >
                    <BookmarkIcon filled={isBookmarked} />
                    {isBookmarked ? 'Bookmarked' : 'Bookmark'}
                </button>
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
                        {descriptionSource && (
                            <div style={{ marginTop: 'var(--space-md)' }}>
                                <div
                                    class={`item-description ${descriptionIsLong && !descriptionExpanded ? 'item-description-clamped' : ''}`}
                                    dangerouslySetInnerHTML={{ __html: descriptionHtml }}
                                />
                                {descriptionIsLong && (
                                    <button
                                        class="btn btn-secondary btn-sm"
                                        onClick={() => setDescriptionExpanded(prev => !prev)}
                                        aria-expanded={descriptionExpanded}
                                        style={{ marginTop: 'var(--space-sm)' }}
                                    >
                                        {descriptionExpanded ? 'Show less' : 'Show full description'}
                                    </button>
                                )}
                            </div>
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

            {/* Download Path Modal */}
            <DownloadModal
                isOpen={modalOpen}
                onClose={() => {
                    setModalOpen(false);
                    setPendingDownload(null);
                }}
                onConfirm={executeDownload}
                identifier={identifier}
                filename={pendingDownload?.filename}
                fileCount={pendingDownload?.files?.length || item?.files?.length || 0}
            />
        </div>
    );
}
