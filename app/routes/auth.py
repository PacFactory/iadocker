from fastapi import APIRouter, HTTPException
from configparser import ConfigParser
from pathlib import Path
import os

from app.config import settings
from app.models import AuthStatus, ConfigureRequest

router = APIRouter()


@router.get("/status", response_model=AuthStatus)
async def get_auth_status():
    """Check if IA is configured and get the configured email."""
    config_path = Path(settings.ia_config_file)
    
    if not config_path.exists():
        return AuthStatus(configured=False)
    
    try:
        config = ConfigParser()
        config.read(config_path)
        email = config.get("cookies", "logged-in-user", fallback=None)
        return AuthStatus(configured=True, email=email)
    except Exception:
        return AuthStatus(configured=False)


@router.post("/configure")
async def configure_ia(request: ConfigureRequest):
    """Configure IA with email and password."""
    try:
        from internetarchive import configure
        
        # Configure IA (this will create the config file)
        configure(
            request.email,
            request.password,
            config_file=settings.ia_config_file
        )
        
        return {"success": True, "message": "Configuration saved"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
