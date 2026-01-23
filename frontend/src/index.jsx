import { render } from 'preact';
import Router from 'preact-router';
import { useState, useEffect } from 'preact/hooks';
import './index.css';

import Layout from './components/Layout';
import Search from './pages/Search';
import Item from './pages/Item';
import Downloads from './pages/Downloads';
import Uploads from './pages/Uploads';
import Settings from './pages/Settings';

function App() {
    return (
        <Layout>
            <Router>
                <Search path="/" />
                <Search path="/search" />
                <Item path="/item/:identifier" />
                <Downloads path="/downloads" />
                <Uploads path="/uploads" />
                <Settings path="/settings" />
            </Router>
        </Layout>
    );
}

render(<App />, document.getElementById('app'));
