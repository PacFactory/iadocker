# IA Docker GUI

Web GUI for Internet Archive downloads, built with Preact + FastAPI.

## Quick Start

```bash
docker run -d \
  -p 8080:8080 \
  -v ./config:/config \
  -v ./data:/data \
  ghcr.io/pacfactory/iadocker:latest
```

Open **http://localhost:8080**

## Features

- 🔍 **Search** - Browse archive.org with filters (mediatype, collection, year)
- 📥 **Bulk Download** - Paste multiple URLs (one per line)
- 📋 **File Filtering** - Search/filter files within items
- ⚙️ **Settings** - Login to archive.org via web UI

## Volumes

| Path | Purpose |
|------|---------|
| `/config` | Credentials (`ia.ini`) - **persists across restarts** |
| `/data` | Downloaded files |

## Login

1. Go to **Settings** in the sidebar
2. Enter your archive.org email and password
3. Click **Login & Save**

Credentials are validated with archive.org and stored locally.

## Bulk Downloads

Paste multiple archive.org URLs (one per line):

```
https://archive.org/download/identifier1/file.zip
https://archive.org/details/identifier2
https://archive.org/download/identifier3/subdir/file.mp4
```

The app parses each URL and queues downloads.

## Docker Compose

```yaml
services:
  iadocker:
    image: ghcr.io/pacfactory/iadocker:latest
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

## License

MIT
