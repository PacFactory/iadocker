import { render } from 'preact';
import Router from 'preact-router';
import { useState, useEffect } from 'preact/hooks';
import './index.css';

import Layout from './components/Layout';
import { ToastProvider } from './components/Toast';
import Search from './pages/Search';
import Item from './pages/Item';
import Downloads from './pages/Downloads';
import Settings from './pages/Settings';

function App() {
    return (
        <ToastProvider>
            <Layout>
                <Router>
                    <Search path="/" />
                    <Search path="/search" />
                    <Item path="/item/:identifier" />
                    <Downloads path="/downloads" />
                    <Settings path="/settings" />
                </Router>
            </Layout>
        </ToastProvider>
    );
}

render(<App />, document.getElementById('app'));
