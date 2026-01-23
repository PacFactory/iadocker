import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { route } from 'preact-router';
import { api } from '../api/client';
import { useToast } from '../components/Toast';

const SearchIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
    </svg>
);

const FilterIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
);

const LinkIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
);

const ChevronIcon = ({ open }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"
        style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
        <polyline points="6 9 12 15 18 9" />
    </svg>
);

// Media types
const MEDIA_TYPES = [
    { value: '', label: 'All Types' },
    { value: 'texts', label: '📚 Texts' },
    { value: 'movies', label: '🎬 Movies' },
    { value: 'audio', label: '🎵 Audio' },
    { value: 'software', label: '💿 Software' },
    { value: 'image', label: '🖼️ Images' },
    { value: 'data', label: '📊 Data' },
    { value: 'web', label: '🌐 Web Archives' },
    { value: 'etree', label: '🎸 Live Music' },
    { value: 'collection', label: '📁 Collections' },
];

// Popular collections
const POPULAR_COLLECTIONS = [
    { value: '', label: 'All Collections' },
    { value: 'opensource_movies', label: 'Open Source Movies' },
    { value: 'opensource_audio', label: 'Open Source Audio' },
    { value: 'prelinger', label: 'Prelinger Archives' },
    { value: 'internetarchivebooks', label: 'Internet Archive Books' },
    { value: 'oldtimeradio', label: 'Old Time Radio' },
    { value: 'computerphotos', label: 'Computer Photos' },
    { value: 'librivoxaudio', label: 'LibriVox Audiobooks' },
    { value: 'tvnews', label: 'TV News Archive' },
    { value: 'softwarelibrary', label: 'Software Library' },
    { value: 'classicpcgames', label: 'Classic PC Games' },
    { value: 'msdos_games', label: 'MS-DOS Games' },
    { value: 'consolelivingroom', label: 'Console Living Room' },
];

// Sort options
const SORT_OPTIONS = [
    { value: '', label: 'Relevance' },
    { value: '-downloads', label: 'Most Downloaded' },
    { value: '-week', label: 'Trending This Week' },
    { value: '-publicdate', label: 'Newest First' },
    { value: 'publicdate', label: 'Oldest First' },
    { value: 'titleSorter', label: 'Title A-Z' },
    { value: '-titleSorter', label: 'Title Z-A' },
];

// Extract identifier (and optional filename) from archive.org URL
// Returns { identifier, filename } or null
function parseArchiveUrl(input) {
    const trimmed = input.trim();

    // Check for download URL with specific file: archive.org/download/identifier/path/to/file.zip
    const downloadWithFilePattern = /archive\.org\/download\/([^\/\?\#\s]+)\/(.+?)(?:\?|#|$)/;
    const downloadWithFileMatch = trimmed.match(downloadWithFilePattern);
    if (downloadWithFileMatch) {
        return {
            identifier: downloadWithFileMatch[1],
            filename: decodeURIComponent(downloadWithFileMatch[2])
        };
    }

    // Check if it's an archive.org URL (identifier only)
    const urlPatterns = [
        /archive\.org\/details\/([^\/\?\#\s]+)/,
        /archive\.org\/download\/([^\/\?\#\s]+)\/?$/,
        /archive\.org\/metadata\/([^\/\?\#\s]+)/,
        /archive\.org\/embed\/([^\/\?\#\s]+)/,
    ];

    for (const pattern of urlPatterns) {
        const match = trimmed.match(pattern);
        if (match) {
            return { identifier: match[1], filename: null };
        }
    }

    // Check if it looks like a bare identifier (no spaces, reasonable length)
    if (/^[a-zA-Z0-9_\-\.]+$/.test(trimmed) && trimmed.length > 2 && trimmed.length < 200) {
        return { identifier: trimmed, filename: null };
    }

    return null;
}

// Parse multiple URLs from text (one per line)
// Returns array of { identifier, filename } objects
function parseMultipleUrls(input) {
    const lines = input.split(/[\n\r]+/).map(l => l.trim()).filter(l => l.length > 0);
    const results = [];

    for (const line of lines) {
        const parsed = parseArchiveUrl(line);
        if (parsed) {
            results.push(parsed);
        }
    }

    return results;
}

export default function Search() {
    const { addToast } = useToast();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [showFilters, setShowFilters] = useState(false);
    const [showBulkMode, setShowBulkMode] = useState(false);
    const [bulkUrls, setBulkUrls] = useState('');
    const [downloading, setDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState('');

    // Filters
    const [mediatype, setMediatype] = useState('');
    const [collection, setCollection] = useState('');
    const [sort, setSort] = useState('');
    const [year, setYear] = useState('');
    const [creator, setCreator] = useState('');

    // Parse bulk URLs from textarea
    const parsedBulkUrls = parseMultipleUrls(bulkUrls);

    // Check if search input has multiple URLs (legacy mode)
    const parsedUrls = query.includes('\n') || query.includes('archive.org')
        ? parseMultipleUrls(query)
        : [];
    const isBulkMode = parsedUrls.length > 1;

    const handleSearch = async (e, newPage = 1) => {
        e?.preventDefault();

        const trimmedQuery = query.trim();

        // If bulk mode, handle bulk download instead
        if (isBulkMode) {
            await handleBulkDownload();
            return;
        }

        // Check if it's an archive.org URL with specific file to download
        const parsed = parseArchiveUrl(trimmedQuery);
        if (parsed && trimmedQuery.includes('archive.org')) {
            if (parsed.filename) {
                // Direct file download
                setDownloading(true);
                try {
                    await api.startDownload(parsed.identifier, [parsed.filename]);
                    addToast(`📥 Added ${parsed.filename} to queue`, 'success');
                    setDownloading(false);
                } catch (err) {
                    console.error('Download failed:', err);
                    addToast('Failed to start download', 'error');
                    setDownloading(false);
                }
                return;
            } else {
                // Just go to item page
                route(`/item/${parsed.identifier}`);
                return;
            }
        }

        // Empty query with no filters - don't search
        if (!trimmedQuery && !collection && !mediatype && !creator) {
            return;
        }

        setLoading(true);
        setPage(newPage);

        try {
            const options = { page: newPage, rows: 24 };
            if (mediatype) options.mediatype = mediatype;
            if (collection) options.collection = collection;
            if (sort) options.sort = sort;

            // Build advanced query
            let searchQuery = trimmedQuery || '*';
            if (year) searchQuery += ` AND year:${year}`;
            if (creator) searchQuery += ` AND creator:"${creator}"`;

            const data = await api.search(searchQuery, options);
            setResults(data.results);
            setTotal(data.total);
        } catch (error) {
            console.error('Search failed:', error);
        } finally {
            setLoading(false);
        }
    };

    // Bulk download handler
    const handleBulkDownload = async () => {
        if (parsedUrls.length === 0) return;

        setDownloading(true);
        setDownloadProgress(`Queuing 0/${parsedUrls.length}...`);

        let queued = 0;
        for (const item of parsedUrls) {
            try {
                if (item.filename) {
                    await api.startDownload(item.identifier, [item.filename]);
                } else {
                    await api.startDownload(item.identifier);
                }
                queued++;
                setDownloadProgress(`Queuing ${queued}/${parsedUrls.length}...`);
            } catch (err) {
                console.error(`Failed to queue ${item.identifier}:`, err);
            }
        }

        addToast(`📥 Added ${parsedUrls.length} items to queue`, 'success');
        setDownloading(false);
    };

    const handleItemClick = (identifier) => {
        route(`/item/${identifier}`);
    };

    const handleGoToIdentifier = async () => {
        const parsed = parseArchiveUrl(query.trim());
        if (parsed) {
            if (parsed.filename) {
                // Start download and show toast
                setDownloading(true);
                try {
                    await api.startDownload(parsed.identifier, [parsed.filename]);
                    addToast(`📥 Added ${parsed.filename} to queue`, 'success');
                    setDownloading(false);
                } catch (err) {
                    console.error('Download failed:', err);
                    addToast('Failed to start download', 'error');
                    setDownloading(false);
                }
            } else {
                route(`/item/${parsed.identifier}`);
            }
        }
    };

    const clearFilters = () => {
        setMediatype('');
        setCollection('');
        setSort('');
        setYear('');
        setCreator('');
    };

    const hasFilters = mediatype || collection || sort || year || creator;
    const totalPages = Math.ceil(total / 24);

    return (
        <div>
            <div class="page-header">
                <h1 class="page-title">Search Archive.org</h1>
                <p class="page-subtitle">Explore millions of items in the Internet Archive</p>
            </div>

            <form onSubmit={handleSearch} class="search-bar" style={{ flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
                <div class="search-input-wrapper" style={{ flex: '1 1 300px' }}>
                    <SearchIcon />
                    <input
                        type="text"
                        class="search-input"
                        placeholder="Search, paste URL, or enter identifier..."
                        value={query}
                        onInput={(e) => setQuery(e.target.value)}
                    />
                </div>

                <button
                    type="button"
                    class={`btn ${showFilters || hasFilters ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setShowFilters(!showFilters)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                    <FilterIcon />
                    Filters
                    {hasFilters && <span style={{
                        background: 'rgba(255,255,255,0.3)',
                        borderRadius: '50%',
                        width: '18px',
                        height: '18px',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>!</span>}
                    <ChevronIcon open={showFilters} />
                </button>

                <button
                    type="button"
                    class={`btn ${showBulkMode ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setShowBulkMode(!showBulkMode)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                    📥 Bulk
                </button>

                <button type="submit" class="btn btn-primary btn-lg" disabled={loading}>
                    {loading ? 'Searching...' : 'Search'}
                </button>
            </form>

            {/* Dedicated Bulk Download Panel */}
            {showBulkMode && (
                <div class="card" style={{ marginBottom: 'var(--space-lg)' }}>
                    <div class="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong>📥 Bulk Download</strong>
                        {parsedBulkUrls.length > 0 && (
                            <span class="result-badge">{parsedBulkUrls.length} items detected</span>
                        )}
                    </div>
                    <div class="card-body">
                        <div class="form-group" style={{ marginBottom: 'var(--space-md)' }}>
                            <label class="form-label">Paste archive.org URLs (one per line)</label>
                            <textarea
                                class="form-input"
                                rows="6"
                                placeholder={`https://archive.org/download/item1/file.zip\nhttps://archive.org/details/item2\nhttps://archive.org/download/item3/folder/file.mp4`}
                                value={bulkUrls}
                                onInput={(e) => setBulkUrls(e.target.value)}
                                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}
                            />
                        </div>
                        {parsedBulkUrls.length > 0 && (
                            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
                                {parsedBulkUrls.filter(p => p.filename).length} specific files, {parsedBulkUrls.filter(p => !p.filename).length} full items
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                            <button
                                class="btn btn-primary"
                                onClick={async () => {
                                    if (parsedBulkUrls.length === 0) return;
                                    setDownloading(true);
                                    setDownloadProgress(`Queuing 0/${parsedBulkUrls.length}...`);
                                    let queued = 0;
                                    for (const item of parsedBulkUrls) {
                                        try {
                                            if (item.filename) {
                                                await api.startDownload(item.identifier, [item.filename]);
                                            } else {
                                                await api.startDownload(item.identifier);
                                            }
                                            queued++;
                                            setDownloadProgress(`Queuing ${queued}/${parsedBulkUrls.length}...`);
                                        } catch (err) {
                                            console.error(`Failed to queue ${item.identifier}:`, err);
                                        }
                                    }
                                    addToast(`📥 Added ${parsedBulkUrls.length} items to queue`, 'success');
                                    setDownloading(false);
                                    setBulkUrls('');
                                    setShowBulkMode(false);
                                }}
                                disabled={downloading || parsedBulkUrls.length === 0}
                            >
                                {downloading ? 'Queuing...' : `Download ${parsedBulkUrls.length} Items`}
                            </button>
                            <button class="btn btn-secondary" onClick={() => setBulkUrls('')}>
                                Clear
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk mode indicator */}
            {isBulkMode && (
                <div style={{
                    marginTop: 'var(--space-sm)',
                    marginBottom: 'var(--space-md)',
                    padding: 'var(--space-md)',
                    background: 'rgba(88, 166, 255, 0.15)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid rgba(88, 166, 255, 0.3)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
                        <LinkIcon />
                        <strong>Bulk Download Mode</strong>
                        <span class="result-badge" style={{ marginLeft: 'auto' }}>{parsedUrls.length} items</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
                        {parsedUrls.filter(p => p.filename).length} specific files, {parsedUrls.filter(p => !p.filename).length} full items
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                        <button
                            class="btn btn-primary"
                            onClick={handleBulkDownload}
                            disabled={downloading}
                        >
                            {downloading ? downloadProgress || 'Queuing...' : `📥 Download All ${parsedUrls.length} Items`}
                        </button>
                        <button class="btn btn-secondary" onClick={() => setQuery('')}>
                            Clear
                        </button>
                    </div>
                </div>
            )}

            {/* Single URL mode - Quick access */}
            {!isBulkMode && query.trim() && parseArchiveUrl(query.trim()) && (() => {
                const parsed = parseArchiveUrl(query.trim());
                return (
                    <div style={{
                        marginTop: 'var(--space-sm)',
                        marginBottom: 'var(--space-md)',
                        padding: 'var(--space-sm) var(--space-md)',
                        background: parsed.filename ? 'rgba(63, 185, 80, 0.15)' : 'var(--color-accent-muted)',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-sm)',
                        border: parsed.filename ? '1px solid rgba(63, 185, 80, 0.3)' : 'none'
                    }}>
                        <LinkIcon />
                        <span style={{ flex: 1 }}>
                            {parsed.filename ? (
                                <>Download file: <strong>{parsed.filename}</strong> from <strong>{parsed.identifier}</strong></>
                            ) : (
                                <>Go directly to item: <strong>{parsed.identifier}</strong></>
                            )}
                        </span>
                        <button class="btn btn-primary" onClick={handleGoToIdentifier} disabled={downloading}>
                            {downloading ? 'Starting...' : parsed.filename ? '📥 Download' : 'Open Item'}
                        </button>
                    </div>
                );
            })()}

            {/* Advanced Filters */}
            {showFilters && (
                <div class="card" style={{ marginBottom: 'var(--space-lg)' }}>
                    <div class="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-md)' }}>
                        <div class="form-group" style={{ margin: 0 }}>
                            <label class="form-label">Media Type</label>
                            <select class="form-input" value={mediatype} onChange={(e) => setMediatype(e.target.value)}>
                                {MEDIA_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </div>

                        <div class="form-group" style={{ margin: 0 }}>
                            <label class="form-label">Collection</label>
                            <select class="form-input" value={collection} onChange={(e) => setCollection(e.target.value)}>
                                {POPULAR_COLLECTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                        </div>

                        <div class="form-group" style={{ margin: 0 }}>
                            <label class="form-label">Sort By</label>
                            <select class="form-input" value={sort} onChange={(e) => setSort(e.target.value)}>
                                {SORT_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                        </div>

                        <div class="form-group" style={{ margin: 0 }}>
                            <label class="form-label">Year</label>
                            <input
                                type="text"
                                class="form-input"
                                placeholder="e.g. 2020 or 1990-2000"
                                value={year}
                                onInput={(e) => setYear(e.target.value)}
                            />
                        </div>

                        <div class="form-group" style={{ margin: 0 }}>
                            <label class="form-label">Creator</label>
                            <input
                                type="text"
                                class="form-input"
                                placeholder="Author or creator"
                                value={creator}
                                onInput={(e) => setCreator(e.target.value)}
                            />
                        </div>

                        <div class="form-group" style={{ margin: 0, display: 'flex', alignItems: 'flex-end' }}>
                            <button type="button" class="btn btn-secondary" onClick={clearFilters} disabled={!hasFilters}>
                                Clear Filters
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Results header */}
            {results.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                    <p class="text-secondary">
                        Found {total.toLocaleString()} results
                        {hasFilters && ' (filtered)'}
                    </p>
                    {totalPages > 1 && (
                        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                            <button
                                class="btn btn-secondary"
                                disabled={page <= 1}
                                onClick={() => handleSearch(null, page - 1)}
                            >
                                ← Prev
                            </button>
                            <span class="text-secondary">Page {page} of {totalPages}</span>
                            <button
                                class="btn btn-secondary"
                                disabled={page >= totalPages}
                                onClick={() => handleSearch(null, page + 1)}
                            >
                                Next →
                            </button>
                        </div>
                    )}
                </div>
            )}

            {loading ? (
                <div class="loading-container">
                    <div class="loading-spinner"></div>
                </div>
            ) : results.length > 0 ? (
                <>
                    <div class="results-grid">
                        {results.map(item => (
                            <div
                                key={item.identifier}
                                class="result-card"
                                onClick={() => handleItemClick(item.identifier)}
                            >
                                <img
                                    class="result-thumbnail"
                                    src={`https://archive.org/services/img/${item.identifier}`}
                                    alt={item.title}
                                    loading="lazy"
                                    onError={(e) => {
                                        e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%2321262d" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%236e7681" font-size="12">No Image</text></svg>';
                                    }}
                                />
                                <div class="result-info">
                                    <h3 class="result-title">{item.title || item.identifier}</h3>
                                    <div class="result-meta">
                                        {item.mediatype && (
                                            <span class="result-badge">{item.mediatype}</span>
                                        )}
                                        {item.date && (
                                            <span>{item.date.substring(0, 10)}</span>
                                        )}
                                    </div>
                                    {item.creator && (
                                        <div class="text-secondary" style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                                            {typeof item.creator === 'string' ? item.creator : item.creator[0]}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Bottom pagination */}
                    {totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-sm)', marginTop: 'var(--space-xl)' }}>
                            <button
                                class="btn btn-secondary"
                                disabled={page <= 1}
                                onClick={() => handleSearch(null, page - 1)}
                            >
                                ← Previous
                            </button>
                            <span class="text-secondary" style={{ padding: '8px 16px' }}>
                                Page {page} of {totalPages}
                            </span>
                            <button
                                class="btn btn-secondary"
                                disabled={page >= totalPages}
                                onClick={() => handleSearch(null, page + 1)}
                            >
                                Next →
                            </button>
                        </div>
                    )}
                </>
            ) : query && !loading ? (
                <div class="empty-state">
                    <SearchIcon />
                    <h3>No results found</h3>
                    <p>Try different keywords or adjust filters</p>
                </div>
            ) : (
                <div class="empty-state">
                    <SearchIcon />
                    <h3>Start Your Search</h3>
                    <p>Enter a query, paste an archive.org URL, or browse by collection</p>

                    {/* Quick browse collections */}
                    <div style={{ marginTop: 'var(--space-lg)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)', justifyContent: 'center' }}>
                        {POPULAR_COLLECTIONS.slice(1, 7).map(c => (
                            <button
                                key={c.value}
                                class="btn btn-secondary"
                                onClick={() => {
                                    setCollection(c.value);
                                    setShowFilters(true);
                                    setTimeout(() => handleSearch(null, 1), 100);
                                }}
                            >
                                {c.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
