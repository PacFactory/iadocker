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
        
        # Try different sections where email might be stored
        email = None
        
        # Check 's3' section for access key (indicates configured)
        if config.has_section('s3') and config.has_option('s3', 'access'):
            # IA is configured if we have s3 access key
            # Try to get email from cookies section
            if config.has_section('cookies'):
                email = config.get('cookies', 'logged-in-user', fallback=None)
            
            # If no email in cookies, check if we have a general section
            if not email and config.has_section('general'):
                email = config.get('general', 'screenname', fallback=None)
            
            return AuthStatus(configured=True, email=email)
        
        # Fallback: check cookies section
        if config.has_section('cookies') and config.has_option('cookies', 'logged-in-user'):
            email = config.get('cookies', 'logged-in-user', fallback=None)
            return AuthStatus(configured=True, email=email)
        
        return AuthStatus(configured=False)
    except Exception as e:
        print(f"Error reading config: {e}")
        return AuthStatus(configured=False)


@router.post("/configure")
async def configure_ia(request: ConfigureRequest):
    """Configure IA with email and password."""
    try:
        from internetarchive import configure
        
        # Ensure config directory exists
        config_path = Path(settings.ia_config_file)
        config_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Configure IA (this will create the config file)
        configure(
            request.email,
            request.password,
            config_file=settings.ia_config_file
        )
        
        # Verify it worked by checking the file
        if config_path.exists():
            return {"success": True, "message": "Configuration saved", "email": request.email}
        else:
            raise HTTPException(status_code=500, detail="Configuration file was not created")
            
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
