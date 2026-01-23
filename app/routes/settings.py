from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from pathlib import Path
import json

router = APIRouter()

SETTINGS_FILE = Path("/config/settings.json")

DEFAULT_SETTINGS = {
    "max_concurrent_downloads": 3,
    # Download behavior defaults
    "ignore_existing": True,  # Skip files already downloaded
    "checksum": False,  # Verify file integrity via checksum
    "retries": 5,  # Number of retries for failed downloads
    "timeout": None,  # Download timeout in seconds (None = no timeout)
    "no_change_timestamp": False,  # Don't modify timestamps to match source
    "on_the_fly": False,  # Include EPUB, MOBI, DAISY derivatives
    # User convenience persistence
    "last_destdir": "",  # Last used download destination
    "search_history": [],  # Recent search queries
}


def load_settings() -> dict:
    """Load settings from JSON file."""
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, "r") as f:
                return {**DEFAULT_SETTINGS, **json.load(f)}
        except:
            pass
    return DEFAULT_SETTINGS.copy()


def save_settings(settings: dict):
    """Save settings to JSON file."""
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(SETTINGS_FILE, "w") as f:
        json.dump(settings, f, indent=2)


class AppSettings(BaseModel):
    max_concurrent_downloads: int = 3
    # Download behavior defaults
    ignore_existing: bool = True
    checksum: bool = False
    retries: int = 5
    timeout: Optional[int] = None
    no_change_timestamp: bool = False
    on_the_fly: bool = False
    # User convenience persistence
    last_destdir: str = ""
    search_history: list[str] = []


@router.get("", response_model=AppSettings)
async def get_settings():
    """Get application settings."""
    settings = load_settings()
    return AppSettings(**settings)


@router.put("", response_model=AppSettings)
async def update_settings(new_settings: AppSettings):
    """Update application settings.
    
    Only updates fields that were explicitly sent in the request.
    Fields not included in the request body are preserved.
    """
    settings = load_settings()
    # Only update fields that were explicitly set in the request
    settings.update(new_settings.model_dump(exclude_unset=True))
    save_settings(settings)
    
    # Update the job manager's concurrent downloads limit if it was set
    if new_settings.max_concurrent_downloads is not None:
        from app.services.job_manager import job_manager
        job_manager.set_max_concurrent_downloads(settings["max_concurrent_downloads"])
    
    return AppSettings(**settings)


@router.get("/directories")
async def list_directories(path: str = ""):
    """List directories under /data for download destination selection."""
    from pathlib import Path
    
    base_path = Path("/data")
    
    # Validate and sanitize path
    clean_path = path.strip().strip('/')
    if '..' in clean_path:
        return {"directories": [], "error": "Invalid path"}
    
    target_path = (base_path / clean_path).resolve() if clean_path else base_path
    
    # Ensure path is within /data
    try:
        target_path.relative_to(base_path.resolve())
    except ValueError:
        return {"directories": [], "error": "Path outside data directory"}
    
    if not target_path.exists():
        return {"directories": [], "current": clean_path}
    
    # List subdirectories
    directories = []
    try:
        for item in sorted(target_path.iterdir()):
            if item.is_dir() and not item.name.startswith('.'):
                directories.append(item.name)
    except PermissionError:
        pass
    
    return {
        "directories": directories,
        "current": clean_path,
    }


