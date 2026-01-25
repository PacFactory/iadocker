from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import logging

from app.routes import auth, search, items, downloads, settings, bookmarks
from app.database import init_db, close_db

# Read version from .version file (single source of truth)
def _read_version():
    """Read version from .version file."""
    version_paths = [
        Path(__file__).parent.parent / ".version",  # /app/.version in Docker
        Path(__file__).parent.parent.parent / ".version",  # project root in dev
    ]
    for vpath in version_paths:
        if vpath.exists():
            return vpath.read_text().strip()
    return "0.0.0"  # fallback

VERSION = _read_version()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="IA Docker GUI",
    description="Web GUI for Internet Archive CLI",
    version=VERSION
)

@app.on_event("startup")
async def startup_event():
    logger.info(f"🚀 IA Docker GUI v{VERSION} starting up...")
    logger.info(f"📁 Static path: {Path(__file__).parent / 'static'}")

    # Initialize database
    await init_db()

    # Initialize job manager from DB (mark interrupted jobs, load settings)
    from app.services.job_manager import job_manager
    await job_manager.initialize_from_db()


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down...")
    await close_db()

# CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check MUST be before static files mount
@app.get("/api/health")
async def health_check():
    """Health check endpoint for Docker."""
    return {"status": "ok", "version": VERSION}


# Register API routes BEFORE static files
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(search.router, prefix="/api/search", tags=["search"])
app.include_router(items.router, prefix="/api/items", tags=["items"])
app.include_router(downloads.router, prefix="/api/downloads", tags=["downloads"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(bookmarks.router, prefix="/api/bookmarks", tags=["bookmarks"])


# Serve static files (frontend) - MUST be last
# In Docker: files are at /app/static (parent.parent of main.py)
# In dev: files might be at app/static (relative to cwd)
static_path = Path(__file__).parent.parent / "static"
if not static_path.exists():
    # Fallback for local dev
    static_path = Path(__file__).parent / "static"
if static_path.exists():
    # Serve index.html for SPA routes
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve frontend SPA - catches all non-API routes."""
        # Validate path is within static_path (prevent path traversal)
        file_path = (static_path / full_path).resolve()
        try:
            file_path.relative_to(static_path.resolve())
        except ValueError:
            # Path traversal attempt - serve index.html instead
            return FileResponse(static_path / "index.html")
        
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        # Return index.html for SPA client-side routing
        return FileResponse(static_path / "index.html")
