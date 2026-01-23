import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Read version from .version file (single source of truth)
const version = readFileSync(resolve(__dirname, '..', '.version'), 'utf-8').trim()

export default defineConfig({
    plugins: [preact()],
    define: {
        __APP_VERSION__: JSON.stringify(version)
    },
    server: {
        port: 3000,
        proxy: {
            '/api': 'http://localhost:8080'
        }
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true
    }
})
