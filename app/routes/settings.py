from fastapi import APIRouter
from pydantic import BaseModel
from pathlib import Path
import json

router = APIRouter()

SETTINGS_FILE = Path("/config/settings.json")

DEFAULT_SETTINGS = {
    "max_concurrent_downloads": 3,
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


@router.get("", response_model=AppSettings)
async def get_settings():
    """Get application settings."""
    settings = load_settings()
    return AppSettings(**settings)


@router.put("", response_model=AppSettings)
async def update_settings(new_settings: AppSettings):
    """Update application settings."""
    settings = load_settings()
    settings.update(new_settings.model_dump())
    save_settings(settings)
    
    # Update the job manager's concurrent downloads limit
    from app.services.job_manager import job_manager
    job_manager.set_max_concurrent_downloads(new_settings.max_concurrent_downloads)
    
    return AppSettings(**settings)
