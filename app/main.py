from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path

from app.routes import auth, search, items, downloads, uploads


app = FastAPI(
    title="IA Docker GUI",
    description="Web GUI for Internet Archive CLI",
    version="1.0.0"
)

# CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routes
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(search.router, prefix="/api/search", tags=["search"])
app.include_router(items.router, prefix="/api/items", tags=["items"])
app.include_router(downloads.router, prefix="/api/downloads", tags=["downloads"])
app.include_router(uploads.router, prefix="/api/uploads", tags=["uploads"])


# Serve static files (frontend)
static_path = Path(__file__).parent / "static"
if static_path.exists():
    app.mount("/", StaticFiles(directory=static_path, html=True), name="static")


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}
