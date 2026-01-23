import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { api, subscribeToUploads } from '../api/client';

const UploadIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
);

const CheckIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

const XIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);

export default function Uploads() {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [identifier, setIdentifier] = useState('');
    const [title, setTitle] = useState('');
    const [mediatype, setMediatype] = useState('data');
    const [files, setFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);

    useEffect(() => {
        async function load() {
            try {
                const data = await api.getUploads();
                setJobs(data);
            } catch (err) {
                console.error('Failed to load uploads:', err);
            } finally {
                setLoading(false);
            }
        }
        load();

        const unsubscribe = subscribeToUploads((event) => {
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

    const handleFileSelect = (e) => {
        setFiles(Array.from(e.target.files));
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!identifier || files.length === 0) return;

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('identifier', identifier);
            formData.append('title', title || identifier);
            formData.append('mediatype', mediatype);
            files.forEach(file => formData.append('files', file));

            const response = await fetch('/api/uploads', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) throw new Error('Upload failed');

            setIdentifier('');
            setTitle('');
            setFiles([]);
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (err) {
            console.error('Upload failed:', err);
        } finally {
            setUploading(false);
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

    return (
        <div>
            <div class="page-header">
                <h1 class="page-title">Upload to Archive.org</h1>
                <p class="page-subtitle">Upload files to the Internet Archive</p>
            </div>

            <div class="card" style={{ marginBottom: 'var(--space-xl)' }}>
                <div class="card-header">New Upload</div>
                <div class="card-body">
                    <form onSubmit={handleUpload}>
                        <div class="form-group">
                            <label class="form-label">Identifier *</label>
                            <input
                                type="text"
                                class="form-input"
                                placeholder="unique-item-identifier"
                                value={identifier}
                                onInput={(e) => setIdentifier(e.target.value)}
                                required
                            />
                        </div>
                        <div class="form-group">
                            <label class="form-label">Title</label>
                            <input
                                type="text"
                                class="form-input"
                                placeholder="Item title"
                                value={title}
                                onInput={(e) => setTitle(e.target.value)}
                            />
                        </div>
                        <div class="form-group">
                            <label class="form-label">Media Type</label>
                            <select
                                class="form-input"
                                value={mediatype}
                                onChange={(e) => setMediatype(e.target.value)}
                            >
                                <option value="data">Data</option>
                                <option value="texts">Texts</option>
                                <option value="movies">Movies</option>
                                <option value="audio">Audio</option>
                                <option value="software">Software</option>
                                <option value="image">Image</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Files *</label>
                            <input
                                type="file"
                                ref={fileInputRef}
                                class="form-input"
                                multiple
                                onChange={handleFileSelect}
                                required
                            />
                        </div>
                        <button type="submit" class="btn btn-primary" disabled={uploading}>
                            <UploadIcon />
                            {uploading ? 'Starting Upload...' : 'Upload'}
                        </button>
                    </form>
                </div>
            </div>

            <h2 style={{ marginBottom: 'var(--space-md)' }}>Upload History</h2>

            {loading ? (
                <div class="loading-container">
                    <div class="loading-spinner"></div>
                </div>
            ) : jobs.length > 0 ? (
                <div class="job-list">
                    {jobs.map(job => (
                        <div key={job.id} class="job-item">
                            <div class="job-icon">
                                {job.status === 'completed' ? <CheckIcon /> : <UploadIcon />}
                            </div>
                            <div class="job-info" style={{ flex: 1 }}>
                                <div class="job-title">{job.identifier}</div>
                                <div class="job-subtitle">
                                    {job.filename || 'Multiple files'}
                                    {job.error && ` • ${job.error}`}
                                </div>
                                {job.status === 'running' && (
                                    <div class="progress-bar" style={{ marginTop: 'var(--space-sm)' }}>
                                        <div class="progress-fill" style={{ width: `${job.progress}%` }}></div>
                                    </div>
                                )}
                            </div>
                            <div class="job-status">
                                <span class={`status-badge ${getStatusClass(job.status)}`}>
                                    {job.status}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div class="empty-state">
                    <UploadIcon />
                    <h3>No Uploads Yet</h3>
                    <p>Use the form above to upload files to Archive.org</p>
                </div>
            )}
        </div>
    );
}
