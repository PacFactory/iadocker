import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { api, subscribeToDownloads } from '../api/client';

const DownloadIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
);

const XIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);

const CheckIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return '';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) {
        size /= 1024;
        i++;
    }
    return `${size.toFixed(1)} ${units[i]}`;
}

function formatSpeed(bytesPerSecond) {
    if (!bytesPerSecond || bytesPerSecond <= 0) return '';
    return `${formatBytes(bytesPerSecond)}/s`;
}

export default function Downloads() {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Load initial jobs
        async function load() {
            try {
                const data = await api.getDownloads();
                setJobs(data);
            } catch (err) {
                console.error('Failed to load downloads:', err);
            } finally {
                setLoading(false);
            }
        }
        load();

        // Subscribe to progress updates
        const unsubscribe = subscribeToDownloads((event) => {
            setJobs(prevJobs => {
                const idx = prevJobs.findIndex(j => j.id === event.id);
                if (idx >= 0) {
                    const updated = [...prevJobs];
                    updated[idx] = event;
                    return updated;
                }
                return [event, ...prevJobs];
            });
        });

        return unsubscribe;
    }, []);

    const handleCancel = async (jobId) => {
        try {
            await api.cancelDownload(jobId);
        } catch (err) {
            console.error('Failed to cancel:', err);
        }
    };

    const getStatusClass = (status) => {
        const map = {
            pending: 'status-pending',
            running: 'status-running',
            completed: 'status-completed',
            failed: 'status-failed',
            cancelled: 'status-failed',
        };
        return map[status] || 'status-pending';
    };

    const handleClearAll = async () => {
        try {
            await api.clearDownloads();
            // Remove completed/failed/cancelled from local state
            setJobs(prevJobs => prevJobs.filter(j =>
                j.status === 'pending' || j.status === 'running'
            ));
        } catch (err) {
            console.error('Failed to clear downloads:', err);
        }
    };

    const hasCompletedJobs = jobs.some(j =>
        j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled'
    );

    return (
        <div>
            <div class="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 class="page-title">Downloads</h1>
                    <p class="page-subtitle">Manage your download queue</p>
                </div>
                {hasCompletedJobs && (
                    <button class="btn btn-secondary" onClick={handleClearAll}>
                        🗑️ Clear History
                    </button>
                )}
            </div>

            {loading ? (
                <div class="loading-container">
                    <div class="loading-spinner"></div>
                </div>
            ) : jobs.length > 0 ? (
                <div class="job-list">
                    {jobs.map(job => (
                        <div key={job.id} class="job-item">
                            <div class="job-icon">
                                {job.status === 'completed' ? <CheckIcon /> : <DownloadIcon />}
                            </div>
                            <div class="job-info" style={{ flex: 1 }}>
                                <div class="job-title">{job.filename || 'All files'}</div>
                                <div class="job-subtitle">
                                    {job.identifier}
                                    {job.error && ` • ${job.error}`}
                                </div>
                                {job.status === 'running' && (
                                    <div style={{ marginTop: 'var(--space-sm)' }}>
                                        <div class="progress-bar">
                                            <div class="progress-fill" style={{ width: `${job.progress}%` }}></div>
                                        </div>
                                        <div style={{
                                            marginTop: '4px',
                                            fontSize: '0.75rem',
                                            color: 'var(--color-text-secondary)',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            gap: 'var(--space-md)'
                                        }}>
                                            <span>
                                                {job.progress.toFixed(1)}%
                                                {job.downloaded_bytes && job.total_bytes && (
                                                    <> • {formatBytes(job.downloaded_bytes)} / {formatBytes(job.total_bytes)}</>
                                                )}
                                            </span>
                                            {job.speed > 0 && (
                                                <span>{formatSpeed(job.speed)}</span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div class="job-status">
                                <span class={`status-badge ${getStatusClass(job.status)}`}>
                                    {job.status}
                                </span>
                                {(job.status === 'pending' || job.status === 'running') && (
                                    <button
                                        class="btn btn-secondary btn-icon"
                                        onClick={() => handleCancel(job.id)}
                                        title="Cancel"
                                    >
                                        <XIcon />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div class="empty-state">
                    <DownloadIcon />
                    <h3>No Downloads</h3>
                    <p>Start by searching for items and downloading files</p>
                    <a href="/" class="btn btn-primary mt-md">Search Archive</a>
                </div>
            )}
        </div>
    );
}
