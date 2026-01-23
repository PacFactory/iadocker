from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path

from app.routes import auth, search, items, downloads, settings


app = FastAPI(
    title="IA Docker GUI",
    description="Web GUI for Internet Archive CLI",
    version="0.5.2"
)

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
    return {"status": "ok"}


# Register API routes BEFORE static files
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(search.router, prefix="/api/search", tags=["search"])
app.include_router(items.router, prefix="/api/items", tags=["items"])
app.include_router(downloads.router, prefix="/api/downloads", tags=["downloads"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])


# Serve static files (frontend) - MUST be last
static_path = Path(__file__).parent / "static"
if static_path.exists():
    # Serve index.html for SPA routes
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve frontend SPA - catches all non-API routes."""
        file_path = static_path / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        # Return index.html for SPA client-side routing
        return FileResponse(static_path / "index.html")
