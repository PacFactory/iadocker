# IA Docker GUI

A web-based GUI wrapper for the Internet Archive `ia` CLI tool, built with Preact and FastAPI.

![IA Docker GUI](https://archive.org/services/img/internetarchive)

## Features

- 🔍 **Search** - Browse archive.org with thumbnails and titles
- 📥 **Download** - Queue downloads to your local volume
- 📤 **Upload** - Upload files with metadata
- 📋 **Metadata** - View item details and file lists
- ⚙️ **Settings** - Configure IA credentials via web UI

## Quick Start

```bash
docker compose up -d
```

Open **http://localhost:8080**

## Configuration

### Login / Authentication

1. Navigate to **Settings** in the sidebar
2. Enter your Archive.org email and password
3. Click **Save Configuration**

Credentials are stored in `/config/ia.ini` and persist across restarts.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `IA_CONFIG_FILE` | `/config/ia.ini` | Path to IA config file |
| `DOWNLOAD_DIR` | `/data` | Download destination |

## Volumes

| Path | Purpose |
|------|---------|
| `/config` | IA credentials and settings |
| `/data` | Downloaded files |

## Development

```bash
# Clone and setup
git clone <repo>
cd iadocker

# Backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Frontend
cd frontend && npm install && npm run build
cp -r dist ../app/static

# Run
cd .. && uvicorn app.main:app --port 8080 --reload
```

## Tech Stack

- **Backend**: FastAPI, Python, internetarchive library
- **Frontend**: Preact, Vite
- **Container**: Docker, multi-stage build

## License

MIT
