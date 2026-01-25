from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from pathlib import Path

from app.settings_defaults import DEFAULT_SETTINGS
from app.repositories import settings_repository

router = APIRouter()


class AppSettings(BaseModel):
    max_concurrent_downloads: int = DEFAULT_SETTINGS["max_concurrent_downloads"]
    # Download behavior defaults
    ignore_existing: bool = DEFAULT_SETTINGS["ignore_existing"]
    checksum: bool = DEFAULT_SETTINGS["checksum"]
    retries: int = DEFAULT_SETTINGS["retries"]
    timeout: Optional[int] = DEFAULT_SETTINGS["timeout"]
    no_change_timestamp: bool = DEFAULT_SETTINGS["no_change_timestamp"]
    on_the_fly: bool = DEFAULT_SETTINGS["on_the_fly"]
    # User convenience persistence
    last_destdir: str = DEFAULT_SETTINGS["last_destdir"]
    search_history: list[str] = []


@router.get("", response_model=AppSettings)
async def get_settings():
    """Get application settings."""
    settings = await settings_repository.get_settings()
    return AppSettings(**settings)


@router.put("", response_model=AppSettings)
async def update_settings(new_settings: AppSettings):
    """Update application settings.

    Only updates fields that were explicitly sent in the request.
    Fields not included in the request body are preserved.
    """
    # Get only fields that were explicitly set in request
    updates = new_settings.model_dump(exclude_unset=True)

    # Handle search_history specially - use field presence, not truthiness (allows empty list)
    if "search_history" in updates:
        await settings_repository.sync_search_history(updates.pop("search_history"))

    # Store only explicitly-set settings (not defaults)
    for key, value in updates.items():
        await settings_repository.set_setting(key, value)

    # Update job manager's concurrent limit ONLY if it was explicitly set
    if "max_concurrent_downloads" in updates:
        from app.services.job_manager import job_manager
        job_manager.set_max_concurrent_downloads(updates["max_concurrent_downloads"])

    return await get_settings()


@router.get("/directories")
async def list_directories(path: str = ""):
    """List directories under /data for download destination selection."""
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
