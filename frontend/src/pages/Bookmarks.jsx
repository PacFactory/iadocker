import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { api } from '../api/client';
import { useToast } from '../components/Toast';

const BookmarkIcon = ({ filled }) => (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" width="20" height="20">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
);

const TrashIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
);

const ExternalIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
);

export default function Bookmarks() {
    const { addToast } = useToast();
    const [bookmarks, setBookmarks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState({});

    useEffect(() => {
        loadBookmarks();
    }, []);

    const loadBookmarks = async () => {
        try {
            const data = await api.getBookmarks();
            setBookmarks(data);
        } catch (err) {
            addToast('Failed to load bookmarks', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (identifier) => {
        if (deleting[identifier]) return;

        setDeleting(prev => ({ ...prev, [identifier]: true }));
        try {
            await api.deleteBookmark(identifier);
            setBookmarks(prev => prev.filter(b => b.identifier !== identifier));
            addToast('Bookmark removed', 'success');
        } catch (err) {
            addToast('Failed to remove bookmark', 'error');
        } finally {
            setDeleting(prev => ({ ...prev, [identifier]: false }));
        }
    };

    if (loading) {
        return (
            <div class="loading-container">
                <div class="loading-spinner"></div>
            </div>
        );
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
                <h1 class="page-title">
                    <BookmarkIcon filled={true} /> Bookmarks
                </h1>
                <span class="text-secondary">{bookmarks.length} items</span>
            </div>

            {bookmarks.length === 0 ? (
                <div class="empty-state">
                    <BookmarkIcon filled={false} />
                    <h3>No bookmarks yet</h3>
                    <p>Bookmark items from the search results or item details page to save them here.</p>
                    <a href="/" class="btn btn-primary">Browse Archive.org</a>
                </div>
            ) : (
                <div class="card">
                    <div class="card-body" style={{ padding: 0 }}>
                        <div class="job-list">
                            {bookmarks.map(bookmark => (
                                <div key={bookmark.identifier} class="job-item" style={{ alignItems: 'flex-start' }}>
                                    <a href={`/item/${bookmark.identifier}`} style={{ flexShrink: 0 }}>
                                        <img
                                            src={bookmark.thumbnail_url || `https://archive.org/services/img/${bookmark.identifier}`}
                                            alt={bookmark.title || bookmark.identifier}
                                            style={{
                                                width: '80px',
                                                height: '60px',
                                                objectFit: 'cover',
                                                borderRadius: 'var(--radius-sm)',
                                            }}
                                        />
                                    </a>
                                    <div class="job-info" style={{ minWidth: 0, flex: 1 }}>
                                        <a href={`/item/${bookmark.identifier}`} class="job-title" style={{ textDecoration: 'none', color: 'inherit' }}>
                                            {bookmark.title || bookmark.identifier}
                                        </a>
                                        <div class="job-subtitle" style={{ marginTop: '4px' }}>
                                            <code style={{ fontSize: '0.75rem' }}>{bookmark.identifier}</code>
                                            {bookmark.mediatype && (
                                                <span class="result-badge" style={{ marginLeft: '8px', fontSize: '0.7rem' }}>
                                                    {bookmark.mediatype}
                                                </span>
                                            )}
                                        </div>
                                        {bookmark.description && (
                                            <p style={{
                                                marginTop: '8px',
                                                fontSize: '0.85rem',
                                                color: 'var(--color-text-secondary)',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                display: '-webkit-box',
                                                WebkitLineClamp: 2,
                                                WebkitBoxOrient: 'vertical',
                                            }}>
                                                {bookmark.description}
                                            </p>
                                        )}
                                        {bookmark.tags && bookmark.tags.length > 0 && (
                                            <div style={{ marginTop: '8px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                {bookmark.tags.map(tag => (
                                                    <span key={tag} class="result-badge" style={{
                                                        fontSize: '0.7rem',
                                                        background: 'var(--color-accent-muted)',
                                                        padding: '2px 6px',
                                                    }}>
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        {bookmark.notes && (
                                            <p style={{
                                                marginTop: '8px',
                                                fontSize: '0.8rem',
                                                fontStyle: 'italic',
                                                color: 'var(--color-text-secondary)',
                                            }}>
                                                "{bookmark.notes}"
                                            </p>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                                        <a
                                            href={`https://archive.org/details/${bookmark.identifier}`}
                                            target="_blank"
                                            rel="noopener"
                                            class="btn btn-secondary btn-icon"
                                            title="View on Archive.org"
                                        >
                                            <ExternalIcon />
                                        </a>
                                        <button
                                            class="btn btn-secondary btn-icon"
                                            onClick={() => handleDelete(bookmark.identifier)}
                                            disabled={deleting[bookmark.identifier]}
                                            title="Remove bookmark"
                                            style={{ color: 'var(--color-error)' }}
                                        >
                                            <TrashIcon />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
