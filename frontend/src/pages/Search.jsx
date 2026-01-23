import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { route } from 'preact-router';
import { api } from '../api/client';

const SearchIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
    </svg>
);

export default function Search() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);

    const handleSearch = async (e) => {
        e?.preventDefault();
        if (!query.trim()) return;

        setLoading(true);
        try {
            const data = await api.search(query, { page, rows: 20 });
            setResults(data.results);
            setTotal(data.total);
        } catch (error) {
            console.error('Search failed:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleItemClick = (identifier) => {
        route(`/item/${identifier}`);
    };

    return (
        <div>
            <div class="page-header">
                <h1 class="page-title">Search Archive.org</h1>
                <p class="page-subtitle">Explore millions of items in the Internet Archive</p>
            </div>

            <form onSubmit={handleSearch} class="search-bar">
                <div class="search-input-wrapper">
                    <SearchIcon />
                    <input
                        type="text"
                        class="search-input"
                        placeholder="Search for books, movies, audio, software..."
                        value={query}
                        onInput={(e) => setQuery(e.target.value)}
                    />
                </div>
                <button type="submit" class="btn btn-primary btn-lg" disabled={loading}>
                    {loading ? 'Searching...' : 'Search'}
                </button>
            </form>

            {results.length > 0 && (
                <p class="text-secondary" style={{ marginBottom: 'var(--space-md)' }}>
                    Found {total.toLocaleString()} results
                </p>
            )}

            {loading ? (
                <div class="loading-container">
                    <div class="loading-spinner"></div>
                </div>
            ) : results.length > 0 ? (
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
                                        <span>{item.date}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : query && !loading ? (
                <div class="empty-state">
                    <SearchIcon />
                    <h3>No results found</h3>
                    <p>Try different keywords or filters</p>
                </div>
            ) : (
                <div class="empty-state">
                    <SearchIcon />
                    <h3>Start Your Search</h3>
                    <p>Enter a query to search the Internet Archive</p>
                </div>
            )}
        </div>
    );
}
