import { h } from 'preact';

const VERSION = 'v0.3.0';

// Icons
const SearchIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
    </svg>
);

const DownloadIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
);

const SettingsIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
);

const ArchiveLogo = () => (
    <svg viewBox="0 0 100 100" width="28" height="28">
        <rect x="10" y="70" width="80" height="20" fill="#58a6ff" rx="4" />
        <rect x="20" y="45" width="60" height="20" fill="#58a6ff" rx="4" />
        <rect x="30" y="20" width="40" height="20" fill="#58a6ff" rx="4" />
    </svg>
);

export default function Layout({ children, url }) {
    const navItems = [
        { path: '/', icon: SearchIcon, label: 'Search' },
        { path: '/downloads', icon: DownloadIcon, label: 'Downloads' },
        { path: '/settings', icon: SettingsIcon, label: 'Settings' },
    ];

    const isActive = (path) => {
        if (path === '/') return url === '/' || url === '/search' || url?.startsWith('/item/');
        return url?.startsWith(path);
    };

    return (
        <div class="layout">
            <aside class="sidebar">
                <div class="sidebar-header">
                    <div class="sidebar-logo">
                        <ArchiveLogo />
                        <span>IA Docker</span>
                    </div>
                </div>
                <nav class="sidebar-nav">
                    {navItems.map(item => (
                        <a
                            key={item.path}
                            class={`nav-item ${isActive(item.path) ? 'active' : ''}`}
                            href={item.path}
                        >
                            <item.icon />
                            <span>{item.label}</span>
                        </a>
                    ))}
                </nav>
                <div class="sidebar-footer">
                    <span class="version-badge">IADocker {VERSION}</span>
                </div>
            </aside>
            <main class="main-content">
                {children}
            </main>
        </div>
    );
}
