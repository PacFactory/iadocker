import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { api } from '../api/client';

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

export default function Settings() {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);

    useEffect(() => {
        async function load() {
            try {
                const data = await api.getAuthStatus();
                setStatus(data);
            } catch (err) {
                console.error('Failed to load status:', err);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    const handleConfigure = async (e) => {
        e.preventDefault();
        if (!email || !password) return;

        setSaving(true);
        setMessage(null);
        try {
            await api.configure(email, password);
            setStatus({ configured: true, email });
            setPassword('');
            setMessage({ type: 'success', text: 'Configuration saved successfully!' });
        } catch (err) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setSaving(false);
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
            <div class="page-header">
                <h1 class="page-title">Settings</h1>
                <p class="page-subtitle">Configure your Internet Archive account</p>
            </div>

            <div class="card">
                <div class="card-header">Account Configuration</div>
                <div class="card-body">
                    <div class="flex items-center gap-md" style={{ marginBottom: 'var(--space-lg)' }}>
                        <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: status?.configured ? 'rgba(63, 185, 80, 0.2)' : 'rgba(248, 81, 73, 0.2)',
                            color: status?.configured ? 'var(--color-success)' : 'var(--color-error)',
                        }}>
                            {status?.configured ? <CheckIcon /> : <XIcon />}
                        </div>
                        <div>
                            <div style={{ fontWeight: 500 }}>
                                {status?.configured ? 'Connected' : 'Not Configured'}
                            </div>
                            {status?.email && (
                                <div class="text-secondary">{status.email}</div>
                            )}
                        </div>
                    </div>

                    {message && (
                        <div style={{
                            padding: 'var(--space-md)',
                            borderRadius: 'var(--radius-md)',
                            marginBottom: 'var(--space-lg)',
                            background: message.type === 'success' ? 'rgba(63, 185, 80, 0.2)' : 'rgba(248, 81, 73, 0.2)',
                            color: message.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
                        }}>
                            {message.text}
                        </div>
                    )}

                    <form onSubmit={handleConfigure}>
                        <div class="form-group">
                            <label class="form-label">Archive.org Email</label>
                            <input
                                type="email"
                                class="form-input"
                                placeholder="your@email.com"
                                value={email}
                                onInput={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div class="form-group">
                            <label class="form-label">Password</label>
                            <input
                                type="password"
                                class="form-input"
                                placeholder="Your archive.org password"
                                value={password}
                                onInput={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                        <button type="submit" class="btn btn-primary" disabled={saving}>
                            {saving ? 'Saving...' : 'Save Configuration'}
                        </button>
                    </form>
                </div>
            </div>

            <div class="card" style={{ marginTop: 'var(--space-lg)' }}>
                <div class="card-header">About</div>
                <div class="card-body">
                    <p class="text-secondary">
                        IA Docker GUI is a web interface for the Internet Archive CLI tool.
                        It allows you to search, download, and upload content to archive.org.
                    </p>
                    <p class="text-secondary" style={{ marginTop: 'var(--space-md)' }}>
                        Downloads are saved to the <code>/data</code> volume.
                    </p>
                </div>
            </div>
        </div>
    );
}
