# IA Docker GUI

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker Hub](https://img.shields.io/docker/pulls/pacfactory/iadocker)](https://hub.docker.com/r/pacnpal/iadocker)
[![GitHub Container Registry](https://img.shields.io/badge/ghcr.io-pacfactory%2Fiadocker-blue)](https://ghcr.io/pacfactory/iadocker)

Web GUI for Internet Archive downloads, built with Preact + FastAPI.

## Quick Start

```bash
# From Docker Hub
docker run -d \
  -p 8080:8080 \
  -v ./config:/config \
  -v ./data:/data \
  pacfactory/iadocker:latest

# Or from GitHub Container Registry
docker run -d \
  -p 8080:8080 \
  -v ./config:/config \
  -v ./data:/data \
  ghcr.io/pacfactory/iadocker:latest
```

Open **http://localhost:8080**

## Features

- 🔍 **Search** - Browse archive.org with filters (mediatype, collection, year)
- 📥 **Bulk Download** - Download entire items or specific files
- 📋 **File Filtering** - Search/filter files within items by type
- 🔖 **Bookmarks** - Save favorite items for quick access
- 📊 **Persistent History** - Download history survives container restarts
- ⚙️ **Settings** - Configure downloads and login via web UI

## What's New in v2.0.0

### SQLite Storage
- All data now stored in SQLite database at `/config/iadocker.db`
- Automatic migration from previous `settings.json` format
- Download history persists across container restarts
- Interrupted downloads (container restart) automatically marked as failed

### Bookmarks
- Save your favorite archive.org items
- Cached metadata for fast display (title, description, thumbnail)
- Add notes and tags to bookmarks
- Dedicated bookmarks page accessible from sidebar

## Volumes

| Path | Purpose |
|------|---------|
| `/config` | Database (`iadocker.db`), credentials (`ia.ini`) - **persists across restarts** |
| `/data` | Downloaded files |

## Login

1. Go to **Settings** in the sidebar
2. Enter your archive.org email and password
3. Click **Login & Save**

Credentials are validated with archive.org and stored locally in `/config/ia.ini`.

## Bookmarks

1. Search for an item on archive.org
2. Click on an item to view details
3. Click the **Bookmark** button to save it
4. Access all bookmarks from the **Bookmarks** page in the sidebar

## Docker Compose

```yaml
services:
  iadocker:
    image: pacfactory/iadocker:latest
    ports:
      - "8080:8080"
    volumes:
      - ./config:/config
      - ./data:/data
    restart: unless-stopped
```

## Development

```bash
# Backend
pip install -r requirements.txt
uvicorn app.main:app --port 8080 --reload

# Frontend
cd frontend && npm install && npm run build
cp -r dist ../app/static
```

## API Endpoints

### Downloads
- `POST /api/downloads` - Start a download
- `GET /api/downloads` - List active + historical downloads
- `GET /api/downloads/{job_id}` - Get specific download
- `DELETE /api/downloads/{job_id}` - Cancel a download
- `DELETE /api/downloads` - Clear download history

### Bookmarks
- `GET /api/bookmarks` - List all bookmarks
- `POST /api/bookmarks` - Create a bookmark
- `GET /api/bookmarks/{identifier}` - Get a bookmark
- `PUT /api/bookmarks/{identifier}` - Update bookmark notes/tags
- `DELETE /api/bookmarks/{identifier}` - Delete a bookmark

### Settings
- `GET /api/settings` - Get application settings
- `PUT /api/settings` - Update settings

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
