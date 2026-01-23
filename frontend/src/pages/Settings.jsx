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

const RefreshIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
        <polyline points="23 4 23 10 17 10" />
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
);

const KeyIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
        <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
);

export default function Settings() {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);
    const [verifying, setVerifying] = useState(false);

    const loadStatus = async () => {
        setLoading(true);
        setMessage(null);
        try {
            const data = await api.getAuthStatus();
            setStatus(data);
            if (data.email && !email) {
                setEmail(data.email);
            }
        } catch (err) {
            console.error('Failed to load status:', err);
            setMessage({ type: 'error', text: 'Failed to check configuration status' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadStatus();
    }, []);

    const handleConfigure = async (e) => {
        e.preventDefault();
        if (!email || !password) {
            setMessage({ type: 'error', text: 'Email and password are required' });
            return;
        }

        setSaving(true);
        setMessage(null);

        try {
            const result = await api.configure(email, password);

            if (result.success) {
                setPassword('');
                setMessage({ type: 'success', text: 'Configuration saved! Verifying...' });

                // Verify the configuration worked
                setVerifying(true);
                await new Promise(r => setTimeout(r, 1000));

                const verifyResult = await api.getAuthStatus();
                if (verifyResult.configured) {
                    setStatus(verifyResult);
                    setMessage({ type: 'success', text: '✓ Login successful! Configuration verified.' });
                } else {
                    setMessage({ type: 'warning', text: 'Configuration saved but could not verify. Check credentials.' });
                }
                setVerifying(false);
            } else {
                throw new Error(result.message || 'Configuration failed');
            }
        } catch (err) {
            setMessage({ type: 'error', text: err.message || 'Login failed. Check your credentials.' });
            setSaving(false);
            setVerifying(false);
            return;
        }

        setSaving(false);
    };

    const handleTestLogin = async () => {
        setVerifying(true);
        setMessage(null);

        try {
            const result = await api.getAuthStatus();
            if (result.configured) {
                setStatus(result);
                setMessage({ type: 'success', text: '✓ Configuration is valid!' });
            } else {
                setMessage({ type: 'error', text: 'Not configured or credentials invalid' });
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Failed to verify configuration' });
        }

        setVerifying(false);
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
                <div class="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Account Configuration</span>
                    <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                        <button
                            class="btn btn-secondary"
                            onClick={handleTestLogin}
                            disabled={verifying}
                            style={{ padding: '4px 12px', fontSize: '0.85rem' }}
                        >
                            <KeyIcon /> {verifying ? 'Verifying...' : 'Test Login'}
                        </button>
                        <button
                            class="btn btn-secondary btn-icon"
                            onClick={loadStatus}
                            title="Refresh status"
                            style={{ padding: '4px 8px' }}
                        >
                            <RefreshIcon />
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    {/* Status indicator */}
                    <div class="flex items-center gap-md" style={{
                        marginBottom: 'var(--space-lg)',
                        padding: 'var(--space-md)',
                        background: status?.configured ? 'rgba(63, 185, 80, 0.1)' : 'rgba(248, 81, 73, 0.1)',
                        borderRadius: 'var(--radius-md)',
                        border: `1px solid ${status?.configured ? 'rgba(63, 185, 80, 0.3)' : 'rgba(248, 81, 73, 0.3)'}`
                    }}>
                        <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: status?.configured ? 'rgba(63, 185, 80, 0.2)' : 'rgba(248, 81, 73, 0.2)',
                            color: status?.configured ? 'var(--color-success)' : 'var(--color-error)',
                        }}>
                            {status?.configured ? <CheckIcon /> : <XIcon />}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>
                                {status?.configured ? '✓ Connected to Archive.org' : '✗ Not Configured'}
                            </div>
                            {status?.email ? (
                                <div class="text-secondary">Logged in as: {status.email}</div>
                            ) : status?.configured ? (
                                <div class="text-secondary" style={{ fontStyle: 'italic' }}>API keys saved</div>
                            ) : (
                                <div class="text-secondary">Enter your archive.org credentials below</div>
                            )}
                        </div>
                    </div>

                    {/* Messages */}
                    {message && (
                        <div style={{
                            padding: 'var(--space-md)',
                            borderRadius: 'var(--radius-md)',
                            marginBottom: 'var(--space-lg)',
                            background: message.type === 'success' ? 'rgba(63, 185, 80, 0.2)' :
                                message.type === 'warning' ? 'rgba(210, 153, 34, 0.2)' :
                                    'rgba(248, 81, 73, 0.2)',
                            color: message.type === 'success' ? 'var(--color-success)' :
                                message.type === 'warning' ? 'var(--color-warning)' :
                                    'var(--color-error)',
                            border: `1px solid ${message.type === 'success' ? 'rgba(63, 185, 80, 0.3)' :
                                message.type === 'warning' ? 'rgba(210, 153, 34, 0.3)' :
                                    'rgba(248, 81, 73, 0.3)'}`
                        }}>
                            {message.text}
                        </div>
                    )}

                    {/* Login form */}
                    <form onSubmit={handleConfigure}>
                        <div class="form-group">
                            <label class="form-label">Archive.org Email *</label>
                            <input
                                type="email"
                                class="form-input"
                                placeholder="your@email.com"
                                value={email}
                                onInput={(e) => setEmail(e.target.value)}
                                required
                                autoComplete="email"
                            />
                        </div>
                        <div class="form-group">
                            <label class="form-label">Password *</label>
                            <input
                                type="password"
                                class="form-input"
                                placeholder={status?.configured ? "Enter password to update" : "Your archive.org password"}
                                value={password}
                                onInput={(e) => setPassword(e.target.value)}
                                required
                                autoComplete="current-password"
                            />
                            <p class="text-secondary" style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                                Your password is sent directly to archive.org and stored locally in /config/ia.ini
                            </p>
                        </div>
                        <button
                            type="submit"
                            class="btn btn-primary btn-lg"
                            disabled={saving || verifying || !email || !password}
                            style={{ width: '100%' }}
                        >
                            {saving ? 'Saving...' : verifying ? 'Verifying...' : status?.configured ? '🔄 Update Configuration' : '🔐 Login & Save'}
                        </button>
                    </form>
                </div>
            </div>

            {/* Info cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-lg)', marginTop: 'var(--space-lg)' }}>
                <div class="card">
                    <div class="card-header">📥 Downloads</div>
                    <div class="card-body">
                        <p class="text-secondary">
                            Downloads are saved to the <code>/data</code> volume, which maps to your local <code>./data</code> directory.
                        </p>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">🔐 Configuration</div>
                    <div class="card-body">
                        <p class="text-secondary">
                            Credentials are stored in <code>/config/ia.ini</code>. This file persists across container restarts.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
